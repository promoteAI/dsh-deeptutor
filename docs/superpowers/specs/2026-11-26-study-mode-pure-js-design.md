# 纯 JS 学习模式插件设计（dsh-deeptutor 重构）

日期：2026-11-26
状态：待用户批准

## 意图与为什么

把参考仓库 [hyyzero/dsh-deeptutor-study](https://github.com/hyyzero/dsh-deeptutor-study)
的「学习模式」能力移植进本工作区的 `deeptutor-plugin`，但**不再连接 DeepTutor 运行时**：
不 pip 安装 deeptutor、不调它的 CLI、不用它的模型配置。DeepTutor 的核心学习功能
由插件自身以纯 JavaScript 实现完成移植。

动机（用户确认）：

- 彻底摆脱 Python 环境、pip 依赖与约 500MB 的安装流程（bootstrap.js 整套删除）。
- 不再绕两道模型配置：内容生产由 DSH 会话模型直接承担。
- 与 DeepTutor 版本演进解耦（参考仓库锁 1.7.2，BookEngine 内部 API 随时会破）。

用户已确认的决策：

- **纯 JS 插件**：零 Python、零模型下载；检索用纯 JS 实现。
- **功能范围 = 核心学习闭环**：讲解、出题判分、错题本、知识库、温习页、学习路径。
  研究复用 DSH 自带 web 工具（不移植）。写书、画图动画、总结入库不移植。
- **知识库来源 = 模型直接写入**：网页/对话/粘贴的资料由 Agent 经工具存进库；
  侧栏页提供粘贴导入。不做文件夹批量导入。

## 现状（会动到的东西）

现有 `deeptutor-plugin` 三部分：

- `index.js`（宿主）：`deeptutor_run` / `deeptutor_kb` / `deeptutor_install` /
  `deeptutor_status` 四个工具全部 spawn DeepTutor CLI；`scripts/bootstrap.js`
  是 pip 安装器。—— **这部分整体删除重写**。
- `client.js`（客户端）：`deeptutor-dashboard` 围栏面板（掌握度、薄弱环节、计划、
  练习题、卡片、下一步、来源）已经纯渲染、不依赖 DeepTutor。**保留复用**。
- `cordis.patch.yml` / `package.json`：接线方式保留，具体注册内容按新设计改写。

参考仓库提供的可移植资产（思想层面，代码按纯 JS 需要）、经由通读本仓库确认：

- 错题本数据模型与间隔复习规则（1/3/7/21 天，答错回 1 天，答对拉长间隔），
  schema v2，存工作区单个 JSON。**直接采用**。
- 交互协议（study-flow 技能）：动作菜单、quiz 卡片本地判分、结果卡片。
  **改为插件提示词段 + 工具设计承载，不再依赖 GenUI peer 插件**（用
  deeptutor-dashboard 围栏 + DSH 原生 ask_user 风格能力，避免可选依赖）。
- 温习页「讲解→出题→判分」流程。**移植为侧栏页**。
- 知识库管理页（列表、建库、删除、预览）。**移植并简化**（模型写入 +
  粘贴导入，没有 docs-dir 索引任务），检索保存在线即可用。

## 方案对比（如何实现检索——唯一的重量级选择）

| 方案 | 内容 | 取舍 |
|---|---|---|
| A. 字符二元切分 + BM25（选定） | 中文按 2-gram、英文按词切分，倒排索引 + BM25 评分，索引 JSON 存工作区 | 零依赖、零下载、几十行实现；召回质量弱于向量检索，但配合模型直接读原文出题/讲解，实际效果足够（关键词命中即可给模型当证据用） |
| B. 纯 JS 向量（如 transformers.js + 小模型） | ONNX runtime + 模型文件 | 又回到「下载几百 MB + 安装流程」，与本次动机冲突，弃 |
| C. 不做检索 | 知识库只是文档集合，出题时让模型通读 | 文档一多就超上下文，退化不可用，弃 |

其余实现路径没有真正的分叉：宿主走 `tools` + `systemPrompt` + `connection` 路由
（本工作区现有 index.js 与参考仓库 lib/index.js 已示范同样接线方式）。

## 设计

### 数据存放在工作区（不用 DeepTutor home）

```
<workspace>/.study/
  kb/<库名>/raw/<文档>.md        # 文档原文（UTF-8 Markdown）
  kb/<库名>/index.json           # 倒排索引（构建于写入时）
  kb/kb_registry.json            # 库登记表：名称、描述、默认库、创建时间
  wrong-answers.json             # 错题本（schema v2，间隔复习字段同参考仓库）
```

- 数据存放在 `.study/`（非 `.dsh-study`）；本插件是参考仓库
  `dsh-deeptutor-study` 的**替代者**，按独占安装处理，不做共存兼容。
- 错题 schema v2 字段沿用：id, topic, question, options, correctIndex,
  userAnswer, correctAnswer, explanation, wrongAt, dueAt, mastered, masteredAt。
- 间隔复习规则：判分入库时 dueAt = wrongAt + 1 天；页面答对间隔 ×（1→3→7→21），
  答错回 1 天并解除掌握标记。规则实现在宿主路由（单一事实来源），客户端只调用。

### 宿主 `index.js`（重写）

注入 `['tools', 'systemPrompt', 'connection']`。

**注册的工具**（替换原有 4 个 deeptutor_* CLI 工具）：

1. `study_teach(concept, kb?, depth?)` —— 讲解工具：给定 `kb` 时宿主内部执行
   BM25 检索并把证据片段（文件名 + 原文 + 偏移）随返回值一并交给模型，
   模型按「核心结论 → 推导步骤 → 对比表 → 易错点」组织讲解。工具本身
   触库读盘（不是纯提示词包装）。
2. `study_quiz(topic, count, difficulty, kb?)` —— 出题工具：宿主不做内容
   生产；该工具的价值在于返回结构化的题目 JSON 约定（题干、四选项、
   correctIndex 从 0 起、解析），提示词段指导模型把题目以
   `deeptutor-quiz` 围栏写进对话（schema 见下）。`kb` 指定时模型应先取
   证据再命题（可经 study_teach 或 study_kb search）。
3. **判分链路（核心决策）**：题目进围栏后，判分完全绕开模型 ——
   - client.js 新增 `deeptutor-quiz` 围栏渲染器：多题、每题单选、共用一个
     提交按钮；正确答案与解析在提交前不渲染（隐藏在围栏 payload 中）。
   - 用户点提交 → 客户端 POST `/api/study/grade`（携带围栏 payload 与
     用户所选）→ 宿主判分、写 wrong-answers.json、返回逐题结果与成绩。
   - 客户端就地显示对错、解析、错题收录提示；同时把成绩摘要写回对话
     下方（隐藏占位或提示 Agent 已可读取），Agent 下一轮用
     `study_review`（见下）读取真实结果以生成 dashboard 围栏与总结。
   - 该路由同时是「判分后必须落库」铁律的机制保障：落库发生在宿主，
     模型没有绕过的必要。
4. `study_kb(action, kb, ...)` —— 知识库操作：list / create / delete /
   search。search 返回 BM25 top-k 片段（带文件名与偏移）。
5. `study_kb_add(kb, title, content)` —— 模型写入：Agent 把网页抓取、
   对话结论、粘贴资料整理成 Markdown 存入 `raw/`，并即时更新索引。
6. `study_review()` —— 读取最近一次判分记录（成绩、逐题对错、错题要点），
   供 Agent 在用户提交答案后的下一轮生成 dashboard 围栏与总结，不需要
   用户转述或模型编造结果。

工具输出全部为结构化 JSON（沿用现有 RESULT_SCHEMA 风格）。

**提示词段**（取代现有 CAPABILITY_SECTION）：

- 何时用学习工具；出题必走 study_quiz 以 `deeptutor-quiz` 围栏呈现
  （不许只在聊天文本里出题）；判分由客户端直连 grade 路由完成，Agent
  在用户提交后用 study_review 读取真实成绩、向用户汇报并提示错题本页面；
- 学习面板约定：真实的运行结果（判分成绩、掌握度变化、错题要点）整理进
  `deeptutor-dashboard` 围栏（dashboard 围栏 schema 与渲染逻辑不变）；
- 不编造：面板数据只能来自 study_review 等工具的真实返回。

**HTTP 路由**（connection.fetch.register，同参考仓库模式）：

- `GET/POST /api/study/wrong-answers` —— 读取错题本；POST 动作：
  - `mastered` —— 手动标记掌握（用户按钮）；
  - `practice` —— 立即到期（把 dueAt 拉到现在）；
  - `answer` —— 页面重做提交：携带错题 id 与用户所选项，宿主判分并执行
    间隔推进（答对 1→3→7→21 天拉长，答错回 1 天；21 天间隔答对自动标记
    掌握，`mastered` 按钮仍可手动标记）。间隔规则只在宿主实现。
- `POST /api/study/grade` —— 判分入库（见上判分链路）：请求携带题目数组
  与用户答案，返回逐题结果、成绩摘要；错题写入 wrong-answers.json，
  并记录最近一次判分（供 study_review 读取）。
- `GET /api/study/kb`，`POST /api/study/kb` —— 列表/建库/删除/默认库；
  GET 支持 `?docs=`（列文档）与 `?file=`（读文档预览）。
- `GET /api/study/health` —— 简单健康检查（返回数据目录可写性），供功能面板用。

### 客户端 `client.js`（扩展）

保留现有 dashboard 围栏（仅展示判分后的学习状态摘要，单题 question
字段用于展示待做练习，schema 不变）；**新增** `deeptutor-quiz` 围栏渲染器：

- 多题列表（每题四选项单选、互斥）、共用一个「提交并查看成绩」按钮；
- 提交前不显示正确答案与解析；提交后 POST /api/study/grade，返回后逐题
  标对错、展开解析、提示已收录 N 道错题；
- 流式输出中或 JSON 无效时降级为普通代码块（沿用现有围栏层的降级逻辑）。

侧栏新增三个入口（沿用现有 `window.__ModuleLoader__.load` 与 `slots`
注入模式，无构建步骤）：

1. **错题本**（`sidebar.panellist` order 6）—— 按知识点分组，统计三项
   （今天该复习 / 已掌握 / 全部）；页面内可点选重做，提交走
   `POST answer`（间隔复习与判分都在服务端）；到期徽标。
2. **知识库管理**（order 7）—— 库列表（文档数、更新时间、默认标记）、新建、
   删除（确认后调 POST）、粘贴导入（textarea → /api/study/kb POST 的
   add 动作，服务端入库与建索引）、点开预览文档原文。
3. **温习**（order 8)—— 选库 → 展示该库概览 → 引导发消息到对话
   （「帮我温习 <库名>」预填，用户回车发出），由 Agent 用 study_teach /
   study_quiz 完成讲解与出题；判分后错题自动进错题本。不做参考仓库的
   「剪贴板复制 + 新会话」，直接走当前会话发消息，少一步。

