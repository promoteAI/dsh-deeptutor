/**
 * Host half of the Pure-JS Study Mode plugin for @local/deeptutor.
 *
 * Integrates HKUDS DeepTutor into DeepSeek Harness as a self-contained pure-JS
 * study-mode plugin. Zero Python dependency — all tutoring capabilities are
 * replaced by local tools that drive knowledge retrieval, quiz generation, and
 * spaced-repetition wrong-answer notebook management.
 *
 * Tools:
 *   - study_teach(concept, {kb?, depth?})  — retrieve KB evidence and explain
 *   - study_quiz(topic, {count?, difficulty?, kb?}) — return config confirmation
 *   - study_kb(action, {kb?, query?, title?, content?}) — KB CRUD
 *   - study_review() — read last graded result
 *
 * HTTP routes (registered via connection.fetch.register):
 *   - GET/POST /api/study/wrong-answers
 *   - POST /api/study/grade
 *   - GET/POST /api/study/kb
 *   - GET /api/study/health
 */

import { join, dirname } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  listRegistries,
  createRegistry,
  deleteRegistry,
  addDoc,
  searchDocs,
  readDoc,
} from './src/kb.mjs';
import {
  readWrongAnswers,
  writeWrongAnswers,
  markMastered,
  schedulePractice,
  addWrongAnswer,
  gradedAnswer,
  dueToday,
  saveLastGrade,
  getLastGrade,
} from './src/wa.mjs';

/** Host services: tools, system prompt, and HTTP connection. */
export const inject = ['tools', 'systemPrompt', 'connection'];

const PKG_DIR = dirname(fileURLToPath(import.meta.url));

/** Position of the capability section. */
const SECTION_ORDER = 10200;

// ---------------------------------------------------------------------------
// Filesystem helpers (re-exported here for route handlers)
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

// ---------------------------------------------------------------------------
// Helper: parse JSON body from HTTP request
// ---------------------------------------------------------------------------

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response with the given status. */
function sendJSON(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Wrap a handler in try/catch and return JSON errors. */
function wrap(handler) {
  return async (req, res, ...args) => {
    try {
      await handler(req, res, ...args);
    } catch (err) {
      sendJSON(res, 500, { error: true, message: err?.message || String(err) });
    }
  };
}

// ---------------------------------------------------------------------------
// study_teach — concept explanation with optional KB evidence
// ---------------------------------------------------------------------------

const studyTeach = {
  name: 'study_teach',
  description:
    'Explain a concept to the learner. If a knowledge base (kb) is provided, ' +
    'search it for relevant evidence snippets and include them in the explanation. ' +
    'Structure the output as: core conclusion → derivation steps → comparison table → common pitfalls.',
  parameters: {
    concept: { type: 'string', required: true, description: 'The concept or topic to explain.' },
    kb: { type: 'string', description: 'Optional knowledge base name to search for evidence.' },
    depth: {
      type: 'string',
      enum: ['brief', 'normal', 'deep'],
      description: 'Explanation depth. Default: normal.',
    },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        concept: { type: 'string' },
        content: { type: 'string' },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              snippet: { type: 'string' },
              score: { type: 'number' },
            },
          },
        },
        error: { type: 'string' },
      },
      required: ['ok'],
      additionalProperties: true,
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args) {
    const concept = args.concept || '';
    const kb = args.kb;
    const depth = args.depth || 'normal';

    let evidence = [];
    let content = '';

    if (kb) {
      const results = searchDocs(process.cwd(), kb, concept, depth === 'deep' ? 10 : 5);
      evidence = results.map((r) => ({
        file: r.file,
        snippet: r.snippet,
        score: r.score,
      }));
    }

    content = evidence.length > 0
      ? `Evidence from KB "${kb}" for concept "${concept}":\n${evidence.map((e, i) => `--- Snippet ${i + 1} (${e.file}, score=${e.score}) ---\n${e.snippet}`).join('\n\n')}`
      : `No knowledge base specified or no matching evidence found for concept "${concept}". Generate an explanation based on your general knowledge.`;

    return {
      ok: true,
      concept,
      content,
      evidence,
      depth,
    };
  },
};

