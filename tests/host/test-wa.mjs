/**
 * Unit tests for the wrong-answer notebook (spaced repetition store).
 * Run: node --test tests/host/test-wa.mjs
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readWrongAnswers,
  writeWrongAnswers,
  addWrongAnswer,
  gradedAnswer,
  markMastered,
  schedulePractice,
  dueToday,
} from '../../deeptutor-plugin/src/wa.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

let workspace;

before(() => {
  workspace = mkdtempSync(join(tmpdir(), 'test-wa-'));
});

after(() => {
  try { rmSync(workspace, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

/** A minimal valid wrong-answer payload. */
function sampleItem(overrides = {}) {
  return {
    topic: 'fourier',
    question: 'What does the Fourier transform do?',
    options: ['Heats signals', 'Decomposes signals into frequencies', 'Multiplies signals', 'Ignores signals'],
    correctIndex: 1,
    userAnswer: 0,
    correctAnswer: 'Decomposes signals into frequencies',
    explanation: 'FT maps time domain to frequency domain.',
    ...overrides,
  };
}

/** Read the underlying JSON file directly. */
function readRawFile() {
  return JSON.parse(readFileSync(join(workspace, '.study', 'wrong-answers.json'), 'utf8'));
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

describe('initialization', () => {
  test('first call creates the JSON file with schema v2 and empty items', () => {
    assert.equal(existsSync(join(workspace, '.study', 'wrong-answers.json')), false);
    const data = readWrongAnswers(workspace);
    assert.equal(data.version, 2);
    assert.deepEqual(data.items, []);
    assert.equal(existsSync(join(workspace, '.study', 'wrong-answers.json')), true);
    assert.ok(!existsSync(join(workspace, '.study', 'last-grade.json')), 'last-grade.json not created yet');
  });

  test('existing store is returned as-is (no reset on re-read)', () => {
    addWrongAnswer(workspace, sampleItem());
    const first = readWrongAnswers(workspace);
    const second = readWrongAnswers(workspace);
    assert.equal(second.items.length, first.items.length);
    assert.equal(second.version, 2);
  });
});

// ---------------------------------------------------------------------------
// addWrongAnswer
// ---------------------------------------------------------------------------

describe('addWrongAnswer', () => {
  test('full field set is written (id, topic, question, options[4], correctIndex, explanation, wrongAt, dueAt, intervalDays, mastered)', () => {
    const r = addWrongAnswer(workspace, sampleItem());
    assert.equal(r.ok, true);
    const item = readWrongAnswers(workspace).items.at(-1);
    assert.match(item.id, /^wa-\d{6}$/);
    assert.equal(item.topic, 'fourier');
    assert.equal(item.question, 'What does the Fourier transform do?');
    assert.deepEqual(item.options, [
      'Heats signals',
      'Decomposes signals into frequencies',
      'Multiplies signals',
      'Ignores signals',
    ]);
    assert.equal(item.options.length, 4);
    assert.equal(item.correctIndex, 1);
    assert.equal(item.explanation, 'FT maps time domain to frequency domain.');
    assert.ok(item.wrongAt, 'wrongAt stamped');
    assert.ok(item.dueAt, 'dueAt stamped');
    // dueAt = wrongAt + 1 day (initial interval).
    const span = new Date(item.dueAt).getTime() - new Date(item.wrongAt).getTime();
    assert.ok(Math.abs(span - DAY_MS) < 5000, `dueAt ≈ wrongAt + 1 day (got ${span}ms)`);
    assert.equal(item.intervalDays, 1);
    assert.equal(item.mastered, false);
    assert.equal(item.masteredAt, null);
    assert.equal(item.userAnswer, 0);
    assert.equal(item.correctAnswer, 'Decomposes signals into frequencies');
  });

  test('ids increment across appends', () => {
    const a = addWrongAnswer(workspace, sampleItem({ question: 'q2' }));
    const b = addWrongAnswer(workspace, sampleItem({ question: 'q3' }));
    const toNum = (id) => parseInt(id.replace(/^wa-/, ''), 10);
    assert.ok(toNum(b.id) > toNum(a.id));
    assert.ok(toNum(a.id) > 1);
  });

  test('malformed options are clamped to 4 entries', () => {
    addWrongAnswer(workspace, sampleItem({ options: ['only one'] }));
    assert.equal(readWrongAnswers(workspace).items.at(-1).options.length, 4);
    addWrongAnswer(workspace, sampleItem({ options: 'not-an-array' }));
    assert.deepEqual(readWrongAnswers(workspace).items.at(-1).options, ['', '', '', '']);
  });
});

// ---------------------------------------------------------------------------
// gradedAnswer — interval ladder [1, 3, 7, 21]
// ---------------------------------------------------------------------------

describe('gradedAnswer interval advancement', () => {
  test('correct advances along the [1, 3, 7, 21] ladder with auto-master at 21', () => {
    addWrongAnswer(workspace, sampleItem());
    const id = readWrongAnswers(workspace).items.at(-1).id;
    const read = () => readWrongAnswers(workspace).items.find((it) => it.id === id);

    for (const expected of [3, 7, 21]) {
      const r = gradedAnswer(workspace, id, true);
      assert.equal(r.correct, true);
      assert.equal(r.intervalDays, expected, `interval should be ${expected} after a correct answer`);
      assert.equal(read().intervalDays, expected);
      // dueAt pushed out by the new interval.
      assert.ok(
        new Date(r.dueAt).getTime() > Date.now() + (expected - 1) * DAY_MS,
        `dueAt ≈ now + ${expected} days`,
      );
    }
    const final = read();
    assert.equal(final.intervalDays, 21);
    assert.equal(final.mastered, true, 'auto-mastered at the 21-day rung');
    assert.ok(final.masteredAt);
  });

  test('wrong resets intervalDays to 1 and clears mastery', () => {
    addWrongAnswer(workspace, sampleItem());
    const id = readWrongAnswers(workspace).items.at(-1).id;
    gradedAnswer(workspace, id, true); // 1 → 3
    const r = gradedAnswer(workspace, id, false);
    assert.equal(r.correct, false);
    assert.equal(r.intervalDays, 1);
    assert.equal(r.mastered, false);
    const item = readWrongAnswers(workspace).items.find((it) => it.id === id);
    assert.equal(item.intervalDays, 1);
    assert.equal(item.mastered, false);
    assert.equal(item.masteredAt, null);
    // dueAt pulled back to (about) now.
    assert.ok(new Date(item.dueAt).getTime() <= Date.now() + 5000);
  });

  test('boundary: correct answer when intervalDays is already 21 stays at 21 and re-confirms mastery', () => {
    addWrongAnswer(workspace, sampleItem({ correctIndex: 2, userAnswer: 2 }));
    const id = readWrongAnswers(workspace).items.at(-1).id;
    gradedAnswer(workspace, id, true); // 1 → 3
    gradedAnswer(workspace, id, true); // 3 → 7
    gradedAnswer(workspace, id, true); // 7 → 21, auto-master
    const r = gradedAnswer(workspace, id, true); // already 21
    assert.equal(r.intervalDays, 21, 'stays on the last rung');
    assert.equal(r.mastered, true);
    const item = readWrongAnswers(workspace).items.find((it) => it.id === id);
    assert.equal(item.mastered, true);
    assert.ok(item.masteredAt);
  });

  test('auto-mastered item that is answered wrong un-master and return to 1 day', () => {
    addWrongAnswer(workspace, sampleItem());
    const id = readWrongAnswers(workspace).items.at(-1).id;
    gradedAnswer(workspace, id, true);
    gradedAnswer(workspace, id, true);
    gradedAnswer(workspace, id, true);
    gradedAnswer(workspace, id, true); // 21, mastered
    assert.equal(readWrongAnswers(workspace).items.at(-1).mastered, true);

    const r = gradedAnswer(workspace, id, false);
    assert.equal(r.intervalDays, 1);
    assert.equal(r.mastered, false);
    const item = readWrongAnswers(workspace).items.at(-1);
    assert.equal(item.mastered, false);
    assert.equal(item.masteredAt, null);
  });

  test('off-ladder legacy interval values snap forward to the next ladder rung', () => {
    addWrongAnswer(workspace, sampleItem());
    const id = readWrongAnswers(workspace).items.at(-1).id;
    // Simulate data written by an older doubling scheme.
    writeWrongAnswers(workspace, readWrongAnswers(workspace).items.map((it) =>
      it.id === id ? { ...it, intervalDays: 4 } : it,
    ));
    const r = gradedAnswer(workspace, id, true);
    assert.equal(r.intervalDays, 7, '4 snaps to the next ladder rung 7');
  });

  test('unknown id throws', () => {
    addWrongAnswer(workspace, sampleItem());
    assert.throws(() => gradedAnswer(workspace, 'wa-999999', true), /not found/i);
  });
});

// ---------------------------------------------------------------------------
// markMastered / schedulePractice
// ---------------------------------------------------------------------------

describe('markMastered and schedulePractice', () => {
  test('markMastered sets the flag without touching the interval', () => {
    addWrongAnswer(workspace, sampleItem());
    const id = readWrongAnswers(workspace).items.at(-1).id;
    const before = readWrongAnswers(workspace).items.at(-1).intervalDays;
    const r = markMastered(workspace, id);
    assert.equal(r.ok, true);
    const item = readWrongAnswers(workspace).items.at(-1);
    assert.equal(item.mastered, true);
    assert.ok(item.masteredAt, 'masteredAt is stamped');
    assert.equal(item.intervalDays, before);
  });

  test('schedulePractice pulls dueAt to now, resets interval, clears mastery', () => {
    addWrongAnswer(workspace, sampleItem());
    const id = readWrongAnswers(workspace).items.at(-1).id;
    gradedAnswer(workspace, id, true); // 1 → 3
    const r = schedulePractice(workspace, id);
    assert.equal(r.ok, true);
    const item = readWrongAnswers(workspace).items.at(-1);
    assert.equal(item.intervalDays, 1);
    assert.equal(item.mastered, false);
    assert.equal(item.masteredAt, null);
    assert.ok(new Date(item.dueAt).getTime() <= Date.now() + 5000, 'dueAt ≈ now');
    assert.ok(dueToday(workspace).some((it) => it.id === id));
  });
});

// ---------------------------------------------------------------------------
// dueToday
// ---------------------------------------------------------------------------

describe('dueToday', () => {
  test('returns only un-mastered items whose dueAt has passed', () => {
    // Fresh workspace so leftovers from earlier setups cannot leak into the filter.
    const ws = join(workspace, 'due-today');
    const pastISO = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const futureISO = new Date(Date.now() + 2 * DAY_MS).toISOString();
    const rPast = addWrongAnswer(ws, sampleItem({ question: 'past' }));
    addWrongAnswer(ws, sampleItem({ question: 'future' }));

    // Rewrite dueAt/mastered directly for deterministic fixtures.
    const items = readWrongAnswers(ws).items;
    writeWrongAnswers(ws, items.map((it) => {
      if (it.id === rPast.id) return { ...it, dueAt: pastISO };
      if (it.question === 'future') return { ...it, dueAt: futureISO };
      return it;
    }));
    // A mastered item that is also overdue must NOT show up.
    const items2 = readWrongAnswers(ws).items;
    const futureItem = items2.find((it) => it.question === 'future');
    writeWrongAnswers(ws, items2.map((it) =>
      it.id === futureItem.id ? { ...it, dueAt: pastISO, mastered: true } : it,
    ));

    const due = dueToday(ws);
    assert.deepEqual(due.map((it) => it.id), [rPast.id],
      'exactly the overdue, un-mastered item is due today');
  });

  test('fresh store (nothing due yet) returns empty', () => {
    const ws2 = join(workspace, 'fresh2');
    assert.deepEqual(dueToday(ws2), []);
  });
});

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

describe('persistence', () => {
  test('writes are atomic (no .tmp- files left behind)', () => {
    const studyDir = join(workspace, '.study');
    const entries = readdirSync(studyDir);
    assert.ok(!entries.some((f) => f.startsWith('.tmp-')), 'no tmp leftovers');
  });

  test('the on-disk JSON is schema v2 and matches what the API returns', () => {
    addWrongAnswer(workspace, sampleItem({ question: 'disk check' }));
    const raw = readRawFile();
    assert.equal(raw.version, 2);
    const disk = raw.items.find((it) => it.question === 'disk check');
    const viaApi = readWrongAnswers(workspace).items.find((it) => it.question === 'disk check');
    assert.deepEqual(disk, viaApi);
    assert.equal(disk.intervalDays, 1);
  });
});
