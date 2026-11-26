/**
 * Unit tests for the pure-JS BM25 indexer.
 * Run: node --test tests/host/test-idx.mjs
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tokenize, buildIndex, search, attachRawDocs } from '../../deeptutor-plugin/src/idx.mjs';

let workspace;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'test-idx-'));
});

after(() => {
  try { rmSync(workspace, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  test('Chinese text splits into overlapping 2-grams', () => {
    // CJK runs produce overlapping bigrams... plus unigrams for single-char
    // query recall; the four bigrams of "傅里叶变换" must all be present.
    const tokens = tokenize('傅里叶变换');
    assert.deepEqual(tokens.filter((t) => t.length === 2), ['傅里', '里叶', '叶变', '变换']);
  });

  test('single CJK char falls back to the unigram itself', () => {
    // A 1-char CJK run cannot produce a bigram; tokenize must still emit it.
    const tokens = tokenize('傅');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0], '傅');
  });

  test('English text splits on non-alpha characters and lowercases', () => {
    assert.deepEqual(tokenize('Hello World foo_bar'), ['hello', 'world', 'foo', 'bar']);
  });

  test('numbers and punctuation are ignored between alpha runs', () => {
    assert.deepEqual(tokenize('rank-2026, BM25!!'), ['rank', 'bm']);
  });

  test('mixed content produces both bigrams and alpha tokens', () => {
    const tokens = tokenize('Fourier 变换');
    assert.ok(tokens.includes('fourier'));
    // 变换 both as bigram and unigrams for short-query recall.
    assert.ok(tokens.includes('变换'));
    assert.ok(tokens.includes('变'));
    assert.ok(tokens.includes('换'));
    assert.ok(tokens.every((t) => !/\s/.test(t)), 'no whitespace tokens');
  });

  test('empty and non-string inputs return empty arrays', () => {
    assert.deepEqual(tokenize(''), []);
    assert.deepEqual(tokenize('   \n\t '), []);
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(undefined), []);
    assert.deepEqual(tokenize(123), []);
  });

  test('CJK bigrams overlap (each char appears in at least one bigram)', () => {
    const tokens = tokenize('傅里叶');
    // Overlapping bigrams: 傅里 + 里叶; unigrams repeat each char once more.
    assert.deepEqual(tokens.filter((t) => t.length === 2), ['傅里', '里叶']);
    assert.deepEqual(tokens.filter((t) => t.length === 1), ['傅', '里', '叶']);
  });
});

// ---------------------------------------------------------------------------
// buildIndex
// ---------------------------------------------------------------------------

describe('buildIndex', () => {
  const docs = [
    { path: 'fourier.md', content: 'The Fourier transform decomposes a signal into frequencies. 傅里叶变换是信号处理的基础。' },
    { path: 'laplace.md', content: 'The Laplace transform is a generalization of the Fourier transform for stability analysis.' },
    { path: 'unrelated.md', content: 'Cooking Italian pasta requires boiling water and adding salt.' },
  ];

  test('produces doc metadata, term tables and corpus stats', () => {
    const index = buildIndex(docs);
    assert.equal(index.numDocs, 3);
    assert.ok(index.avgDL > 0);
    assert.equal(index.docs['0'].path, 'fourier.md');
    assert.equal(index.docs['2'].path, 'unrelated.md');
    assert.ok(Object.keys(index.terms).length > 0);
    // The Chinese bigram terms make it into the term table.
    assert.ok(index.terms['傅里']);
    assert.ok(index.terms['变换']);
  });

  test('term postings record counts per document', () => {
    const index = buildIndex(docs);
    // "transform" appears twice in laplace.md, once in fourier.md
    assert.equal(index.terms['transform']['0'].count, 1);
    assert.equal(index.terms['transform']['1'].count, 2);
    assert.equal(index.terms['transform']['2'], undefined);
  });

  test('empty document array yields an empty but valid index', () => {
    const index = buildIndex([]);
    assert.equal(index.numDocs, 0);
    assert.equal(index.avgDL, 0);
    assert.deepEqual(Object.keys(index.terms), []);
    assert.deepEqual(Object.keys(index.docs), []);
  });

  test('queries against an empty index return nothing', () => {
    const index = buildIndex([]);
    assert.deepEqual(search(index, 'anything', 5), []);
  });
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

describe('search', () => {
  const docs = [
    { path: 'fourier.md', content: 'The Fourier transform decomposes a signal into frequencies. 傅里叶变换是信号处理的基础。' },
    { path: 'laplace.md', content: 'The Laplace transform is a generalization of the Fourier transform for stability analysis.' },
    { path: 'unrelated.md', content: 'Cooking Italian pasta requires boiling water and adding salt.' },
  ];

  test('ranks the matching document first', () => {
    const index = buildIndex(docs);
    attachRawDocs(index, docs);
    const results = search(index, 'Fourier 傅里叶', 3);
    assert.ok(results.length >= 1);
    assert.equal(results[0].file, 'fourier.md');
    assert.ok(results[0].score > 0);
  });

  test('Chinese query reaches docs via bigrams', () => {
    const index = buildIndex(docs);
    attachRawDocs(index, docs);
    const results = search(index, '傅里叶变换', 3);
    assert.ok(results.length >= 1);
    assert.equal(results[0].file, 'fourier.md');
  });

  test('empty query returns an empty result list', () => {
    // Same evidence gate as no-match queries: no keyword hits, no results.
    const index = buildIndex(docs);
    assert.deepEqual(search(index, '', 5), []);
  });

  test('BM25 weighting: common terms score lower than rare terms', () => {
    // laplace.md repeats "transform" twice while it also appears in fourier.md.
    // Searching for a rare term that only lives in laplace.md ("laplace" or
    // "stability") must beat searching for the common term "transform".
    const index = buildIndex(docs);
    const rare = search(index, 'stability', 3);
    const common = search(index, 'transform', 3);
    const rareTop = rare.find((r) => r.file === 'laplace.md')?.score ?? 0;
    const commonTop = common.find((r) => r.file === 'laplace.md')?.score ?? 0;
    assert.ok(
      rareTop > commonTop,
      `rare term score (${rareTop}) should exceed common term score (${commonTop})`,
    );
  });

  test('IDF effect: term appearing in one doc outranks term in all docs, same tf', () => {
    // "pasta" only occurs in unrelated.md; "the" occurs in both English docs.
    const index = buildIndex(docs);
    const pasta = search(index, 'pasta', 3);
    const the = search(index, 'the', 3);
    const pastaScore = pasta[0].score;
    const theScore = the.find((r) => r.file === 'unrelated.md')?.score ?? 0;
    assert.ok(pastaScore > theScore, `pasta (${pastaScore}) should outrank the (${theScore})`);
  });

  test('k parameter limits the result list', () => {
    const index = buildIndex(docs);
    assert.equal(search(index, 'transform', 1).length, 1);
    assert.equal(search(index, 'transform', 2).length, 2);
  });

  test('no-match query returns an empty result list', () => {
    // A query that hits no term must not surface unrelated documents as
    // evidence: the design treats keyword hits as the evidence gate.
    const index = buildIndex(docs);
    const results = search(index, 'zzzqqqxyzzy', 5);
    assert.equal(results.length, 0);
  });

  test('results include snippet and numeric offset when raw docs attached', () => {
    const index = buildIndex(docs);
    attachRawDocs(index, docs);
    const results = search(index, 'pasta', 1);
    assert.equal(results[0].file, 'unrelated.md');
    assert.ok(results[0].snippet.includes('pasta'));
    assert.ok(Number.isInteger(results[0].offset));
  });

  test('rejects a missing index', () => {
    assert.deepEqual(search(null, 'x', 5), []);
    assert.deepEqual(search({}, 'x', 5), []);
  });
});