// ---------------------------------------------------------------------------
// study_quiz — return quiz config (questions are generated by the model)
// ---------------------------------------------------------------------------

const studyQuiz = {
  name: 'study_quiz',
  description:
    'Confirm quiz parameters for topic-based MCQ generation. This tool does NOT ' +
    'generate questions itself — the agent generates them and presents them via ' +
    'a deeptutor-quiz fence. Returns a validated config that the agent uses as ' +
    'a contract before generating questions.',
  parameters: {
    topic: { type: 'string', required: true, description: 'The topic to quiz on.' },
    count: {
      type: 'integer',
      description: 'Number of questions (1–20). Default: 5.',
    },
    difficulty: {
      type: 'string',
      enum: ['easy', 'medium', 'hard', 'mixed'],
      description: 'Difficulty level. Default: medium.',
    },
    kb: { type: 'string', description: 'Optional knowledge base to ground questions in.' },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        params: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            count: { type: 'integer' },
            difficulty: { type: 'string' },
            kb: { type: 'string' },
          },
        },
        error: { type: 'string' },
      },
      required: ['ok'],
      additionalProperties: true,
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args) {
    const count = clampInt(args.count, 1, 20, 5);
    const difficulty = ['easy', 'medium', 'hard', 'mixed'].includes(args.difficulty)
      ? args.difficulty
      : 'medium';
    return {
      ok: true,
      params: {
        topic: args.topic || '',
        count,
        difficulty,
        kb: args.kb || null,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// study_kb — knowledge-base CRUD dispatcher
// ---------------------------------------------------------------------------

const studyKb = {
  name: 'study_kb',
  description:
    'Manage the study knowledge base: list KBs, create, delete, add documents, ' +
    'search, and read documents. Actions: list, create, delete, add, search, file.',
  parameters: {
    action: {
      type: 'string',
      required: true,
      enum: ['list', 'create', 'delete', 'add', 'search', 'file'],
      description: 'KB operation to perform.',
    },
    kb: { type: 'string', description: 'Knowledge base name (required for create/delete/add/search/file).' },
    query: { type: 'string', description: 'Search query (required for search).' },
    title: { type: 'string', description: 'Document title (required for add).' },
    content: { type: 'string', description: 'Document Markdown content (required for add).' },
    description: { type: 'string', description: 'KB description (used with create).' },
    k: { type: 'integer', description: 'Max search results (default: 5).' },
    file: { type: 'string', description: 'Filename slug (required for file action).' },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        action: { type: 'string' },
        data: { type: 'object' },
        error: { type: 'string' },
      },
      required: ['ok'],
      additionalProperties: true,
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args) {
    const action = args.action;
    const kb = args.kb || '';
    switch (action) {
      case 'list': {
        const items = listRegistries(process.cwd());
        return { ok: true, action, data: { knowledgeBases: items } };
      }
      case 'create': {
        const result = createRegistry(process.cwd(), kb, args.description || '');
        return { ok: true, action, data: result };
      }
      case 'delete': {
        const result = deleteRegistry(process.cwd(), kb);
        return { ok: true, action, data: result };
      }
      case 'add': {
        if (!kb) return { ok: false, action, error: 'kb is required for add' };
        if (!args.title) return { ok: false, action, error: 'title is required for add' };
        const result = addDoc(process.cwd(), kb, args.title, args.content || '');
        return { ok: true, action, data: result };
      }
      case 'search': {
        if (!kb) return { ok: false, action, error: 'kb is required for search' };
        if (!args.query) return { ok: false, action, error: 'query is required for search' };
        const results = searchDocs(process.cwd(), kb, args.query, args.k || 5);
        return { ok: true, action, data: { query: args.query, results } };
      }
      case 'file': {
        if (!kb) return { ok: false, action, error: 'kb is required for file' };
        if (!args.file) return { ok: false, action, error: 'file is required for file' };
        const doc = readDoc(process.cwd(), kb, args.file);
        return { ok: true, action, data: doc };
      }
      default:
        return { ok: false, action, error: `unknown action: ${action}` };
    }
  },
};

// ---------------------------------------------------------------------------
// study_review — read last graded quiz result
// ---------------------------------------------------------------------------

const studyReview = {
  name: 'study_review',
  description:
    'Read the most recent quiz grading result. Call this after the user submits ' +
    'answers to a quiz so the agent can summarize scores, highlight wrong items, ' +
    'and produce a deeptutor-dashboard fence with real data.',
  parameters: {},
  output: {
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        lastGrade: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            total: { type: 'number' },
            wrongCount: { type: 'number' },
            wrongItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  question: { type: 'string' },
                  userAnswer: { type: 'number' },
                  correctAnswer: { type: 'string' },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
      },
      required: ['ok'],
      additionalProperties: true,
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute() {
    const grade = getLastGrade(process.cwd());
    if (!grade) return { ok: true, lastGrade: null };
    return {
      ok: true,
      lastGrade: {
        score: grade.score ?? 0,
        total: grade.total ?? 0,
        wrongCount: grade.wrongCount ?? 0,
        wrongItems: (grade.perQuestion || [])
          .filter((q) => !q.correct)
          .slice(0, 3)
          .map((q) => ({
            id: q.id,
            question: q.stem,
            userAnswer: q.userAnswer,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
          })),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// System prompt section
// ---------------------------------------------------------------------------

const CAPABILITY_SECTION = `## Study mode (pure-JS)

This workspace runs in **Study Mode**. When the user asks for tutoring, practice,
quiz, review, or any form of learning support, prefer the \`study_*\` tools over
improvising from memory.

**Tools available:**
- \`study_teach(concept, {kb?, depth?})\` — explain a concept, optionally grounding
  the explanation in the knowledge base. Returns evidence snippets.
- \`study_quiz(topic, {count?, difficulty?, kb?})\` — confirm quiz parameters.
  After calling this, generate 4-option MCQs and present them inside a
  \\\`deeptutor-quiz\\\` code fence. The fence schema:
  \`\`\`json
  {
    "topic": "...",
    "questions": [
      {
        "id": "q-001",
        "stem": "...",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "explanation": "..."
      }
    ]
  }
  \`\`\`
  Each question has exactly 4 options with correctIndex in [0,3].
- \`study_kb(action, ...)\` — manage knowledge bases (list/create/delete/add/search/file).
- \`study_review()\` — read the latest quiz grade so you can summarize results.

**Rules (铁律):**
1. Quiz questions MUST be presented via a \\\`deeptutor-quiz\\\` fence — never just
   in chat text.
2. Grading happens through the \\\`/api/study/grade\\\` HTTP route (called by the
   client after the user submits), not by the model. The agent should call
   \`study_review()\` after grading to pick up real scores.
3. Wrong answers are automatically written to the wrong-answer notebook
   (\`.study/wrong-answers.json\`). Spaced-repetition intervals are managed
   server-side — do not invent interval logic.
4. Never fabricate mastery scores, gap counts, or dashboard data. Only use
   real results from \`study_review()\` or the grade route.
5. One \\\`deeptutor-dashboard\\\` fence per turn, filled only with actual run data.
   Shape: overview (string), mastery (0–100 number), status
   ("learning"|"review"|"assessment"), gaps [{title, detail, priority}],
   plan [{step, detail, done}], question {stem, options, answerIndex,
   explanation}, flashcards [{front, back}], nextActions [string],
   sources [string].
6. Do NOT use \`deeptutor_run\` or any CLI call — this plugin is now pure-JS and
   has no Python dependency.
`;

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

function registerRoutes(ctx, workspace) {
  const fetch = ctx.connection?.fetch;
  if (!fetch) return;

  // GET /api/study/health
  fetch.register('GET', '/api/study/health', wrap(async (_req, res) => {
    const studyDir = join(workspace, '.study');
    let writeable = false;
    try {
      mkdirSync(studyDir, { recursive: true });
      const testFile = join(studyDir, `.write-test-${Date.now()}`);
      writeFileSync(testFile, 'ok');
      unlinkSync(testFile);
      writeable = true;
    } catch (_) { /* ignore */ }
    sendJSON(res, 200, { writeable, studyDir, ok: writeable });
  }));

  // GET  /api/study/wrong-answers  — list all; query param ?due=1 returns only due items
  // POST /api/study/wrong-answers  — mastered | practice | answer
  fetch.register('GET', '/api/study/wrong-answers', wrap(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const dueOnly = url.searchParams.get('due') === '1';
    const all = readWrongAnswers(workspace);
    const items = dueOnly ? dueToday(workspace) : all.items;
    sendJSON(res, 200, { workspace, items, version: all.version, count: items.length });
  }));

  fetch.register('POST', '/api/study/wrong-answers', wrap(async (req, res) => {
    const body = await parseBody(req);
    const action = body.action;
    if (!action) throw new Error('action is required');

    switch (action) {
      case 'mastered': {
        if (!body.id) throw new Error('id is required for mastered');
        const result = markMastered(workspace, body.id);
        sendJSON(res, 200, result);
        break;
      }
      case 'practice': {
        if (!body.id) throw new Error('id is required for practice');
        const result = schedulePractice(workspace, body.id);
        sendJSON(res, 200, result);
        break;
      }
      case 'answer': {
        if (!body.id) throw new Error('id is required for answer');
        const all = readWrongAnswers(workspace);
        const item = all?.items?.find((it) => it.id === body.id);
        if (!item) throw new Error(`Item ${body.id} not found`);
        const correct = body.answer === item.correctIndex;
        const result = gradedAnswer(workspace, body.id, correct);
        sendJSON(res, 200, {
          ...result,
          questionId: body.id,
          correct,
          expectedAnswer: item.correctIndex,
        });
        break;
      }
      default:
        throw new Error(`unknown action: ${action}`);
    }
  }));

  // POST /api/study/grade — grade a quiz submission
  fetch.register('POST', '/api/study/grade', wrap(async (req, res) => {
    const body = await parseBody(req);
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const userAnswers = body.userAnswers || {}; // { [questionId]: selectedIndex }

    if (questions.length === 0) throw new Error('questions array is required');

    const perQuestion = [];
    const wrongItems = [];
    let score = 0;

    for (const q of questions) {
      const qId = q.id || `q-${perQuestion.length}`;
      const selected = userAnswers[qId];
      const correctIndex = q.correctIndex;
      const isCorrect = selected === correctIndex;
      if (isCorrect) score++;

      perQuestion.push({
        id: qId,
        stem: q.stem,
        correct: isCorrect,
        userAnswer: selected,
        correctAnswer: q.options?.[correctIndex] || '',
        explanation: q.explanation || '',
      });

      if (!isCorrect) {
        wrongItems.push({
          id: qId,
          topic: q.topic || '',
          question: q.stem,
          options: q.options?.slice(0, 4) || ['', '', '', ''],
          correctIndex,
          userAnswer: selected,
          correctAnswer: q.options?.[correctIndex] || '',
          explanation: q.explanation || '',
        });
      }
    }

    const total = questions.length;
    const wrongCount = total - score;
    const gradeResult = { score, total, wrongCount, perQuestion, wrongItems };

    // Write each wrong item to the notebook.
    for (const item of wrongItems) {
      try { addWrongAnswer(workspace, item); } catch (_) { /* ignore individual failures */ }
    }

    // Save summary for study_review.
    saveLastGrade(workspace, gradeResult);

    sendJSON(res, 200, gradeResult);
  }));

  // GET  /api/study/kb          — list KBs; ?docs=<name> lists docs; ?file=<name>&kb=<kb> reads a file
  // POST /api/study/kb           — create | delete | setDefault | add
  fetch.register('GET', '/api/study/kb', wrap(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const docsParam = url.searchParams.get('docs');
    const fileParam = url.searchParams.get('file');
    const kbParam = url.searchParams.get('kb');

    if (docsParam && kbParam) {
      // List docs in a KB.
      const rawD = join(workspace, '.study', 'kb', sanitizeName(kbParam), 'raw');
      if (!existsSync(rawD)) throw new Error(`KB "${kbParam}" not found`);
      const files = readdirSync(rawD).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
      sendJSON(res, 200, { kb: kbParam, files });
    } else if (fileParam && kbParam) {
      // Read a single document.
      const doc = readDoc(workspace, kbParam, fileParam);
      sendJSON(res, 200, { kb: kbParam, file: fileParam, ...doc });
    } else {
      const items = listRegistries(workspace);
      sendJSON(res, 200, { knowledgeBases: items });
    }
  }));

  fetch.register('POST', '/api/study/kb', wrap(async (req, res) => {
    const body = await parseBody(req);
    const action = body.action;
    const kb = body.kb || '';

    switch (action) {
      case 'create': {
        if (!kb) throw new Error('kb name is required');
        const result = createRegistry(workspace, kb, body.description || '');
        sendJSON(res, 200, { ok: true, action, data: result });
        break;
      }
      case 'delete': {
        if (!kb) throw new Error('kb name is required');
        const result = deleteRegistry(workspace, kb);
        sendJSON(res, 200, { ok: true, action, data: result });
        break;
      }
      case 'setDefault': {
        if (!kb) throw new Error('kb name is required');
        const reg = readJsonSafe(join(workspace, '.study', 'kb', 'kb_registry.json'));
        if (!reg) throw new Error('No registry found');
        if (!reg.knowledgeBases.some((k) => k.name === sanitizeName(kb))) {
          throw new Error(`KB "${kb}" not found`);
        }
        reg.knowledgeBases = reg.knowledgeBases.map((k) => ({
          ...k,
          isDefault: k.name === sanitizeName(kb),
        }));
        writeJsonAtomic(join(workspace, '.study', 'kb', 'kb_registry.json'), reg);
        sendJSON(res, 200, { ok: true, action, data: { kb: sanitizeName(kb) } });
        break;
      }
      case 'add': {
        if (!kb) throw new Error('kb name is required');
        if (!body.title) throw new Error('title is required');
        const result = addDoc(workspace, kb, body.title, body.content || '');
        sendJSON(res, 200, { ok: true, action, data: result });
        break;
      }
      default:
        throw new Error(`unknown action: ${action}`);
    }
  }));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizeName(name) {
  if (!name) return '';
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
}

// ---------------------------------------------------------------------------
// apply — the plugin entry point
// ---------------------------------------------------------------------------

export function apply(ctx) {
  // Determine workspace from environment or cwd.
  const workspace = process.env.DSH_WORKSPACE || process.cwd();

  // Register tools.
  ctx.tools.register(studyTeach);
  ctx.tools.register(studyQuiz);
  ctx.tools.register(studyKb);
  ctx.tools.register(studyReview);

  // Register system prompt section.
  ctx.systemPrompt.section({
    name: 'deeptutor:study-mode',
    order: SECTION_ORDER,
    interpolate: false,
    text: () => CAPABILITY_SECTION,
  });

  // Register HTTP routes (if connection service is available).
  if (ctx.connection && ctx.connection.fetch) {
    registerRoutes(ctx, workspace);
  }

  // Log startup confirmation (non-fatal).
  ctx.effect(() => {
    console.log(`[deeptutor-study] plugin loaded, workspace=${workspace}`);
  }, 'deeptutor:study:startup');
}