### 交互协议（提示词段内置，不做成独立 skill 插件）

核心铁律压缩为几条进入系统提示词：

1. 学习请求先给动作菜单（讲解 / 出题 / 学习路径 / 温习知识库），用 ask 系
   能力让用户点选；
2. 出题一律经 study_quiz 生成，以 `deeptutor-quiz` 围栏渲染成可点选题目；
   用户提交后判分由客户端直连 `/api/study/grade` 完成，**不经过模型**；
3. 答案与解析不随题直接展示（围栏 payload 中对用户隐藏渲染），判分后由
   grade 返回并在围栏内揭示；Agent 经 study_review 读真实结果做总结；
4. deeptutor-dashboard 围栏只装真实结果（判分成绩、错题要点、掌握度），
   每 turn 至多一个。

### 不做的事（non-goals）

- 不移植：写书（BookEngine）、画图动画模板（viz-template）、总结入库
  （digest.py / kb-digest）、会话导出（session-tool.py）、本地向量服务
  （embed_server.py / BGE 模型）、DeepTutor CLI 安装器（bootstrap.js）。
- 不提供 GenUI quiz 卡片对齐（那依赖 peer 插件 @changfenhuang/dsh-genui）；
  题目交互走本插件自有的围栏 + 客户端组件。
- 不做文件夹批量导入、回收站、改名（首版）；不做 Python/winget 自动安装。

