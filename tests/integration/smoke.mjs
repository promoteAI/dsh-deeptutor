/**
 * Integration smoke test — end-to-end learning loop against a throwaway
 * workspace, without HTTP or a live DSH runtime.
 *
 * Run: node --test tests/integration/smoke.mjs
 *
 * Scenario:
 *   1. create a temp workspace directory
 *   2. drive study_kb create / add through the real plugin registration
 *      (apply(ctx) with captured ctx.tools.register)
 *   3. study_kb search returns BM25 evidence for the added doc
 *   4. study_quiz confirms the quiz config
 *   5. simulate the /api/study/grade route handler: grade route input
 *      (questions + userAnswers) via the wa store — wrong answers persist
 *   6. verify spaced-repetition interval advancement (wrong→1, correct
 *      1→3→7→21 with auto-master; wrong at any point resets)
 *   7. study_review picks up the last grade summary
 *   8. cleanup the temp workspace
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = fileURLToPath(new URL('../../deeptutor-plugin/', import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;

test('study mode end-to-end smoke', async () => {
  // -- 1. temp workspace ----------------------------------------------------
  const ws = mkdtempSync(path.join(tmpdir(), 'study-smoke-'));
  // Route handlers resolve the workspace from DSH_WORKSPACE first.
  const prevWorkspaceEnv = process.env.DSH_WORKSPACE;
  process.env.DSH_WORKSPACE = ws;
  const prevCwd = process.cwd();

  try {
    const wa = await import(pathToFileURL(path.join(PLUGIN_ROOT, 'src', 'wa.mjs')));

    // -- 2. apply(ctx) registers the tools; capture them -------------------
    const host = await import(pathToFileURL(path.join(PLUGIN_ROOT, 'index.js')));
    assert.equal(typeof host.apply, 'function', 'index.js exports apply(ctx)');

    const registeredTools = [];
    let promptSection = null;
    host.apply({
      tools: { register: (t) => registeredTools.push(t) },
      systemPrompt: { section: (s) => { promptSection = s; } },
      connection: { fetch: { register: () => {} } },
      effect: () => {},
    });

    const tools = Object.fromEntries(registeredTools.map((t) => [t.name, t]));
    assert.ok(tools.study_teach, 'study_teach registered');
    assert.ok(tools.study_quiz, 'study_quiz registered');
    assert.ok(tools.study_kb, 'study_kb registered');
    assert.ok(tools.study_review, 'study_review registered');
    assert.ok(promptSection, 'system prompt section registered');
    assert.ok(promptSection.text().includes('study_kb'), 'prompt section mentions study tools');

    // Run tool operations with cwd pinned to the temp workspace.
    // (tool execute paths in index.js read process.cwd() for the workspace).
    process.chdir(ws);

    // -- 3. study_kb create + add ------------------------------------------
    const created = await tools.study_kb.execute({
      action: 'create',
      kb: '物理',
      description: '高中物理核心知识点',
    });
    assert.equal(created.ok, true, 'study_kb create succeeds');

    const added = await tools.study_kb.execute({
      action: 'add',
      kb: '物理',
      title: '傅里叶变换',
      content:
        '# 傅里叶变换\n\n' +
        '傅里叶变换（Fourier transform）把信号从时域映射到频域：任何周期信号都可以分解为不同频率正弦波的叠加。\n',
    });
    assert.equal(added.ok, true, 'study_kb add succeeds');

    assert.ok(existsSync(path.join(ws, '.study', 'kb', 'kb_registry.json')), 'registry persisted');
    const rawDir = path.join(ws, '.study', 'kb', '物理', 'raw');
    assert.ok(existsSync(rawDir), 'raw dir created');
    assert.equal(readdirSync(rawDir).length, 1, 'one md file stored');
    assert.ok(existsSync(path.join(ws, '.study', 'kb', '物理', 'index.json')), 'index rebuilt on add');

    // -- 4. study_kb search returns evidence -------------------------------
    const searchRes = await tools.study_kb.execute({
      action: 'search',
      kb: '物理',
      query: '傅里叶变换 频域',
    });
    assert.equal(searchRes.ok, true);
    assert.ok(searchRes.data.results.length >= 1, 'search hits the added doc');
    assert.ok(searchRes.data.results[0].snippet.includes('傅里叶'), 'snippet carries matching text');

    // study_teach also surfaces KB evidence
    const teach = await tools.study_teach.execute({ concept: '傅里叶变换', kb: '物理' });
    assert.equal(teach.ok, true);
    assert.ok(teach.evidence.length >= 1, 'study_teach returns KB evidence');

    // -- 5. study_quiz confirms the config ---------------------------------
    const quiz = await tools.study_quiz.execute({
      topic: '电磁感应',
      count: 3,
      difficulty: 'easy',
      kb: '物理',
    });
    assert.equal(quiz.ok, true);
    assert.deepEqual(quiz.params, { topic: '电磁感应', count: 3, difficulty: 'easy', kb: '物理' });

    // -- 6. simulated grade route: wrong answers persist --------------------
    // This mirrors exactly what POST /api/study/grade does after computing
    // perQuestion: for each wrong item call addWrongAnswer, then saveLastGrade.
    const questions = [
      {
        id: 'q-001',
        stem: '法拉第电磁感应定律指出，感应电动势与什么成正比？',
        options: ['磁通量的变化率', '磁感应强度', '回路电阻', '电流大小'],
        correctIndex: 0,
        explanation: 'E = -dΦ/dt：磁通量变化越快，感应电动势越大。',
      },
      {
        id: 'q-002',
        stem: '傅里叶变换的基本假设是信号具有什么特征？',
        options: ['周期性', '随机性', '非线性', '离散性'],
        correctIndex: 0,
        explanation: '傅里叶分析建立在周期信号可分解为正弦波叠加之上。',
      },
      {
        id: 'q-003',
        stem: '楞次定律的核心内容是？',
        options: ['感应电流阻碍磁通变化', '磁通量守恒', '电动势恒定', '电阻决定电流'],
        correctIndex: 0,
        explanation: '感应电流的效果总是反抗引起它的磁通量变化。',
      },
    ];
    // User got q-001 wrong, q-002 right... actually simulate: picks 0, 2, 0.
    // q-001: picked 0 = correctIndex → correct. q-002: picked 2 → wrong.
    // q-003: picked 0 → correct. Give a fuller spread: user picks 0, 2, 1.
    const userAnswers = { 'q-001': 0, 'q-002': 2, 'q-003': 1 };

    const perQuestion = [];
    const wrongItems = [];
    let score = 0;
    for (const q of questions) {
      const selected = userAnswers[q.id];
      const isCorrect = selected === q.correctIndex;
      if (isCorrect) score++;
      // Same shape POST /api/study/grade persists per question.
      perQuestion.push({
        id: q.id,
        stem: q.stem,
        correct: isCorrect,
        userAnswer: selected,
        correctAnswer: q.options[q.correctIndex] || '',
        explanation: q.explanation || '',
      });
      if (!isCorrect) {
        wrongItems.push({
          id: q.id,
          topic: '电磁感应',
          question: q.stem,
          options: q.options.slice(0, 4),
          correctIndex: q.correctIndex,
          userAnswer: selected,
          correctAnswer: q.options[q.correctIndex],
          explanation: q.explanation,
        });
      }
    }
    assert.equal(score, 1, 'one of three answers is correct');
    assert.equal(wrongItems.length, 2, 'two wrong answers to file');

    // The grade route writes every wrong item to the notebook.
    for (const item of wrongItems) {
      wa.addWrongAnswer(ws, item);
    }
    const gradeResult = { score: 1, total: 3, wrongCount: 2, perQuestion, wrongItems };
    wa.saveLastGrade(ws, gradeResult);

    // Wrong-answer store state.
    assert.ok(existsSync(path.join(ws, '.study', 'wrong-answers.json')), 'notebook persisted');
    let store = wa.readWrongAnswers(ws);
    assert.equal(store.version, 2);
    assert.equal(store.items.length, 2, 'both wrong answers recorded');
    for (const item of store.items) {
      assert.ok(item.id, 'item has an id');
      assert.equal(item.intervalDays, 1, 'fresh wrong item starts at 1 day');
      assert.equal(item.mastered, false);
      assert.ok(new Date(item.dueAt).getTime() > Date.now() - 5000, 'dueAt ≈ now + 1 day');
    }

    // -- 7. spaced repetition advancement -----------------------------------
    const firstId = store.items[0].id;
    const readItem = () => wa.readWrongAnswers(ws).items.find((it) => it.id === firstId);

    let r = wa.gradedAnswer(ws, firstId, true);
    assert.equal(r.intervalDays, 3, '1st correct: 1 → 3 days');
    r = wa.gradedAnswer(ws, firstId, true);
    assert.equal(r.intervalDays, 7, '2nd correct: 3 → 7 days');
    assert.ok(
      new Date(readItem().dueAt).getTime() > Date.now() + 6 * DAY_MS,
      'dueAt pushed out by about a week',
    );
    r = wa.gradedAnswer(ws, firstId, true);
    assert.equal(r.intervalDays, 21, '3rd correct: 7 → 21 days (last rung)');
    assert.equal(readItem().mastered, true, 'correct at 21 days auto-masters');

    // A wrong answer resets everything.
    r = wa.gradedAnswer(ws, firstId, false);
    assert.equal(r.intervalDays, 1, 'wrong answer resets the interval to 1');
    assert.equal(readItem().mastered, false, 'wrong answer clears mastery');
    assert.ok(new Date(readItem().dueAt).getTime() <= Date.now() + 5000, 'dueAt ≈ now');

    // The other item can be marked mastered manually and pulled back via practice.
    const secondId = store.items[1].id;
    wa.markMastered(ws, secondId);
    assert.equal(wa.readWrongAnswers(ws).items.find((it) => it.id === secondId).mastered, true);

    // -- 8. study_review reads the real grade -------------------------------
    const review = await tools.study_review.execute();
    assert.equal(review.ok, true);
    assert.equal(review.lastGrade.score, 1);
    assert.equal(review.lastGrade.total, 3);
    assert.equal(review.lastGrade.wrongCount, 2);
    assert.equal(review.lastGrade.wrongItems.length, 2, 'wrong items surfaced to the agent');
    assert.ok(review.lastGrade.wrongItems[0].question.length > 0, 'wrong item carries the stem');

    // -- 9. workspace state sanity ------------------------------------------
    const studyDir = path.join(ws, '.study');
    assert.deepEqual(
      readdirSync(studyDir).sort(),
      ['kb', 'last-grade.json', 'wrong-answers.json'],
      'expected .study layout',
    );
    assert.deepEqual(
      readdirSync(path.join(studyDir, 'kb')).filter((f) => f !== 'kb_registry.json').sort(),
      ['物理'],
      'only the study KB exists on disk',
    );
  } finally {
    process.chdir(prevCwd);
    if (prevWorkspaceEnv === undefined) delete process.env.DSH_WORKSPACE;
    else process.env.DSH_WORKSPACE = prevWorkspaceEnv;
    rmSync(ws, { recursive: true, force: true });
  }
});
