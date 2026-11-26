# DeepTutor integration

Integrates [DeepTutor](https://github.com/HKUDS/DeepTutor) — the HKUDS
personalized AI-tutoring runtime — into DeepSeek Harness as real capabilities,
not a re-creation.

## What it installs and wires

- **Agent tools that drive the real runtime.** `deeptutor_run` executes one
  turn of any DeepTutor capability (chat, ask_questions, deep_solve,
  deep_question, deep_research, visualize, math_animator, video_lesson,
  mastery_path, immersive_reading, audio_overview) through the official CLI's
  NDJSON interface, returning the content and a session id for continuation.
  `deeptutor_kb` operates on DeepTutor knowledge bases (list, search, info,
  create, add, delete). `deeptutor_status` runs readiness diagnostics.
- **Automatic CLI installation.** If `deeptutor` is not found, the plugin
  bootstraps it: detect Python 3.10+ (winget fallback on Windows), `pip install
  deeptutor`, create default config with `deeptutor init --non-interactive`,
  then verify with `deeptutor doctor`. The installer writes progress to
  `.setup/install-status.json` beside the package and runs detached, so it
  survives the plugin activation. `deeptutor_install` re-runs or drives it
  manually. Set `DEEPTUTOR_BIN` or `DEEPTUTOR_PYTHON` to pin executables.
- **Chat dashboard panel.** A language-keyed fence layer renders
  ` ```deeptutor-dashboard ` code blocks in chat as a learning panel: mastery
  meter and ring, prioritized knowledge gaps, study plan with done checkboxes,
  a practice question with submit and grading, flip-to-reveal flashcards, next
  steps and sources. Invalid or streaming fences degrade to a plain code block.
- **Capability prompt section.** Teaches the agent when to call DeepTutor, how
  to continue tutoring sessions, and to summarize only ACTUAL run output into
  the dashboard fence — never fabricate learning state.

## Usage

Ask for tutoring in any session — for example "帮我彻底理解傅里叶变换，安排练习
并跟踪我的掌握度". The agent checks readiness (auto-installing if needed), runs
the real DeepTutor capabilities, and presents the returned learning state in
the panel. DeepTutor's own model credentials are configured in its runtime
(`deeptutor init` / its settings), independent of DeepSeek Harness providers.

## Notes and limitations

- Installer的地方：依赖 Windows winget 或已存在的 Python；macOS/Linux 用户需先装
  Python 3.10+（安装器会留下精确的安装指引）。
- First `deeptutor doctor` after install may warn until a model provider is
  configured inside DeepTutor; the CLI itself is then already usable.
- Sessions and knowledge bases live in DeepTutor's own home directory, not in
  the Harness workspace.
