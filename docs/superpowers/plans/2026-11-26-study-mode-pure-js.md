# Pure-JS Study Mode Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the existing `deeptutor-plugin` from a DeepTutor CLI driver into a self-contained pure-JavaScript study-mode plugin that delivers a complete learning loop (teach, quiz with local grading, wrong-answer notebook, knowledge-base management, review sidebar) with no Python dependency.

**Architecture:** The host half registers six `study_*` tools, three HTTP routes, and a system prompt section. The client half adds a `deeptutor-quiz` fence renderer plus three sidebar pages (wrong-answers, knowledge-base manager, review). A new `study` preset in `cordis.patch.yml` offers one-click switching. Data lives under `<workspace>/.study/`.

**Tech Stack:** Node.js ESM (host), vanilla React + `window.__ModuleLoader__` (client), JSON + Markdown (storage), character bigram BM25 (indexing). No external JS deps.

**Spec:** `docs/superpowers/specs/2026-11-26-study-mode-pure-js-design.md`

## Global Constraints

- Zero Python; zero npm install flows; zero model downloads. Every line of code must be valid ES modules importable via `fileURLToPath(import.meta.url)` on Windows.
- Existing `client.js` fence schema (`deeptutor-dashboard` with fields: overview, mastery, status, gaps[], plan[], question, flashcards[], nextActions[], sources[]) must continue to render unchanged — the new quiz fence is a separate `deeptutor-quiz` type.
- Wrong-answer JSON schema v2 (fields: id, topic, question, options, correctIndex, userAnswer, correctAnswer, explanation, wrongAt, dueAt, mastered, masteredAt) is the single source of truth; do not introduce additional top-level schemas.
- Interval schedule: on wrong, reset `dueAt` to `wrongAt + 1 day`; on correct at interval N, advance to `N * next_interval` where next_interval = [1, 3, 7, 21] days. Auto-master when interval reaches 21 days and answer is correct.
- All HTTP routes use `credentials: 'same-origin'` fetch from the client; no CORS proxy needed. Route paths are exactly `/api/study/wrong-answers`, `/api/study/grade`, `/api/study/kb`, `/api/study/health`.
- Sidebar order constants: wrong-answers = 6, knowledge = 7, review = 8.
- The plugin name and package.json name remain `@local/deeptutor`; the cordis patch id stays `deeptutor` for the plugin itself; the preset gets its own id `preset-study`.
- Locale files live at `locale/zh.json` and `locale/en.json`; keys are namespaced with `study.` prefix for all new strings.

## Review Focus

1. **Race condition on concurrent grade writes** — two sessions submitting quizzes at once could corrupt `wrong-answers.json`; tests must assert atomic write via tmp-file+rename.
2. **BM25 recall edge cases** — single-character queries, empty results, Chinese text with no space delimiter; tests cover fallback to full-text.
3. **Interval arithmetic overflow** — dueAt wrapping across month boundaries; test with Jan 31 input.
4. **Quiz payload tampering** — client sends full quiz including correct answers; server must still validate that submitted answers match question indices and ignore mismatched payloads without crashing.
5. **Sidebar page crash on missing workspace** — when no workspace is available, routes return 503 with an error object, not an exception; unit tests exercise this path.

---

### Task 1: Host rewrite — index.js with study tools & routes

**Files:**
- Modify: `deeptutor-plugin/index.js` (complete rewrite)
- Delete: `deeptutor-plugin/scripts/bootstrap.js`
- Delete: `deeptutor-plugin/.setup/install-status.json` (directory stays but empties)
- Test: `tests/host/study-tools.test.mjs` (new)

**Interfaces:**
- Consumes: `ctx.tools.register`, `ctx.systemPrompt.section`, `ctx.connection.fetch.register`, `ctx.effect`
- Produces: exports `apply(ctx)`, `inject = ['tools', 'systemPrompt', 'connection']`
- Tool signatures:
  - `study_teach(concept, {kb?, depth?})` → `{ ok, content, evidence: [{file, snippet}] }`
  - `study_quiz(topic, {count, difficulty, kb?})` → `{ ok, questions: [{id, stem, options[4], correctIndex, explanation}] }`
  - `study_kb({action, kb?, query?, title?, content?})` → `{ ok, ... }`
  - `study_review()` → `{ ok, lastGrade: {score, total, wrongCount, wrongItems[3]}, null if never graded }`

- [ ] **Step 1: Scaffold the rewrite and delete bootstrap**

Remove `scripts/bootstrap.js` and the `.setup/` directory entirely (they depend on Python/pip). Update `package.json`: drop the `postinstall` script, drop any `dsh-deeptutor` dependency references. Keep `name`, `exports`, `files`, and the `dsh.bundle.patch` entry.

