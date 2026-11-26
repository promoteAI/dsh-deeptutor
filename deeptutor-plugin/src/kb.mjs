/**
 * Knowledge-base storage module.
 *
 * Data layout inside a workspace:
 *   <workspace>/.study/kb/<kbName>/raw/<slug>.md        # Document source
 *   <workspace>/.study/kb/<kbName>/index.json            # Inverted index
 *   <workspace>/.study/kb/kb_registry.json               # Registry of KB names
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { buildIndex, search as bm25Search, attachRawDocs } from './idx.mjs';

// ---------------------------------------------------------------------------
// Filesystem helpers (atomic writes using tmp+rename)
// ---------------------------------------------------------------------------

function writeJsonAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = join(dirname(filePath), `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch (_) { /* ignore */ }
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    throw err;
  }
}

function readJsonSafe(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Atomic write of raw text (tmp + rename), used for markdown documents. */
function writeTextAtomic(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = join(dirname(filePath), `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    writeFileSync(tmpPath, text, 'utf8');
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch (_) { /* ignore */ }
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Path construction
// ---------------------------------------------------------------------------

function studyRoot(workspace) {
  return join(workspace, '.study');
}

function kbDir(workspace, kbName) {
  return join(studyRoot(workspace), 'kb', sanitizeName(kbName));
}

function rawDir(workspace, kbName) {
  return join(kbDir(workspace, kbName), 'raw');
}

function indexPath(workspace, kbName) {
  return join(kbDir(workspace, kbName), 'index.json');
}

function registryPath(workspace) {
  return join(studyRoot(workspace), 'kb', 'kb_registry.json');
}

function sanitizeName(name) {
  if (!name) return '';
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
}

function titleToSlug(title) {
  return title
    .replace(/[^\w一-鿿\s-]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all registered knowledge bases with summary info.
 */
export function listRegistries(workspace) {
  const reg = readJsonSafe(registryPath(workspace));
  if (!reg || !Array.isArray(reg.knowledgeBases)) return [];

  return reg.knowledgeBases.map((kb) => {
    const rawD = rawDir(workspace, kb.name);
    let docCount = 0;
    if (existsSync(rawD)) {
      try {
        docCount = readdirSync(rawD).filter((f) => f.endsWith('.md')).length;
      } catch { /* ignore */ }
    }
    return {
      name: kb.name,
      description: kb.description || '',
      createdAt: kb.createdAt || '',
      updatedAt: kb.updatedAt || '',
      docCount,
      isDefault: kb.isDefault === true,
    };
  });
}

/**
 * Create a new knowledge base entry in the registry.
 */
export function createRegistry(workspace, name, description = '') {
  const reg = readJsonSafe(registryPath(workspace)) || { knowledgeBases: [], defaultKb: null };
  const safeName = sanitizeName(name);
  if (!safeName) throw new Error('Invalid KB name');
  if (reg.knowledgeBases.some((kb) => kb.name === safeName)) {
    throw new Error(`Knowledge base "${safeName}" already exists`);
  }
  const now = new Date().toISOString();
  reg.knowledgeBases.push({ name: safeName, description, createdAt: now, updatedAt: now, isDefault: false });
  writeJsonAtomic(registryPath(workspace), reg);
  return { name: safeName, createdAt: now };
}

/**
 * Delete a knowledge base (registry entry + all data on disk).
 */
export function deleteRegistry(workspace, name) {
  const safeName = sanitizeName(name);
  const reg = readJsonSafe(registryPath(workspace));
  if (!reg || !reg.knowledgeBases) throw new Error('No registry found');

  const idx = reg.knowledgeBases.findIndex((kb) => kb.name === safeName);
  if (idx === -1) throw new Error(`Knowledge base "${safeName}" not found`);

  reg.knowledgeBases.splice(idx, 1);
  if (reg.defaultKb === safeName) {
    reg.defaultKb = reg.knowledgeBases[0]?.name || null;
  }
  writeJsonAtomic(registryPath(workspace), reg);

  const kbDirPath = kbDir(workspace, safeName);
  try { rmSync(kbDirPath, { recursive: true, force: true }); } catch (_) { /* ignore */ }

  return { ok: true, name: safeName };
}

/**
 * Add a document to a knowledge base. Creates dirs and rebuilds the BM25 index.
 */
export function addDoc(workspace, kbName, title, content) {
  const safeName = sanitizeName(kbName);
  const reg = readJsonSafe(registryPath(workspace));
  if (!reg || !reg.knowledgeBases?.some((kb) => kb.name === safeName)) {
    throw new Error(`Knowledge base "${safeName}" does not exist`);
  }

  const slug = titleToSlug(title);
  const filePath = join(rawDir(workspace, safeName), `${slug}.md`);
  writeTextAtomic(filePath, content);

  rebuildIndex(workspace, safeName);

  reg.knowledgeBases = reg.knowledgeBases.map((kb) =>
    kb.name === safeName ? { ...kb, updatedAt: new Date().toISOString() } : kb,
  );
  writeJsonAtomic(registryPath(workspace), reg);

  return { ok: true, path: filePath, slug };
}

/**
 * Search a knowledge base using BM25.
 */
export function searchDocs(workspace, kbName, query, k = 5) {
  const safeName = sanitizeName(kbName);
  const index = loadIndex(workspace, safeName);
  if (!index) return [];
  return bm25Search(index, query, k).map((r) => ({ ...r, kb: safeName }));
}

/**
 * Read a document file from a knowledge base.
 */
export function readDoc(workspace, kbName, file) {
  const safeName = sanitizeName(kbName);
  const rawD = rawDir(workspace, safeName);
  if (!existsSync(rawD)) return { text: '', truncated: false };

  const candidates = [file, `${file}.md`, titleToSlug(file)];
  const found = readdirSync(rawD)
    .filter((f) =>
      candidates.some(
        (c) => f === c || f === `${c}.md` || titleToSlug(f.replace(/\.md$/, '')) === c,
      ),
    )
    .at(0);

  if (!found) return { text: '', truncated: false };
  const text = readFileSync(join(rawD, found), 'utf8');
  const TRUNCATE = 8000;
  return { text, truncated: text.length > TRUNCATE };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadIndex(workspace, kbName) {
  const p = indexPath(workspace, kbName);
  const index = readJsonSafe(p);
  if (!index) return null;
  const rawD = rawDir(workspace, kbName);
  if (!existsSync(rawD)) return index;
  const docs = readdirSync(rawD)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ path: f, content: readFileSync(join(rawD, f), 'utf8') }));
  attachRawDocs(index, docs);
  return index;
}

function rebuildIndex(workspace, kbName) {
  const rawD = rawDir(workspace, kbName);
  mkdirSync(rawD, { recursive: true });
  const files = readdirSync(rawD).filter((f) => f.endsWith('.md'));
  const docs = files.map((f) => ({
    path: f,
    content: readFileSync(join(rawD, f), 'utf8'),
  }));
  const index = buildIndex(docs);
  attachRawDocs(index, docs);
  writeJsonAtomic(indexPath(workspace, kbName), index);
}
