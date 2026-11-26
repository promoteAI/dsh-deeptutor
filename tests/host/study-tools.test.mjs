/**
 * Host-side tests for the pure-JS study mode plugin.
 * Run: node --test tests/host/study-tools.test.mjs
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tokenize, buildIndex, search, attachRawDocs } from '../../deeptutor-plugin/src/idx.mjs';
import {
  listRegistries,
  createRegistry,
  deleteRegistry,
  addDoc,
  searchDocs,
  readDoc,
} from '../../deeptutor-plugin/src/kb.mjs';
import {
  readWrongAnswers,
  writeWrongAnswers,
  addWrongAnswer,
  markMastered,
  schedulePractice,
  gradedAnswer,
  dueToday,
  saveLastGrade,
  getLastGrade,
} from '../../deeptutor-plugin/src/wa.mjs';

// ---------------------------------------------------------------------------
// Shared temp workspace
// ---------------------------------------------------------------------------

let workspace;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'study-test-'));
});

after(() => {
  try { rmSync(workspace, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

// ---------------------------------------------------------------------------
// idx.mjs — tokenizer
// ---------------------------------------------------------------------------

describe('idx.tokenize', () => {
  test('Chinese text splits into overlapping 2-grams', () => {
    const tokens = tokenize('傅里叶变换');
    assert.ok(tokens.includes('傅里'));
    assert.ok(tokens.includes('里叶'));
    assert.ok(tokens.includes('叶变'));
    assert.ok(tokens.includes('变换'));
  });

  test('English text splits on non-alpha characters and lowercases', () => {
    const tokens = tokenize('Hello World foo_bar');
    assert.deepEqual(tokens.filter((t) => t.includes('-') === false && t !== ''), [
      'hello', 'world', 'foo', 'bar',
    ]);
  });

  test('mixed content produces both kinds of tokens', () => {
    const tokens = tokenize('Fourier 变换 transform');
    assert.ok(tokens.includes('fourier'));
    assert.ok(tokens.includes('变换'));
    assert.ok(tokens.includes('transform'));
  });

  test('empty and non-string inputs return empty arrays', () => {
    assert.deepEqual(tokenize(''), []);
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// idx.mjs — buildIndex and search
// ---------------------------------------------------------------------------

describe('idx.buildIndex + search', () => {
  const docs = [
    { path: 'fourier.md', content: 'The Fourier transform decomposes a signal into frequencies. 傅里叶变换是信号处理的基础。' },
    { path: 'laplace.md', content: 'The Laplace transform is a generalization of the Fourier transform for stability analysis.' },
    { path: 'unrelated.md', content: 'Cooking Italian pasta requires boiling water and adding salt.' },
  ];

  test('builds an index with terms, doc metadata, numDocs and avgDL', () => {
    const index = buildIndex(docs);
    assert.equal(index.numDocs, 3);
    assert.ok(index.avgDL > 0);
    assert.ok(index.docs['0']);
    assert.equal(index.docs['0'].path, 'fourier.md');
    assert.ok(Object.keys(index.terms).length > 0);
  });

  test('search ranks the matching document first', () => {
    const index = buildIndex(docs);
    attachRawDocs(index, docs);
    // Query includes the distinctive bigram "傅里叶" so fourier.md is the clear winner.
    const results = search(index, 'Fourier 傅里叶', 3);
    assert.ok(results.length >= 1);
    assert.equal(results[0].file, 'fourier.md');
    assert.ok(results[0].score > 0);
    assert.ok(typeof results[0].snippet === 'string');
    assert.ok(typeof results[0].offset === 'number');
  });

  test('Chinese query uses bigrams to find matching document', () => {
    const index = buildIndex(docs);
    attachRawDocs(index, docs);
    const results = search(index, '傅里叶变换', 3);
    assert.ok(results.length >= 1);
    assert.equal(results[0].file, 'fourier.md');
  });

  test('empty query returns no docs (evidence gate: hits only)', () => {
    const index = buildIndex(docs);
    const results = search(index, '', 5);
    assert.deepEqual(results, []);
  });

  test('k parameter limits results', () => {
    const index = buildIndex(docs);
    const results = search(index, 'transform', 1);
    assert.equal(results.length, 1);
  });

  test('search with no matches returns an empty list', () => {
    const index = buildIndex(docs);
    const results = search(index, 'zzzqqqxyzzy', 5);
    assert.deepEqual(results, []);
  });
});

// ---------------------------------------------------------------------------
// kb.mjs — knowledge base
// ---------------------------------------------------------------------------

describe('kb', () => {
  test('createRegistry + listRegistries roundtrip', () => {
    createRegistry(workspace, 'math', 'Math study material');
    const all = listRegistries(workspace);
    const found = all.find((k) => k.name === 'math');
    assert.ok(found, 'registry entry exists');
    assert.equal(found.description, 'Math study material');
    assert.equal(found.docCount, 0);
    assert.equal(found.isDefault, false);
  });

  test('createRegistry rejects duplicates', () => {
    assert.throws(() => createRegistry(workspace, 'math', 'dup'));
  });

  test('addDoc writes raw file and builds index', () => {
    const result = addDoc(
      workspace,
      'math',
      'Fourier Basics',
      '傅里叶变换将时域信号分解为频域分量。Fourier transform is the foundation of signal processing.',
    );
    assert.equal(result.ok, true);
    const rawFile = join(workspace, '.study', 'kb', 'math', 'raw', 'fourier-basics.md');
    assert.ok(existsSync(rawFile), 'raw file written');
    const indexFile = join(workspace, '.study', 'kb', 'math', 'index.json');
    assert.ok(existsSync(indexFile), 'index written');
    const parsed = JSON.parse(readFileSync(indexFile, 'utf8'));
    assert.equal(parsed.numDocs, 1);
  });

  test('addDoc throws for unknown KB', () => {
    assert.throws(() => addDoc(workspace, 'nonexistent-kb', 'T', 'C'));
  });

  test('searchDocs finds the added doc', () => {
    const results = searchDocs(workspace, 'math', '傅里叶', 5);
    assert.ok(results.length >= 1);
    assert.equal(results[0].file, 'fourier-basics.md');
  });

  test('searchDocs on a KB with no index returns empty array', () => {
    const results = searchDocs(workspace, 'empty-never-created', 'anything');
    assert.deepEqual(results, []);
  });

  test('readDoc returns content of an added doc', () => {
    const doc = readDoc(workspace, 'math', 'fourier-basics');
    assert.ok(doc.text.includes('Fourier transform'));
    assert.equal(doc.truncated, false);
  });

  test('readDoc returns empty for a missing file', () => {
    const doc = readDoc(workspace, 'math', 'does-not-exist');
    assert.equal(doc.text, '');
  });

  test('listRegistries reflects docCount after addDoc', () => {
    const all = listRegistries(workspace);
    const math = all.find((k) => k.name === 'math');
    assert.equal(math.docCount, 1);
  });

  test('deleteRegistry removes the entry and the data directory', () => {
    createRegistry(workspace, 'tempkb', 'to be deleted');
    addDoc(workspace, 'tempkb', 'Some Doc', 'Some content here.');
    const result = deleteRegistry(workspace, 'tempkb');
    assert.equal(result.ok, true);
    assert.ok(!listRegistries(workspace).some((k) => k.name === 'tempkb'));
    assert.ok(!existsSync(join(workspace, '.study', 'kb', 'tempkb')));
  });
});

// ---------------------------------------------------------------------------
// wa.mjs — wrong-answer notebook
// ---------------------------------------------------------------------------

describe('wa', () => {
  test('readWrongAnswers initializes an empty v2 store', () => {
    const data = readWrongAnswers(workspace);
    assert.equal(data.version, 2);
    assert.deepEqual(data.items, []);
  });

  test('addWrongAnswer appends with generated id and due date +1 day', () => {
    const result = addWrongAnswer(workspace, {
      topic: 'fourier',
      question: 'What does the Fourier transform do?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
      userAnswer: 0,
      correctAnswer: 'C',
      explanation: 'It decomposes signals into frequency components.',
    });
    assert.equal(result.ok, true);
    const data = readWrongAnswers(workspace);
    assert.equal(data.items.length, 1);
    const item = data.items[0];
    assert.equal(item.id, 'wa-000001');
    assert.equal(item.intervalDays, 1);
    assert.equal(item.mastered, false);
    const wrong = new Date(item.wrongAt).getTime();
    const due = new Date(item.dueAt).getTime();
    assert.ok(due - wrong >= 23 * 3600 * 1000, 'dueAt is roughly wrongAt + 1 day');
  });

  test('gradedAnswer wrong resets interval to 1 and unmasters', () => {
    const item = readWrongAnswers(workspace).items[0];
    const r = gradedAnswer(workspace, item.id, false);
    assert.equal(r.correct, false);
    assert.equal(r.intervalDays, 1);
    assert.equal(r.mastered, false);
  });

  test('gradedAnswer correct advances interval along the [1,3,7,21] ladder', () => {
    const id = readWrongAnswers(workspace).items[0].id;
    gradedAnswer(workspace, id, true); // 1 → 3
    assert.equal(readWrongAnswers(workspace).items[0].intervalDays, 3);
    gradedAnswer(workspace, id, true); // 3 → 7
    assert.equal(readWrongAnswers(workspace).items[0].intervalDays, 7);
    gradedAnswer(workspace, id, true); // 7 → 21 (last rung, auto-mastered)
    const item = readWrongAnswers(workspace).items[0];
    assert.equal(item.intervalDays, 21);
    assert.equal(item.mastered, true);
    assert.ok(item.masteredAt);
  });

  test('gradedAnswer wrong after mastering unmasters (解除掌握)', () => {
    const item = readWrongAnswers(workspace).items[0];
    assert.equal(item.mastered, true);
    gradedAnswer(workspace, item.id, false);
    const after = readWrongAnswers(workspace).items[0];
    assert.equal(after.mastered, false);
    assert.equal(after.intervalDays, 1);
    assert.equal(after.masteredAt, null);
  });

  test('markMastered sets mastered with masteredAt', () => {
    const item = readWrongAnswers(workspace).items[0];
    const r = markMastered(workspace, item.id);
    assert.equal(r.ok, true);
    const after = readWrongAnswers(workspace).items[0];
    assert.equal(after.mastered, true);
    assert.ok(after.masteredAt);
  });

  test('schedulePractice pulls dueAt to now and resets interval', () => {
    const item = readWrongAnswers(workspace).items[0];
    const before = new Date(item.dueAt).getTime();
    const r = schedulePractice(workspace, item.id);
    assert.equal(r.ok, true);
    const after = readWrongAnswers(workspace).items[0];
    assert.equal(after.intervalDays, 1);
    assert.ok(new Date(after.dueAt).getTime() <= Math.max(before, Date.now()) + 1000);
  });

  test('dueToday returns only non-mastered overdue items', () => {
    const data = readWrongAnswers(workspace);
    // Force an item to be due.
    writeWrongAnswers(workspace, data.items.map((it) =>
      it.id === data.items[0].id ? { ...it, dueAt: new Date(Date.now() - 3600_000).toISOString() } : it,
    ));
    const due = dueToday(workspace);
    assert.ok(due.some((it) => it.id === data.items[0].id));
    // Mastered items are excluded.
    writeWrongAnswers(workspace, data.items.map((it) => ({ ...it, mastered: true })));
    assert.deepEqual(dueToday(workspace), []);
  });

  test('grade result roundtrip via saveLastGrade/getLastGrade', () => {
    saveLastGrade(workspace, { score: 3, total: 5, wrongCount: 2, perQuestion: [], wrongItems: [] });
    const grade = getLastGrade(workspace);
    assert.equal(grade.score, 3);
    assert.equal(grade.total, 5);
    assert.equal(grade.wrongCount, 2);
    assert.ok(grade.savedAt);
  });

  test('interval arithmetic survives month boundary (Jan 31 + N days)', () => {
    const data = readWrongAnswers(workspace);
    const probe = {
      topic: 'month-boundary',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
      userAnswer: 0,
      correctAnswer: '4',
      explanation: 'basic arithmetic',
      wrongAt: '2026-01-31T23:00:00.000Z',
      dueAt: '2026-02-01T23:00:00.000Z',
      intervalDays: 1,
    };
    const r = addWrongAnswer(workspace, probe);
    const item = readWrongAnswers(workspace).items.find((it) => it.id === r.id);
    assert.ok(item.dueAt >= '2026-01-31');
    // Advance twice; dueAt must stay a valid ISO date.
    gradedAnswer(workspace, r.id, true);
    gradedAnswer(workspace, r.id, true);
    const after = readWrongAnswers(workspace).items.find((it) => it.id === r.id);
    assert.ok(!Number.isNaN(new Date(after.dueAt).getTime()));
  });
});

// ---------------------------------------------------------------------------
// wa.mjs — atomic write leaves no tmp files behind
// ---------------------------------------------------------------------------

describe('atomic writes', () => {
  test('no .tmp- files remain in .study after writes', () => {
    readWrongAnswers(workspace); // triggers a write, ensures dir exists
    const studyDir = join(workspace, '.study');
    const entries = readdirSync(studyDir);
    assert.ok(!entries.some((f) => f.startsWith('.tmp-')), 'no tmp leftovers');
  });
});