- [ ] **Step 2: Write the BM25 indexer module**

Create `deeptutor-plugin/src/idx.mjs`. Exports:
```js
function tokenize(text) // splits CJK into 2-grams, English by non-alpha chars
function buildIndex(docs) // {path, content}[] → inverted index JSON
function search(index, query, k=5) // returns [{file, score, snippet, offset}]
```
Inverted index is a plain object: `{term: {docId: {positions: [], count}}}`. Term weighting uses BM25 with default k1=1.5, b=0.75. Document length normalization is applied. Test that Chinese bigrams overlap correctly on "傅里叶变换" → ["傅里", "里叶", "叶变", "变换"]. Test that an empty query returns all docs sorted by TF.

- [ ] **Step 3: Implement the KB storage module**

Create `deeptutor-plugin/src/kb.mjs`. Exports:
```js
function listRegistries(workspace) // reads kb_registry.json, returns [{name, description, createdAt, updatedAt, docCount}]
function createRegistry(workspace, name, description) // writes kb_registry.json entry
function deleteRegistry(workspace, name) // removes from registry
function addDoc(workspace, kbName, title, content) // writes to kb/<name>/raw/<sanitized-title>.md, rebuilds index
function searchDocs(workspace, kbName, query, k) // delegates to idx.search
function readDoc(workspace, kbName, file) // reads raw/<file>, returns {text, truncated}
```
Document titles are sanitized via `path.basename(name)`. File stored as `<workspace>/.study/kb/<name>/raw/<slug>.md`. Index stored at `<workspace>/.study/kb/<name>/index.json`. Rebuild only on add/update/delete.

- [ ] **Step 4: Implement the wrong-answers store**

Create `deeptutor-plugin/src/wa.mjs`. Exports:
```js
function readWrongAnswers(workspace) // reads .study/wrong-answers.json, returns {items, version}
function writeWrongAnswers(workspace, items) // atomic write via tmp+rename
function markMastered(workspace, id) // sets mastered=true, masteredAt=now
function schedulePractice(workspace, id) // sets dueAt=now, mastered=false
function addWrongAnswer(workspace, item) // appends a new item
function gradedAnswer(workspace, itemId, correct) // advances interval: correct → multiply current interval by next step in [1,3,7,21], auto-master at 21; wrong → reset to 1 day
function dueToday(workspace) // returns items where dueAt ≤ now
```
Interval logic: store `intervalDays` alongside the item. On correct: `intervalDays = MIN(intervalDays * 2, 21)`. If `intervalDays === 21` after advancement, auto-set `mastered=true`. On wrong: `intervalDays=1, dueAt=now, mastered=false`.

- [ ] **Step 5: Implement the study_* tools**

Rewrite `index.js`. Register four tools:

`study_teach(concept, {kb, depth})`: If `kb` given, call `searchDocs` and pass snippets as evidence to an in-tool description of the concept organized as: core conclusion → derivation steps → comparison table → common pitfalls. Return `{ok, content, evidence}`.

`study_quiz(topic, {count, difficulty, kb})`: Returns a fixed schema with `count` (default 5, clamped 1–20), `difficulty` (easy/medium/hard/mixed, default medium), `kb` optional. The tool does NOT generate questions itself (that's the model's job); instead it returns `{ok, hints: [{stem_hint, correctIndex_hint, difficulty} ...]}` with 5 templated question prompts that the agent can expand. The actual question generation happens in the prompt section.

Wait — correction per design: `study_quiz` returns structured question templates the model fills in. But per the design document's clarification, `study_quiz` returns "结构化的题目 JSON 约定". For the first version, have it return `{ok, template: {num_questions, difficulty, knowledge_point, format: 'mcq_4choice'}}` as a hint, and let the system prompt govern actual generation. The grading path is the important piece.

Actually, re-read the design: "study_quiz(topic, count, difficulty, kb?) —— 宿主不做内容生产". So the tool just validates args and returns `{ok, config} where config mirrors what was requested`. The agent uses this to confirm intent before generating. Let's keep it simple: tool returns `{ok, params: {topic, count, difficulty, kb}}`.

`study_review()`: Reads the last graded quiz result from `.study/last-grade.json`. Returns `{ok, lastGrade}` or `{ok, null}` if never graded.

`study_kb(action, {kb, query, title, content})`: Dispatches to `kb.mjs`. Actions: list, create, delete, search, add, file. Returns structured responses.

- [ ] **Step 6: Implement HTTP routes**

Register four routes via `ctx.connection.fetch.register`:

