/**
 * Wrong-answer notebook storage module.
 *
 * Data file: `<workspace>/.study/wrong-answers.json`
 * Schema version 2:
 *   {
 *     version: 2,
 *     items: [
 *       {
 *         id: string,
 *         topic: string,
 *         question: string,
 *         options: [string, string, string, string],
 *         correctIndex: number,   // 0-based
 *         userAnswer: number|null,
 *         correctAnswer: string,
 *         explanation: string,
 *         wrongAt: string,        // ISO date
 *         dueAt: string,          // ISO date
 *         mastered: boolean,
 *         masteredAt: string|null,
 *         intervalDays: number
 *       }
 *     ]
 *   }
 *
 * Interval schedule on correct answers:
 *   intervalDays advances through the ladder [1, 3, 7, 21] (the spec-level
 *   spaced-repetition schedule), starting from 1 day after a wrong answer.
 *   When intervalDays reaches 21 and the answer is correct again → auto-mastered.
 * On wrong answer: reset intervalDays = 1, dueAt = now, mastered = false.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

const VERSION = 2;
const DATA_FILE = 'wrong-answers.json';
const LAST_GRADE_FILE = 'last-grade.json';

/** Spaced-repetition interval ladder in days (spec: 1 → 3 → 7 → 21). */
const INTERVAL_LADDER = [1, 3, 7, 21];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function studyRoot(workspace) {
  return join(workspace, '.study');
}

function dataPath(workspace) {
  return join(studyRoot(workspace), DATA_FILE);
}

function lastGradePath(workspace) {
  return join(studyRoot(workspace), LAST_GRADE_FILE);
}

function nowISO() {
  return new Date().toISOString();
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function readJsonSafe(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

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

function ensureData(workspace) {
  let data = readJsonSafe(dataPath(workspace));
  if (!data || data.version !== VERSION) {
    data = { version: VERSION, items: [] };
    writeJsonAtomic(dataPath(workspace), data);
  }
  return data;
}

function nextId(items) {
  if (items.length === 0) return 'wa-000001';
  const max = items.reduce((acc, item) => {
    const m = parseInt(item.id.replace(/^wa-(\d+)/, '$1'), 10);
    return isNaN(m) ? acc : Math.max(acc, m);
  }, 0);
  return `wa-${String(max + 1).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the wrong-answer notebook.
 */
export function readWrongAnswers(workspace) {
  const data = ensureData(workspace);
  return { version: data.version, items: data.items };
}

/**
 * Atomically write the entire items array.
 */
export function writeWrongAnswers(workspace, items) {
  writeJsonAtomic(dataPath(workspace), { version: VERSION, items });
}

/**
 * Mark an item as mastered (user clicked the mastery button).
 */
export function markMastered(workspace, id) {
  const data = ensureData(workspace);
  const item = data.items.find((it) => it.id === id);
  if (!item) throw new Error(`Item ${id} not found`);
  item.mastered = true;
  item.masteredAt = nowISO();
  writeJsonAtomic(dataPath(workspace), data);
  return { ok: true, id, mastered: true };
}

/**
 * Schedule an item for immediate practice (pull dueAt to now, unmaster).
 */
export function schedulePractice(workspace, id) {
  const data = ensureData(workspace);
  const item = data.items.find((it) => it.id === id);
  if (!item) throw new Error(`Item ${id} not found`);
  item.dueAt = nowISO();
  item.mastered = false;
  item.masteredAt = null;
  item.intervalDays = 1;
  writeJsonAtomic(dataPath(workspace), data);
  return { ok: true, id };
}

/**
 * Append a new wrong answer item.
 */
export function addWrongAnswer(workspace, item) {
  const data = ensureData(workspace);
  const now = nowISO();
  const newItem = {
    id: item.id || nextId(data.items),
    topic: item.topic || '',
    question: item.question || '',
    options: (Array.isArray(item.options) ? item.options : []).slice(0, 4).concat(Array(4).fill('')).slice(0, 4),
    correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : 0,
    userAnswer: item.userAnswer !== undefined ? item.userAnswer : null,
    correctAnswer: item.correctAnswer || '',
    explanation: item.explanation || '',
    wrongAt: item.wrongAt || now,
    dueAt: item.dueAt || addDays(now, 1),
    mastered: false,
    masteredAt: null,
    intervalDays: item.intervalDays !== undefined ? item.intervalDays : 1,
  };
  data.items.push(newItem);
  writeJsonAtomic(dataPath(workspace), data);
  return { ok: true, id: newItem.id };
}

/**
 * Grade a redo answer for an existing item. Advances interval per the SRS rule:
 * correct → next rung of [1, 3, 7, 21] (auto-master at 21); wrong → reset to 1.
 */
export function gradedAnswer(workspace, itemId, correct) {
  const data = ensureData(workspace);
  const item = data.items.find((it) => it.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found`);

  if (correct) {
    // Advance to the next rung of the [1, 3, 7, 21] ladder; the last rung is 21.
    // Legacy stores may hold off-ladder values (e.g. doubled 2/4/8); snap those
    // forward to the first ladder rung strictly greater than the current value.
    const idx = INTERVAL_LADDER.indexOf(item.intervalDays);
    if (idx !== -1) {
      item.intervalDays = INTERVAL_LADDER[idx + 1] ?? INTERVAL_LADDER.at(-1);
    } else {
      const next = INTERVAL_LADDER.find((d) => d > item.intervalDays);
      item.intervalDays = next ?? INTERVAL_LADDER.at(-1);
    }
    if (item.intervalDays === 21) {
      item.mastered = true;
      item.masteredAt = nowISO();
    }
    item.dueAt = addDays(nowISO(), item.intervalDays);
  } else {
    item.intervalDays = 1;
    item.dueAt = nowISO();
    item.mastered = false;
    item.masteredAt = null;
  }
  writeJsonAtomic(dataPath(workspace), data);
  return {
    ok: true,
    correct,
    intervalDays: item.intervalDays,
    mastered: item.mastered,
    dueAt: item.dueAt,
  };
}

/**
 * Return items whose dueAt is ≤ now (overdue or today).
 */
export function dueToday(workspace) {
  const data = ensureData(workspace);
  const now = nowISO();
  return data.items.filter((it) => !it.mastered && it.dueAt <= now);
}

// ---------------------------------------------------------------------------
// Last grade tracking
// ---------------------------------------------------------------------------

/**
 * Save the most recent quiz grading result.
 */
export function saveLastGrade(workspace, gradeResult) {
  writeJsonAtomic(lastGradePath(workspace), {
    savedAt: nowISO(),
    ...gradeResult,
  });
}

/**
 * Read the last grade result.
 */
export function getLastGrade(workspace) {
  return readJsonSafe(lastGradePath(workspace));
}
