# 纯 JS 学习模式插件

将 [DeepTutor](https://github.com/HKUDS/DeepTutor)（HKUDS 个性化 AI 辅导运行时）的学习能力
以**纯 JavaScript** 形式移植进 DeepSeek Harness —— 不连接 DeepTutor 运行时，
不 pip 安装、不调它的 CLI、不用它的模型配置。内容生产（讲解、命题）由 DSH 会话模型承担，
插件自身只负责检索、判分、错题本与知识库的记忆管理。

## 核心差异：纯 JS 实现，零 Python 依赖

本插件与旧版 DeepTutor CLI 驱动的根本区别是：**完全在 Node.js 中以纯 JavaScript 实现**，不再需要：

- Python 3.10+ / winget / pip
- DeepTutor CLI 安装器（`scripts/bootstrap.js` 与 `.setup/` 已删除）
- 约 500MB 的模型下载或运行时安装

学习闭环由插件自身提供：讲解、出题判分、错题本间隔复习、知识库管理，
全部落回工作区本地文件，开箱即用。

## 架构总览

宿主（`index.js`）注入 `['tools', 'systemPrompt', 'connection']`，注册 study_* 工具、
系统提示词段与 HTTP 路由；检索由 `src/idx.mjs`（字符 2-gram BM25）、知识库存储由
`src/kb.mjs`、错题本由 `src/wa.mjs` 三个零依赖模块承担。客户端（`client.js`）扩展围栏层
+ 三个侧栏页面。

## 数据存放：工作区 `.study/`

```
<workspace>/.study/
  kb/<库名>/raw/<文档>.md        # 文档原文（UTF-8 Markdown，原子写入）
  kb/<库名>/index.json           # 倒排索引（写入时重建，字符 2-gram BM25）
  kb/kb_registry.json            # 库登记表：名称、描述、默认库、创建/更新时间
  wrong-answers.json             # 错题本（schema v2，间隔复习字段）
  last-grade.json                # 最近一次判分记录（供 study_review 读取）
```

所有 JSON 写入均采用 tmp+rename 原子写，并发判分不会损坏数据文件。

## study_* 工具说明

| 工具 | 用途 |
|---|---|
| `study_teach(concept, {kb?, depth?})` | 讲解工具：带 `kb` 时宿主内部执行 BM25 检索，把证据片段（文件名 + 原文 + 评分）作为 `evidence` 随返回值交给模型，按「核心结论 → 推导步骤 → 对比表 → 易错点」组织讲解。 |
| `study_quiz(topic, {count?, difficulty?, kb?})` | 出题参数确认：宿主不做内容生产，返回 `{ok, params: {topic, count(1–20，默认5), difficulty(easy/medium/hard/mixed，默认medium), kb}}`。模型随后以 `deeptutor-quiz` 围栏生成并呈现 4 选项单选题。 |
| `study_kb(action, {...})` | 知识库 CRUD 分发器：`list` / `create` / `delete` / `add` / `search` / `file`。search 返回 BM25 top-k 片段（文件名、偏移、评分）；add 即时重建索引。 |
| `study_review()` | 读取 `.study/last-grade.json`，返回最近一次判分（score / total / wrongCount / 错题要点最多 3 条）。Agent 在用户提交答案后调用，用真实结果生成 dashboard，不得编造。 |

判分不是独立工具：唯一入口是 `/api/study/grade` 路由（客户端直连）与错题本页面的
`answer` 动作（页面重做），从机制上杜绝模型替用户作答。

典型流程：`study_teach` 取证据 → `study_quiz` 确认参数 → 模型写 `deeptutor-quiz` 围栏
→ 用户作答，客户端直连 `/api/study/grade` 判分 → `study_review` 读取真实成绩 →
`deeptutor-dashboard` 围栏汇报，错题自动进侧栏「错题本」。

## HTTP 路由

经 `ctx.connection.fetch.register` 注册（同源，无 CORS 配置）：

- `GET/POST /api/study/wrong-answers` — 读取错题本（`?due=1` 只返回到期项）；POST 动作：
  `mastered`（手动掌握）、`practice`（立即到期）、`answer`（页面重做，服务端判分 + 间隔推进）。
- `POST /api/study/grade` — 判分入库。请求 `{questions, userAnswers}`，返回逐题对错、
  成绩摘要；错题写入 `wrong-answers.json`，摘要写入 `last-grade.json`。
- `GET/POST /api/study/kb` — 知识库端点：GET 列库 / `?docs=` 列文档 / `?file=` 预览；
  POST `create` / `delete` / `setDefault` / `add`。
- `GET /api/study/health` — 健康检查，返回 `.study/` 目录可写性。

## 客户端围栏与侧栏

### deeptutor-quiz 围栏

多题列表、每题四选项单选、共用「提交并查看成绩」按钮。提交前隐藏正确答案与解析；
提交后 `POST /api/study/grade`，返回后逐题标对错、展开解析、提示错题收录。流式输出中或
JSON 无效时优雅降级为普通代码块。

### deeptutor-dashboard 围栏

沿用现有面板渲染（掌握度、薄弱环节、计划、练习题、卡片、下一步、来源），每 turn 至多一个，
只展示经 `study_review` 拿到的真实数据。

### 三个侧栏页面

| 页 | order | 说明 |
|---|---|---|
| 错题本 `@local/deeptutor/wrongbook` | 6 | 按知识点分组，统计「今天该复习 / 已掌握 / 全部」；页面内重做触发 POST answer，间隔推进由服务端执行；到期徽标。 |
| 知识库管理 `@local/deeptutor/knowledge` | 7 | 库列表（文档数、更新时间、默认标记）、新建、删除（确认后）、粘贴导入、文档预览。 |
| 温习 `@local/deeptutor/review` | 8 | 选库 → 库概览 → 预填「帮我温习 <库名>」发送到当前会话，Agent 用 `study_teach`/`study_quiz` 完成讲解与出题；判分后错题自动进错题本。 |

## 错题本间隔复习机制

错题数据 schema v2（字段：`id, topic, question, options, correctIndex, userAnswer,
correctAnswer, explanation, wrongAt, dueAt, mastered, masteredAt, intervalDays`），
存单个 JSON 文件，是唯一事实来源。

规则（判定只发生在宿主，客户端无权篡改）：

- 错题入库：`intervalDays = 1`，`dueAt = wrongAt + 1 天`。
- 答对：`intervalDays` 沿阶梯 **1 → 3 → 7 → 21** 天推进，`dueAt` 随之拉远。
- 达到 21 天且再次答对：自动标记 `mastered = true`，写入 `masteredAt`（自动掌握）。
- 答错：`intervalDays = 1`，`dueAt = now`，清除 `mastered`/`masteredAt`
  （自动回池，重新开始复习周期）。
- 侧栏「已掌握」按钮可手动提前标记；「再练一次」把 `dueAt` 拉到现在并重置间隔。

## 与旧版 CLI 模式的对比

| 维度 | 旧版（CLI 驱动） | 新版（纯 JS） |
|---|---|---|
| 运行时 | Python + DeepTutor CLI（约 500MB） | Node.js ESM，零下载 |
| 安装流程 | `scripts/bootstrap.js` pip 安装、检测 Python、winget | 无；开箱即用 |
| 知识库存放 | DeepTutor home 目录 | `<workspace>/.study/kb/` |
| 错题本 | DeepTutor 内部状态 | `.study/wrong-answers.json` |
| 判分路径 | CLI 返回 + 模型整理 | 客户端直连 `/api/study/grade`，模型无篡改入口 |
| 检索 | BookEngine / BGE 向量（需额外下载） | 字符 2-gram BM25，纯 JS 几十行 |
| 系统提示词段 | 沿用 `CAPABILITY_SECTION` | 重写为学习模式协议 + 铁律约束 |
| 功能取舍 | 完整 DeepTutor 能力 | 聚焦讲解/出题/判分/错题本/知识库；写书、画图动画、会话导出等移出范围（研究用 DSH 自带 web 工具） |

## 接线（cordis.patch.yml / package.json）

`cordis.patch.yml` 承担两项职责：

1. **插件注册** — `id: deeptutor` 指向 `@local/deeptutor`，配置 `sandboxUrl`。
2. **学习模式预设** — `id: preset-study`（`@deepseek-ai/dsh-agent-preset`，order 5），
   persona 后缀包含工具清单、铁律与围栏约定；插件列表精简到必须项
   （persona、tool-todo、tool-web、present、tool-ask-user、tool-fs、tool-fs-search、deeptutor）。

用户在会话预设切换器选「学习模式」一键激活；不选则学习工具仍注册在默认 Agent。
`package.json` 已无 `postinstall` 与 Python 相关依赖。

## 数据安全性

- `study_quiz` 不生产题目内容，避免模型幻觉污染结构化数据。
- 判分唯一入口是 `/api/study/grade` 与错题本页面 `answer` 动作，模型无绕过途径。
- `wrong-answers.json` tmp+rename 原子写入，并发场景不会损坏。
- `deeptutor-dashboard` 只装载 `study_review` 返回的真实结果，Agent 不得伪造掌握度或错题。

## 使用方式

在任何 DSH 会话中提出学习请求，例如「帮我彻底理解傅里叶变换，安排练习并跟踪我的掌握度」。
选「学习模式」预设后无需任何环境搭建，开箱即用。测试可运行：

```bash
node --test tests/host/test-idx.mjs       # BM25 索引器
node --test tests/host/test-wa.mjs        # 错题本间隔复习
node --test tests/host/test-kb.mjs        # 知识库存储
node --test tests/host/study-tools.test.mjs
node --test tests/integration/smoke.mjs   # 端到端冒烟
```