`GET/POST /api/study/wrong-answers`:
- GET: returns `{workspace, items, dueToday: [...]}`
- POST body `{action, id, answer?}`: action `mastered` → `markMastered`; action `practice` → `schedulePractice`; action `answer` → `gradedAnswer(workspace, id, correct)`. On `answer`, return `{ok, correct, intervalDays, mastered}`.

`POST /api/study/grade`:
- Body `{questions, userAnswers}` where questions is the payload sent to the client and userAnswers is `{[questionId]: selectedIndex}`.
- Validates each answer against the stored correctIndex.
- Returns `{score, total, perQuestion: [{id, correct, userAnswer, correctAnswer, explanation}], wrongItems: [...]}`.
- Writes wrong items to wa.mjs, writes summary to `last-grade.json`.
- Atomic write via tmp+rename.

`GET/POST /api/study/kb`:
- GET: list or read doc (`?docs=<kb>&?file=<name>`).
- POST: create, delete, setDefault, add.

`GET /api/study/health`:
- Returns `{writeable: bool, studyDir: string}`.

All handlers return JSON with proper content-type and wrap in try/catch returning `{error, message}`.

- [ ] **Step 7: Write the system prompt section**

Register a `systemPrompt.section` with `order: 10200` (same as existing). Text includes:
- Which tools to use for learning requests
- "Use `study_quiz` to confirm parameters, then generate questions"
- "After grading, always call `study_review` to pick up results for dashboard"
- "Never fabricate quiz content or mastery scores"
- "One quiz fence per turn"
- Reference to the `deeptutor-quiz` fence shape

- [ ] **Step 8: Run tests and verify**

Run: `node --test tests/host/study-tools.test.mjs` (Node 22+ built-in test runner).
Expected: all pass. Also run `node --check deeptutor-plugin/index.js` to verify ESM syntax.

- [ ] **Step 9: Commit**

```bash
git add deeptutor-plugin/index.js deeptutor-plugin/src/idx.mjs deeptutor-plugin/src/kb.mjs deeptutor-plugin/src/wa.mjs tests/ deeptutor-plugin/scripts/deleted-marker.txt
git commit -m "refactor: rewrite plugin as pure-JS study mode tools"
```

---

### Task 2: Client extension — quiz fence + 3 sidebar pages

**Files:**
- Modify: `deeptutor-plugin/client.js` (append new sections)
- Test: `tests/client/probe.mjs` (extends existing)

**Interfaces:**
- Consumes: `window.__ModuleLoader__.load`, `React`, `slots.inject`, `slots.register`, `styles.insert`, `locale.register`
- Produces: extends the existing `@local/deeptutor` module to also register three new sidebar entries and one new fence type

- [ ] **Step 1: Add the `deeptutor-quiz` fence renderer**

Append to `client.js` a new module load or extend the existing factory. The fence handler checks `props.lang === 'deeptutor-quiz'` and renders:
- A list of questions, each with a radio group of 4 options
- A single "提交答案" button (disabled until all answered)
- After submit, POST to `/api/study/grade`, display per-question verdict (green/red), explanation revealed
- Fallback to `props.children` on streaming or invalid JSON

State shape: `{questions: [{id, stem, options[4], correctIndex, explanation}], userAnswers: {[id]: number}, submitted: bool, verdict: null | {perQuestion, score, total}}`.

- [ ] **Step 3: Add the wrong-answers sidebar page**

Module ID `@local/deeptutor/wrongbook`. Inject at `sidebar.panellist` order 6.
- GET `/api/study/wrong-answers` on mount, show grouped by topic
- Stats row: today due / mastered / total
- Each item: topic badge, question text, user's answer vs correct, due-date badge
- Actions: "已掌握" button → POST mastered; "再练一次" → POST practice
- Page-in redo: click item → shows radio options → submit → POST answer → server returns verdict → update interval badge
- Empty state: "本面板暂无练习内容。"

- [ ] **Step 4: Add the knowledge-base sidebar page**

Module ID `@local/deeptutor/knowledge`. Inject at `sidebar.panellist` order 7.
- List KBs with doc count, default badge
- New KB: name + description textarea → POST /kb create
- Delete: confirm dialog → POST /kb delete
- Add doc: textarea → POST /kb add → trigger reindex
- Search: input → GET /kb?search= → show result snippets
- Preview: click file → GET /kb?file= → show text content in modal

- [ ] **Step 5: Add the review sidebar page**

Module ID `@local/deeptutor/review`. Inject at `sidebar.panellist` order 8.
- Select KB from dropdown (from /kb list)
- Show overview card with doc count and last updated
- "开始温习" button: constructs a pre-filled message "帮我温习 <kb_name>" and triggers conversation input (via DSH slot or direct message injection if available)
- Fallback: copy text to clipboard + show it in a copyable block