### 接线（cordis.patch.yml / package.json）

`cordis.patch.yml` 做两件事：

1. **注册本插件**（默认注册）—— 保留现有 `sandboxUrl` 写法（客户端
   路由调用需要同源）。
2. **新增「学习模式」预设**：注册一个 `@deepseek-ai/dsh-agent-preset`
   实例，id 取 `study`，name 取「学习模式」，order 5。persona 前缀用
   「你是 DeepSeek 辅导助手」；persona 后缀把提示词段内容完整塞入（
   工具清单、研究协议、错题落库铁律、面板围栏约定）；插件列表参考参考
   仓库的镜像方式，但把 `dsh-deeptutor`（旧的 DeepTutor 宿主）换成
   本插件的 id `@local/deeptutor`，并去掉不需要的 bash/pwsh 工具（非
   Windows 不需要 pwsh）。

用户可从会话预设切换器选「学习模式」激活；不选则学习工具仍注册在
默认 Agent 上（与参考仓库一致，随时可切换）。

`package.json`：去掉 postinstall，不再依赖 `dsh-deeptutor` peer，
删除对 GenUI peer 插件的可选依赖（功能不再需要它）。

### 风险与既定取舍

- BM25 二元检索对「同义改述」类查询召回弱 → 靠 Agent 多角度检索 + 模型
  直接读原文补偿；知识库主要用途是出题/讲解证据而非全文搜索。
- 学习交互依赖 DSH 前端 slots 结构（`main`、`sidebar.panellist`），
  与参考仓库同源，风险与参考仓库一致。
- 判分走客户端直连 grade 路由：无 GenUI peer 依赖、模型无篡改判分入口、
  落库由机制保证；代价是 quiz payload（含正确答案）出现在对话文本中，
  只要用户不点开无关紧要，但「引用源代码里含答案」属可接受取舍。
- `study_grade` 不存在为独立工具；判分入口只有 `/api/study/grade`
  （客户端）与错题本页面的 `answer` 动作（页面重做），单一入口避免
  模型替用户作答。

## 交给实现者的自由裁量

- 工具参数细节、路由错误码、页面视觉（沿用现有主题 token 风格）。
- 索引文件的具体格式（倒排表结构）、BM25 参数（k1/b 常规取值即可）。
- locale 文件的组织方式。
- 文档预览的截断长度等辅助常量。
