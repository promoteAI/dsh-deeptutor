/**
 * Unit tests for the knowledge-base storage module.
 * Run: node --test tests/host/test-kb.mjs
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listRegistries,
  createRegistry,
  deleteRegistry,
  addDoc,
  searchDocs,
  readDoc,
} from '../../deeptutor-plugin/src/kb.mjs';

let workspace;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'test-kb-'));
});

after(() => {
  try { rmSync(workspace, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

// ---------------------------------------------------------------------------
// createRegistry
// ---------------------------------------------------------------------------

describe('createRegistry', () => {
  test('creates a new KB entry in the registry file', () => {
    const r = createRegistry(workspace, '物理', '高中物理核心知识点');
    assert.equal(r.name, '物理');
    assert.ok(r.createdAt);
    const reg = JSON.parse(readFileSync(join(workspace, '.study', 'kb', 'kb_registry.json'), 'utf8'));
    const entry = reg.knowledgeBases.find((k) => k.name === '物理');
    assert.ok(entry, 'registry entry persisted');
    assert.equal(entry.description, '高中物理核心知识点');
    assert.equal(entry.isDefault, false);
  });

  test('multiple KBs can coexist', () => {
    createRegistry(workspace, 'math', '数学');
    const all = listRegistries(workspace);
    assert.ok(all.some((k) => k.name === '物理'));
    assert.ok(all.some((k) => k.name === 'math'));
  });

  test('duplicate name is rejected', () => {
    assert.throws(() => createRegistry(workspace, '物理', 'dup'), /already exists/);
  });

  test('empty/invalid name is rejected', () => {
    assert.throws(() => createRegistry(workspace, '', 'no name'));
    assert.throws(() => createRegistry(workspace, null, 'no name'));
  });

  test('name characters illegal on filesystems are sanitized', () => {
    createRegistry(workspace, 'a/b:c?', 'sanitized');
    const all = listRegistries(workspace);
    assert.ok(all.some((k) => k.name === 'a_b_c_'), `got ${JSON.stringify(all.map((k) => k.name))}`);
  });
});

// ---------------------------------------------------------------------------
// addDoc
// ---------------------------------------------------------------------------

describe('addDoc', () => {
  test('writes the raw markdown file and rebuilds the index', () => {
    const content = '傅里叶变换将时域信号分解为频域分量。Fourier transform decomposes signals.';
    const r = addDoc(workspace, '物理', '傅里叶变换', content);
    assert.equal(r.ok, true);
    assert.ok(r.slug.length > 0);

    const kbDir = join(workspace, '.study', 'kb', '物理');
    assert.ok(existsSync(join(kbDir, 'raw')), 'raw dir created');
    const files = readdirSync(join(kbDir, 'raw'));
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('.md'));
    assert.equal(readFileSync(join(kbDir, 'raw', files[0]), 'utf8'), content);

    const indexFile = join(kbDir, 'index.json');
    assert.ok(existsSync(indexFile), 'index.json written');
    const index = JSON.parse(readFileSync(indexFile, 'utf8'));
    assert.equal(index.numDocs, 1);
    assert.ok(index.terms['傅里'], 'CJK bigrams are indexed');
  });

  test('a second doc bumps numDocs and refreshes the registry updatedAt', () => {
    addDoc(workspace, '物理', '电磁感应', '法拉第电磁感应定律 E = -dΦ/dt。');
    const index = JSON.parse(readFileSync(join(workspace, '.study', 'kb', '物理', 'index.json'), 'utf8'));
    assert.equal(index.numDocs, 2);
    const entry = JSON.parse(readFileSync(join(workspace, '.study', 'kb', 'kb_registry.json'), 'utf8'))
      .knowledgeBases.find((k) => k.name === '物理');
    assert.ok(entry.updatedAt);
  });

  test('registry docCount reflects the number of raw files', () => {
    const math = listRegistries(workspace).find((k) => k.name === '物理');
    assert.equal(math.docCount, 2);
  });

  test('adding to an unknown KB throws', () => {
    assert.throws(() => addDoc(workspace, 'no-such-kb', 'T', 'C'), /does not exist/);
  });
});

// ---------------------------------------------------------------------------
// searchDocs
// ---------------------------------------------------------------------------

describe('searchDocs', () => {
  test('returns relevant snippets for Chinese and English queries', () => {
    const zh = searchDocs(workspace, '物理', '傅里叶变换', 5);
    assert.ok(zh.length >= 1);
    assert.equal(zh[0].file.endsWith('.md'), true, 'result carries the file name');
    assert.ok(zh[0].snippet.includes('傅里叶'), 'snippet contains matching text');
    assert.ok(typeof zh[0].score === 'number');
    assert.equal(zh[0].kb, '物理');

    const en = searchDocs(workspace, '物理', 'Fourier transform', 5);
    assert.ok(en.length >= 1);
    assert.ok(en[0].snippet.length > 0);
  });

  test('every result carries the kb name', () => {
    const results = searchDocs(workspace, '物理', '电磁', 5);
    assert.ok(results.length >= 1);
    assert.ok(results.every((r) => r.kb === '物理'));
  });

  test('no-hit query still returns baseline-ranked docs (not an error)', () => {
    const results = searchDocs(workspace, '物理', 'zzzqqqxyzzy', 5);
    assert.ok(Array.isArray(results));
  });

  test('unknown KB returns an empty array rather than throwing', () => {
    assert.deepEqual(searchDocs(workspace, 'never-created-kb', 'anything', 5), []);
  });
});

// ---------------------------------------------------------------------------
// readDoc
// ---------------------------------------------------------------------------

describe('readDoc', () => {
  test('returns the stored text', () => {
    const doc = readDoc(workspace, '物理', '傅里叶变换');
    assert.ok(doc.text.includes('频域分量'));
    assert.equal(doc.truncated, false);
  });

  test('missing file yields empty text, truncated=false', () => {
    const doc = readDoc(workspace, '物理', 'no-such-file');
    assert.equal(doc.text, '');
    assert.equal(doc.truncated, false);
  });
});

// ---------------------------------------------------------------------------
// listRegistries
// ---------------------------------------------------------------------------

describe('listRegistries', () => {
  test('empty workspace yields an empty list', () => {
    const ws = join(workspace, 'empty-ws');
    assert.deepEqual(listRegistries(ws), []);
  });

  test('entries carry name, description, timestamps and docCount', () => {
    const ws = join(workspace, 'fields-ws');
    createRegistry(ws, 'hist', '历史');
    addDoc(ws, 'hist', 'WW2', 'World war II ended in 1945.');
    const entry = listRegistries(ws).find((k) => k.name === 'hist');
    assert.equal(entry.description, '历史');
    assert.equal(entry.docCount, 1);
    assert.ok(entry.createdAt);
    assert.ok(entry.updatedAt);
    assert.equal(entry.isDefault, false);
  });
});

// ---------------------------------------------------------------------------
// deleteRegistry
// ---------------------------------------------------------------------------

describe('deleteRegistry', () => {
  test('removes the registry entry and all KB data on disk', () => {
    createRegistry(workspace, 'tempkb', 'to be deleted');
    addDoc(workspace, 'tempkb', 'Some Doc', 'Some content here.');

    assert.ok(existsSync(join(workspace, '.study', 'kb', 'tempkb')));
    const r = deleteRegistry(workspace, 'tempkb');
    assert.equal(r.ok, true);

    assert.ok(!listRegistries(workspace).some((k) => k.name === 'tempkb'));
    assert.ok(!existsSync(join(workspace, '.study', 'kb', 'tempkb')), 'KB directory removed');
  });

  test('other KBs survive a delete', () => {
    assert.ok(listRegistries(workspace).some((k) => k.name === '物理'));
  });

  test('deleting an unknown KB throws', () => {
    assert.throws(() => deleteRegistry(workspace, 'ghost-kb'), /not found/);
  });

  test('deleting from a workspace without a registry throws', () => {
    const ws = join(workspace, 'no-registry-ws');
    assert.throws(() => deleteRegistry(ws, 'anything'), /registry/i);
  });
});