- [ ] **Step 6: Wire up locale keys**

Add to `locale/zh.json`: keys for all sidebar labels, buttons, stats, and empty states with `study.` prefix. Mirror in `locale/en.json`.

- [ ] **Step 7: Run probe and syntax check**

Run: `node --check deeptutor-plugin/client.js` and `node tests/client/probe.mjs` (if exists).
Expected: syntax ok, no runtime errors in probe output.

- [ ] **Step 8: Commit**

```bash
git add deeptutor-plugin/client.js deeptutor-plugin/locale/
git commit -m "feat: add quiz fence and 3 sidebar pages"
```

---

### Task 3: Wiring — cordis.patch.yml + package.json cleanup

**Files:**
- Modify: `deeptutor-plugin/cordis.patch.yml`
- Modify: `deeptutor-plugin/package.json`

- [ ] **Step 1: Update cordis.patch.yml to add the study preset**

Keep the existing plugin insertion. Add after it:
```yaml
- id: preset-study
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: study
    name: 学习模式
    description: 纯 JS 学习模式：讲解/出题/错题本/知识库（无 Python 依赖）
    order: 5
    plugins:
    - id: persona
      name: '@deepseek-ai/dsh-persona'
      config:
        prefix: You are a personalized learning assistant powered by the {{model}} model.
        suffix: |
          当前处于「学习模式」。学习类请求优先使用 study_* 工具完成。
          
          study_teach 用于讲解；study_quiz 用于确认出题参数后生成题目；
          study_review 用于读取最近一次判分结果；study_kb 用于知识库操作。
          
          铁律：
          - 出题后用户必须通过 `deeptutor-quiz` 围栏作答，判分经 /api/study/grade 完成
          - 错题自动写入工作区 .study/wrong-answers.json，间隔复习规则由服务端执行
          - 不要用 deeptutor_run 或任何 CLI 调用（本插件已不依赖 DeepTutor）
          - deeptutor-dashboard 围栏只展示真实结果，不编造掌握度或错题
          
          DSH 的其余工具（文件、搜索、web）照常可用。
      - id: tool-todo
      - id: tool-web
        config:
          fetch: true
          searchTimeoutMs: 60000
      - id: present
      - id: tool-ask-user
      - id: tool-fs
      - id: tool-fs-search
    - id: deeptutor
      name: '@local/deeptutor'
```

Simplify the plugin list: keep only the essentials (persona, tool-todo, tool-web, present, tool-ask-user, tool-fs, tool-fs-search, and the plugin itself). Drop the long delegation/compaction/planning blocks from the reference — they bloat the preset and rot with DSH updates.

- [ ] **Step 2: Clean up package.json**

Remove the `postinstall` script. Remove `dsh-deeptutor` from dependencies (it was never listed but verify). The `files` array should still include `src/`, `tests/`, `docs/`. Keep `locale/*.json`.

- [ ] **Step 3: Verify YAML syntax**

Run: `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('deeptutor-plugin/cordis.patch.yml','utf8'))" 2>&1 || echo "no js-yaml; checking with python"` 
Python fallback: `python -c "import yaml; yaml.safe_load(open('deeptutor-plugin/cordis.patch.yml'))"` if available.
Expected: no parse errors.

- [ ] **Step 4: Commit**

```bash
git add deeptutor-plugin/cordis.patch.yml deeptutor-plugin/package.json
git commit -m "chore: wire study preset and clean package.json"
```

---

### Task 4: Integration smoke test & docs

**Files:**
- Modify: `docs/DETAIL.zh.md`
- Create: `tests/integration/smoke.mjs`

- [ ] **Step 1: Write smoke test**

Create `tests/integration/smoke.mjs` that:
1. Creates a temp workspace directory
2. Calls `study_kb create` → verifies registry entry
3. Calls `study_kb add` → verifies file written and index rebuilt
4. Calls `study_quiz` → verifies returned config shape
5. Simulates grading via the route handler directly → verifies wrong-answers written
6. Verifies interval advancement logic for 2 correct then 1 wrong
7. Cleans up temp dir

Run: `node --test tests/integration/smoke.mjs`
Expected: all assertions pass.

- [ ] **Step 2: Update DETAIL.zh.md**

Rewrite the doc to reflect the new architecture. Key sections:
- "纯 JS 实现，零 Python 依赖"
- 6 个 study_* 工具说明
- 三个侧栏页面说明
- 数据存放在工作区 `.study/`
- 错题本间隔复习机制
- 与旧版 CLI 模式的区别

- [ ] **Step 3: Final commit**

```bash
git add tests/integration/smoke.mjs docs/DETAIL.zh.md
git commit -m "docs: update DETAIL and add smoke tests"
```
