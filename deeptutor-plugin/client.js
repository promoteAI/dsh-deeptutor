window.__ModuleLoader__.load({
  id: '@local/deeptutor',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Locale labels: this deployment's user works in Chinese; English fallback.
    let zh = false;
    try { zh = /zh/i.test(navigator.language); } catch (e) { zh = false; }
    const L = zh ? {
      title: 'DeepTutor 学习面板', powered: 'AI 导师 · 建议结合对话使用',
      mastery: '掌握度', statusLearning: '学习中', statusReview: '复习中', statusAssessment: '测验中',
      gaps: '薄弱环节', plan: '学习计划', question: '随堂练习', flashcards: '知识卡片',
      next: '下一步', sources: '引用来源',
      submit: '提交答案', correct: '回答正确', wrong: '回答有误', pickFirst: '请先选择一个选项。',
      done: '已完成', undone: '未完成',
      priHigh: '高优先级', priMedium: '中优先级', priLow: '低优先级',
      empty: '本面板暂无练习内容。',
      flipHint: '点击卡片翻面', again: '换一批',
      // Study-mode extensions (quiz fence + sidebar pages); mirrors locale/zh.json study.*.
      quizTitle: '随堂测验', quizSubmit: '提交答案', quizSubmitting: '提交中…',
      quizScore: '得分', quizGraded: '已判分', quizCorrect: '答对', quizWrong: '答错',
      quizWrongCount: '收录错题', quizPending: '请完成所有题目后再提交。',
      wrongbookTitle: '错题本', wrongbookDueToday: '今日复习', wrongbookMastered: '已掌握',
      wrongbookTotal: '全部', wrongbookMasteredBtn: '已掌握', wrongbookPracticeBtn: '再练一次',
      wrongbookAnswered: '你的答案', wrongbookCorrectAnswer: '正确答案',
      wrongbookDueBadge: '已到期', wrongbookRedoSubmit: '提交答案',
      kbTitle: '知识库管理', kbDocCount: '文档数', kbUpdated: '更新时间', kbDefault: '默认',
      kbNewKb: '新建知识库', kbName: '名称', kbDesc: '描述', kbCreate: '创建', kbDelete: '删除',
      kbAddDoc: '添加文档', kbSearch: '搜索', kbConfirmDelete: '确定要删除知识库「%s」吗？此操作不可恢复。',
      kbError: '操作失败：%s', kbAddTitle: '文档标题',
      reviewTitle: '开始温习', reviewSelectKb: '选择知识库', reviewOverview: '概览',
      reviewDocs: '文档数', reviewLastUpdated: '最后更新', reviewStart: '开始温习',
      reviewPrefill: '帮我温习 %s', reviewFallbackHint: '也可手动粘贴到对话框发送。',
    } : {
      title: 'DeepTutor panel', powered: 'AI tutor · best used alongside the chat',
      mastery: 'Mastery', statusLearning: 'Learning', statusReview: 'Review', statusAssessment: 'Assessment',
      gaps: 'Knowledge gaps', plan: 'Study plan', question: 'Practice question', flashcards: 'Flashcards',
      next: 'Next steps', sources: 'Sources',
      submit: 'Submit answer', correct: 'Correct', wrong: 'Not quite', pickFirst: 'Select an option first.',
      done: 'Completed', undone: 'Not completed',
      priHigh: 'High priority', priMedium: 'Medium priority', priLow: 'Low priority',
      empty: 'No practice content in this dashboard.',
      flipHint: 'Click a card to flip', again: 'Shuffle',
      // Study-mode extensions (quiz fence + sidebar pages); mirrors locale/en.json study.*.
      quizTitle: 'Quiz', quizSubmit: 'Submit answers', quizSubmitting: 'Submitting…',
      quizScore: 'Score', quizGraded: 'Graded', quizCorrect: 'Correct', quizWrong: 'Wrong',
      quizWrongCount: 'wrong items recorded', quizPending: 'Please answer all questions before submitting.',
      wrongbookTitle: 'Wrong Answers', wrongbookDueToday: 'Due today', wrongbookMastered: 'Mastered',
      wrongbookTotal: 'Total', wrongbookMasteredBtn: 'Mastered', wrongbookPracticeBtn: 'Practice again',
      wrongbookAnswered: 'Your answer', wrongbookCorrectAnswer: 'Correct answer',
      wrongbookDueBadge: 'Due', wrongbookRedoSubmit: 'Submit answer',
      kbTitle: 'Knowledge Base', kbDocCount: 'Documents', kbUpdated: 'Updated', kbDefault: 'Default',
      kbNewKb: 'New knowledge base', kbName: 'Name', kbDesc: 'Description', kbCreate: 'Create', kbDelete: 'Delete',
      kbAddDoc: 'Add document', kbSearch: 'Search', kbConfirmDelete: 'Are you sure you want to delete "%s"? This cannot be undone.',
      kbError: 'Operation failed: %s', kbAddTitle: 'Document title',
      reviewTitle: 'Review', reviewSelectKb: 'Select knowledge base', reviewOverview: 'Overview',
      reviewDocs: 'Documents', reviewLastUpdated: 'Last updated', reviewStart: 'Start review',
      reviewPrefill: 'Help me review %s', reviewFallbackHint: 'You can also paste this into the chat manually.',
    };

    function parseDashboard(code) {
      try {
        const value = JSON.parse(code);
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
        return value;
      } catch (e) { return null; }
    }
    function clamp(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; }
    function isStr(v) { return typeof v === 'string' && v.length > 0; }
    function isArr(v) { return Array.isArray(v) && v.length > 0; }
    // '%s' placeholder substitution for localized messages.
    function fmt(template) {
      if (!isStr(template)) return '';
      let out = template;
      for (let i = 1; i < arguments.length; i++) out = out.replace('%s', String(arguments[i]));
      return out;
    }
    // Single-key object builder for Object.assign merges ({[id]: value}).
    function defineProperty(key, value) {
      const o = {}; o[key] = value; return o;
    }

    // ---- Small atoms --------------------------------------------------------
    function PriDot(priority) {
      const map = { high: ['error', L.priHigh], medium: ['warn', L.priMedium], low: ['idle', L.priLow] };
      const kind = map[String(priority === undefined || priority === null ? '' : priority).toLowerCase()] || map.low;
      return h(React.Fragment, null,
        h('span', { className: 'dt-dot dt-pri-' + (kind[0] === 'idle' ? 'idle' : kind[0]), 'aria-hidden': true }),
        h('span', { className: 'dt-sr' }, kind[1]));
    }
    function DoneBox(done) {
      return h('span', {
        className: 'dt-done' + (done ? ' dt-done-on' : ''),
        role: 'img', 'aria-label': done ? L.done : L.undone,
      });
    }
    function MasteryRing(value) {
      const r = 17;
      const c = 2 * Math.PI * r;
      const off = c * (1 - value / 100);
      return h('div', { className: 'dt-ring-wrap', title: L.mastery + ' ' + value + '%' },
        h('svg', { viewBox: '0 0 44 44', className: 'dt-ring', 'aria-hidden': true },
          h('circle', { cx: 22, cy: 22, r: r, className: 'dt-ring-track' }),
          h('circle', {
            cx: 22, cy: 22, r: r, className: 'dt-ring-value',
            strokeDasharray: c.toFixed(1), strokeDashoffset: off.toFixed(1),
          })),
        h('div', { className: 'dt-ring-num' }, String(value) + '%'));
    }
    function MasteryBar(value) {
      return h('div', { className: 'dt-mastery' },
        h('div', { className: 'dt-mastery-head' },
          h('span', { className: 'dt-mastery-label' }, L.mastery),
          h('span', { className: 'dt-mastery-num' }, value + '%')),
        h('div', { className: 'dt-meter' }, h('div', { className: 'dt-meter-fill', style: { width: value + '%' } })));
    }

    // ---- Practice question (choice -> submit -> verdict) --------------------
    function McQuestion(q) {
      const options = isArr(q.options) ? q.options.filter(isStr).slice(0, 6) : [];
      const single = options.length > 0 && Number.isInteger(q.answerIndex)
        && q.answerIndex >= 0 && q.answerIndex < options.length;
      const st = React.useState(-1);      // chosen option before submitting
      const choice = st[0]; const setChoice = st[1];
      const st2 = React.useState(false);  // answered: reveal + lock
      const answered = st2[0]; const setAnswered = st2[1];
      const correct = single && choice === q.answerIndex;
      const showVerdict = !single || answered;
      const rows = options.map(function (opt, i) {
        let state = '';
        if (single && answered) state = i === q.answerIndex ? ' dt-opt-correct' : (i === choice ? ' dt-opt-wrong' : '');
        else if (single && i === choice) state = ' dt-opt-picked';
        return h('li', { key: i, className: 'dt-opt-row' },
          h('button', {
            type: 'button',
            className: 'dt-opt' + state,
            role: single ? 'radio' : undefined,
            'aria-checked': single ? (choice === i ? 'true' : 'false') : undefined,
            disabled: single ? answered : undefined,
            tabIndex: single ? 0 : -1,
            onClick: function () { if (!answered) setChoice(i); },
          },
            h('span', { className: 'dt-opt-key', 'aria-hidden': true }, String.fromCharCode(65 + i)),
            h('span', { className: 'dt-opt-text' }, opt)));
      });
      return h('div', { className: 'dt-q' },
        h('p', { className: 'dt-q-stem' }, q.stem),
        options.length > 0
          ? h('ul', {
            className: 'dt-opts',
            role: single ? 'radiogroup' : 'list',
            'aria-label': single ? L.question : undefined,
          }, rows)
          : null,
        single && !answered && choice < 0 ? h('p', { className: 'dt-q-hint' }, L.pickFirst) : null,
        single && !answered
          ? h('button', {
            type: 'button', className: 'dt-btn',
            disabled: choice < 0,
            onClick: function () { setAnswered(true); },
          }, L.submit)
          : null,
        showVerdict && (single || isStr(q.explanation))
          ? h('div', { className: 'dt-q-verdict' + (single && !correct ? ' dt-q-verdict-no' : '') },
            single ? h('strong', null, correct ? L.correct : L.wrong) : null,
            isStr(q.explanation) ? h('span', null, (single ? ' · ' : '') + q.explanation) : null)
          : null);
    }

    // ---- Flashcards: flips in one state object; wrap-around window ----------
    function Flashcards(pool) {
      const st = React.useState(function () { return { offset: 0, flipped: {} }; });
      const state = st[0]; const setState = st[1];
      const need = Math.min(8, pool.length);
      const shown = [];
      for (let k = 0; k < need; k++) shown.push({ card: pool[(state.offset + k) % pool.length], idx: (state.offset + k) % pool.length });
      function rot() {
        setState(function (s) {
          return { offset: (s.offset + Math.min(8, pool.length)) % pool.length, flipped: {} };
        });
      }
      function flip(idx) {
        setState(function (s) {
          const flipped = Object.assign({}, s.flipped);
          flipped[idx] = !flipped[idx];
          return Object.assign({}, s, { flipped: flipped });
        });
      }
      return h('div', { className: 'dt-cards' },
        h('div', { className: 'dt-cards-grid' }, shown.map(function (entry) {
          const flipped = state.flipped[entry.idx] === true;
          return h('div', {
            key: entry.idx,
            className: 'dt-card' + (flipped ? ' dt-card-flipped' : ''),
            onClick: function () { flip(entry.idx); },
            role: 'button', tabIndex: 0,
            onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(entry.idx); } },
          },
            h('div', { className: 'dt-card-face dt-card-front' }, entry.card.front),
            h('div', { className: 'dt-card-face dt-card-back' }, entry.card.back));
        })),
        h('div', { className: 'dt-cards-foot' },
          h('span', { className: 'dt-cards-hint' }, L.flipHint),
          pool.length > 8
            ? h('button', { type: 'button', className: 'dt-btn dt-btn-ghost', onClick: rot }, L.again)
            : null));
    }

    function SectionIcon(name) {
      const paths = {
        gaps: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.3 1.3 0 0 1 1.3 1.3v4.4a1.3 1.3 0 1 1-2.6 0V8.3A1.3 1.3 0 0 1 12 7Zm0 9.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
        plan: 'M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.5V9h5.5L13 4.5ZM7 12h10v1.6H7V12Zm0 4h10v1.6H7V16Zm0-8h4v1.6H7V8Z',
        question: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.2 4.2c1.9 0 3.2 1.1 3.2 2.8 0 1.2-.6 2-1.7 2.7-.8.5-1 .8-1 1.5v.3h-1.9v-.5c0-1.2.4-1.9 1.5-2.6.8-.5 1.1-.9 1.1-1.5 0-.7-.5-1.1-1.3-1.1-.8 0-1.4.4-1.5 1.4l-1.9-.3c.2-1.7 1.5-2.7 3.5-2.7ZM12 15.8a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z',
        flash: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm4 1v3.6h4V6H8Zm5.6 0v3.6h4V6h-4ZM8 11.2v3.6h4v-3.6H8Zm5.6 0v3.6h4v-3.6h-4Z',
        next: 'M6 4l12 8-12 8V4Z',
        sources: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9.6 1.8 3-3 3 3-1.4 1.4-1.1-1.1V21H16v-4.9l-1 1-1.4-1.3Z',
      };
      return h('svg', { viewBox: '0 0 24 24', className: 'dt-sec-icon', 'aria-hidden': true },
        h('path', { d: paths[name] || paths.gaps }));
    }

    function SectionCard(title, iconName, body, count) {
      return h('section', { className: 'dt-sec' },
        h('div', { className: 'dt-sec-head' },
          SectionIcon(iconName),
          h('h3', { className: 'dt-sec-title' }, title),
          typeof count === 'number' ? h('span', { className: 'dt-sec-count' }, String(count)) : null),
        body);
    }

    // ---- Main dashboard ------------------------------------------------------
    function Dashboard(data) {
      const mastery = clamp(data.mastery);
      const statusRaw = isStr(data.status) ? data.status.toLowerCase() : null;
      const status = statusRaw === 'learning' || statusRaw === 'review' || statusRaw === 'assessment' ? statusRaw : null;
      const statusLabel = status === 'review' ? L.statusReview
        : status === 'assessment' ? L.statusAssessment : L.statusLearning;
      const gaps = isArr(data.gaps) ? data.gaps.filter(function (g) { return g && isStr(g.title); }).slice(0, 5) : [];
      const plan = isArr(data.plan) ? data.plan.filter(function (p) { return p && isStr(p.step); }).slice(0, 8) : [];
      const cards = isArr(data.flashcards) ? data.flashcards.filter(function (f) { return f && isStr(f.front) && typeof f.back === 'string'; }).slice(0, 12) : [];
      const next = isArr(data.nextActions) ? data.nextActions.filter(isStr).slice(0, 5) : [];
      const sources = isArr(data.sources) ? data.sources.filter(isStr).slice(0, 5) : [];
      const q = data.question && isStr(data.question.stem) ? data.question : null;
      const widgetCount = gaps.length + plan.length + next.length + sources.length + cards.length + (q ? 1 : 0);

      return h('div', { className: 'dt-panel' },
        h('header', { className: 'dt-head' },
          h('div', { className: 'dt-head-mark', 'aria-hidden': true },
            h('svg', { viewBox: '0 0 64 64', width: 20, height: 20 },
              h('path', { d: 'M32 6 8 20l24 12 24-12L32 6Zm-13 25v9c0 4 6 8 13 8s13-4 13-8v-9l-13 7-13-7Z' }))),
          h('div', { className: 'dt-head-text' },
            h('h2', { className: 'dt-head-title' }, L.title),
            h('p', { className: 'dt-head-sub' }, L.powered)),
          status
            ? h('span', { className: 'dt-status' },
              h('span', { className: 'dt-status-dot dt-status-' + status, 'aria-hidden': true }), statusLabel)
            : null),
        h('div', { className: 'dt-body' },
          (isStr(data.overview) || mastery !== null)
            ? h('div', { className: 'dt-overview' },
              h('div', { className: 'dt-overview-text' },
                isStr(data.overview) ? h('p', { className: 'dt-overview-p' }, data.overview) : null,
                mastery !== null ? MasteryBar(mastery) : null),
              mastery !== null ? MasteryRing(mastery) : null)
            : null,
          widgetCount === 0 ? h('p', { className: 'dt-empty' }, L.empty) : null,
          gaps.length > 0 ? SectionCard(L.gaps, 'gaps',
            h('ul', { className: 'dt-gaps' }, gaps.map(function (g, i) {
              return h('li', { key: i, className: 'dt-gap' },
                h('div', { className: 'dt-gap-top' }, h(PriDot, g.priority), h('strong', { className: 'dt-gap-title' }, g.title)),
                isStr(g.detail) ? h('p', { className: 'dt-gap-detail' }, g.detail) : null);
            })), gaps.length) : null,
          plan.length > 0 ? SectionCard(L.plan, 'plan',
            h('ul', { className: 'dt-plan' }, plan.map(function (p, i) {
              return h('li', { key: i, className: 'dt-plan-step' },
                DoneBox(p.done === true),
                h('div', { className: 'dt-plan-text' },
                  h('strong', { className: 'dt-plan-step-title' }, p.step),
                  isStr(p.detail) ? h('p', { className: 'dt-plan-step-detail' }, p.detail) : null));
            })), plan.length) : null,
          q ? SectionCard(L.question, 'question', h(McQuestion, q)) : null,
          cards.length > 0 ? SectionCard(L.flashcards, 'flash', h(Flashcards, cards), cards.length) : null,
          next.length > 0 ? SectionCard(L.next, 'next',
            h('ul', { className: 'dt-next' }, next.map(function (n, i) {
              return h('li', { key: i, className: 'dt-next-item' }, n);
            })), next.length) : null,
          sources.length > 0 ? SectionCard(L.sources, 'sources',
            h('ul', { className: 'dt-sources' }, sources.map(function (s, i) {
              return h('li', { key: i, className: 'dt-source' }, s);
            })), sources.length) : null));
    }

    // ---- Quiz renderer (deeptutor-quiz fence) ---------------------------------
    // Payload shape (from the agent via study_quiz prompt contract):
    //   { topic: string, questions: [{id, stem, options[4], correctIndex, explanation}] }
    // Correct answers and explanations stay hidden until the user submits; the
    // submit POSTs {questions, userAnswers} to /api/study/grade, which grades,
    // persists wrong items into the wrong-answer notebook, and returns per-
    // question verdicts. Grading is server-side — the client never reveals or
    // compares answers itself.
    function parseQuiz(code) {
      try {
        const value = JSON.parse(code);
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
        const qs = Array.isArray(value.questions) ? value.questions : [];
        const valid = qs.filter(function (q) {
          return q && isStr(q.id) && isStr(q.stem) && isArr(q.options);
        });
        if (valid.length === 0) return null;
        // rawQuestions is submitted to /api/study/grade verbatim; `questions`
        // (validated subset) is what gets rendered.
        return {
          topic: isStr(value.topic) ? value.topic : '',
          questions: valid,
          rawQuestions: qs,
        };
      } catch (e) { return null; }
    }

    function QuizOptionRow(question, index, optionText, disabled, picked, onPick, stateClass) {
      return h('li', { key: index, className: 'dt-opt-row' + (stateClass ? ' ' + stateClass : '') },
        h('label', { className: 'dt-opt' + (picked ? ' dt-opt-picked' : '') },
          h('input', {
            type: 'radio',
            name: 'dt-quiz-' + question.id,
            value: String(index),
            checked: picked,
            disabled: disabled,
            onChange: function () { onPick(index); },
            style: { margin: '3px 0 0', flex: 'none', accentColor: 'var(--dsw-alias-brand-primary)' },
          }),
          h('span', { className: 'dt-opt-key', 'aria-hidden': true }, String.fromCharCode(65 + index)),
          h('span', { className: 'dt-opt-text' }, optionText)));
    }

    function QuizQuestion(item) {
      const q = item.q; const picked = item.picked; const verdict = item.verdict;
      const onPick = item.onPick; const disabled = item.disabled;
      const per = verdict && verdict.perQuestion
        ? verdict.perQuestion.find(function (p) { return p && p.id === q.id; }) : null;
      const state = per ? (per.correct ? ' dt-quiz-item-ok' : ' dt-quiz-item-no') : '';
      const rows = q.options.map(function (opt, i) {
        let optState = '';
        if (per) {
          if (i === q.correctIndex) optState = 'dt-opt-state-correct';
          else if (i === per.userAnswer) optState = 'dt-opt-state-wrong';
        }
        return QuizOptionRow(q, i, opt, disabled || !!per, picked === i,
          function (idx) { onPick(q.id, idx); }, optState);
      });
      return h('div', { className: 'dt-quiz-item' + state },
        h('div', { className: 'dt-quiz-top' },
          h('span', { className: 'dt-quiz-num' }, 'Q' + (item.index + 1)),
          h('p', { className: 'dt-q-stem', style: { margin: 0 } }, q.stem)),
        h('ul', { className: 'dt-opts', role: 'radiogroup', style: { margin: 0 } }, rows),
        per
          ? h('div', { className: 'dt-quiz-verdicts' },
            h('p', { className: 'dt-verdict ' + (per.correct ? 'dt-verdict-ok' : 'dt-verdict-no') },
              per.correct ? L.quizCorrect : L.quizWrong),
            isStr(per.explanation) ? h('p', { className: 'dt-quiz-expl' }, per.explanation) : null)
          : null);
    }

    function QuizPanel(data) {
      const st = React.useState({});               // userAnswers: {[id]: index}
      const answers = st[0]; const setAnswers = st[1];
      const st2 = React.useState(false);           // submitted
      const submitted = st2[0]; const setSubmitted = st2[1];
      const st3 = React.useState(false);           // submitting in flight
      const submitting = st3[0]; const setSubmitting = st3[1];
      const st4 = React.useState(null);            // verdict from /api/study/grade
      const verdict = st4[0]; const setVerdict = st4[1];
      const st5 = React.useState(null);            // network/HTTP error string
      const error = st5[0]; const setError = st5[1];

      const questions = data.questions;
      const answeredCount = questions.filter(function (q) {
        return Number.isInteger(answers[q.id]);
      }).length;
      const allAnswered = answeredCount === questions.length;

      function pick(id, index) {
        if (submitted) return;
        setAnswers(function (prev) { return Object.assign({}, prev, defineProperty(id, index)); });
      }

      function submit() {
        if (submitting || !allAnswered) return;
        setSubmitting(true);
        setError(null);
        fetch('/api/study/grade', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: isArr(data.rawQuestions) ? data.rawQuestions : questions,
            userAnswers: answers,
          }),
        }).then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, body: body }; });
        }).then(function (r) {
          if (!r.ok || !r.body || !Array.isArray(r.body.perQuestion)) {
            throw new Error((r.body && r.body.message) || ('HTTP ' + r.ok));
          }
          setVerdict(r.body);
          setSubmitted(true);
        }).catch(function (err) {
          setError(String(err && err.message ? err.message : err));
        }).finally(function () { setSubmitting(false); });
      }

      const wrongCount = verdict
        ? verdict.perQuestion.filter(function (p) { return p && p.correct === false; }).length
        : 0;

      return h('div', { className: 'dt-panel' },
        h('header', { className: 'dt-head' },
          h('div', { className: 'dt-head-mark', 'aria-hidden': true },
            h('svg', { viewBox: '0 0 64 64', width: 20, height: 20 },
              h('path', { d: 'M32 6 8 20l24 12 24-12L32 6Zm-13 25v9c0 4 6 8 13 8s13-4 13-8v-9l-13 7-13-7Z' }))),
          h('div', { className: 'dt-head-text' },
            h('h2', { className: 'dt-head-title' }, L.quizTitle),
            isStr(data.topic) ? h('p', { className: 'dt-head-sub' }, data.topic) : null),
          verdict
            ? h('span', { className: 'dt-status' }, L.quizGraded)
            : null),
        h('div', { className: 'dt-body' },
          questions.map(function (q, i) {
            return h(QuizQuestion, {
              key: q.id, q: q, index: i,
              picked: answers[q.id], verdict: verdict,
              onPick: pick, disabled: submitting,
            });
          }),
          error ? h('p', { className: 'dt-sb-error' }, fmt(L.kbError, error)) : null,
          !submitted && !allAnswered && answeredCount > 0
            ? h('p', { className: 'dt-q-hint' }, L.quizPending) : null,
          h('div', { className: 'dt-quiz-foot' },
            h('button', {
              type: 'button', className: 'dt-btn',
              disabled: !allAnswered || submitted || submitting,
              onClick: submit,
            }, submitting ? L.quizSubmitting : L.quizSubmit),
            verdict
              ? h('span', { className: 'dt-quiz-score' },
                L.quizScore + ' ' + verdict.score + ' / ' + verdict.total
                + (wrongCount > 0 ? ' · ' + wrongCount + ' ' + L.quizWrongCount : ''))
              : null)));
    }

    // Quiz fence wrapper: same hoc contract as the dashboard fence. Renders
    // children while streaming or when the payload is not a valid quiz.
    function DeepTutorQuizFence(props) {
      const data = React.useMemo(function () {
        return (props.lang === 'deeptutor-quiz' && !props.streaming && typeof props.code === 'string')
          ? parseQuiz(props.code)
          : null;
      }, [props.code, props.lang, props.streaming]);
      if (!data) return props.children;
      return h(QuizPanel, data);
    }

    // ---- Fence layer ---------------------------------------------------------
    // Language-keyed wrapper around one ```deeptutor-dashboard fence in the Chat
    // flow (slot 'conversation.chat.markdown.fence'; hoc kind: children is the
    // plain code block). While streaming or on invalid JSON, render children.
    function DeepTutorFence(props) {
      const data = React.useMemo(function () {
        return (props.lang === 'deeptutor-dashboard' && !props.streaming && typeof props.code === 'string')
          ? parseDashboard(props.code)
          : null;
      }, [props.code, props.lang, props.streaming]);
      if (!data) return props.children;
      return h(Dashboard, data);
    }

    // Static, theme-token stylesheet for the panel (inherited theme; light+dark).
    const STYLES = [
      '.dt-panel{--dt-card:var(--dsw-alias-bg-layer-2);--dt-line:var(--dsw-alias-border-l1);',
      'margin:8px 0;border:1px solid var(--dt-line);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45;}',
      '.dt-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--dt-card);border-bottom:1px solid var(--dt-line);}',
      '.dt-head-mark{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;',
      'background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);flex:none;}',
      '.dt-head-mark svg{fill:currentColor;}',
      '.dt-head-text{min-width:0;}',
      '.dt-head-title{margin:0;font-size:13px;font-weight:600;letter-spacing:.2px;overflow-wrap:anywhere;}',
      '.dt-head-sub{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.dt-status{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;',
      'border:1px solid var(--dt-line);font-size:11px;color:var(--dsw-alias-label-secondary);flex:none;}',
      '.dt-status-dot{width:7px;height:7px;border-radius:50%;}',
      '.dt-status-learning{background:var(--dsw-alias-state-success-primary);}',
      '.dt-status-review{background:var(--dsw-alias-state-warn-primary);}',
      '.dt-status-assessment{background:var(--dsw-alias-brand-primary);}',
      '.dt-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px;}',
      '.dt-overview{display:flex;gap:16px;align-items:center;padding:10px 12px;border:1px solid var(--dt-line);border-radius:10px;background:var(--dt-card);}',
      '.dt-overview-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;}',
      '.dt-overview-p{margin:0;overflow-wrap:anywhere;}',
      '.dt-mastery-head{display:flex;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.dt-mastery-num{color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.dt-meter{height:6px;border-radius:3px;background:var(--dsw-alias-bg-base);overflow:hidden;}',
      '.dt-meter-fill{height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);transition:width .3s ease;}',
      '.dt-ring-wrap{position:relative;width:46px;height:46px;flex:none;}',
      '.dt-ring{width:46px;height:46px;transform:rotate(-90deg);}',
      '.dt-ring-track{fill:none;stroke:var(--dsw-alias-bg-base);stroke-width:5;}',
      '.dt-ring-value{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .4s ease;}',
      '.dt-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--dsw-alias-brand-primary);}',
      '.dt-sec{border:1px solid var(--dt-line);border-radius:10px;background:var(--dt-card);overflow:hidden;}',
      '.dt-sec-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dt-line);}',
      '.dt-sec-icon{width:14px;height:14px;fill:var(--dsw-alias-brand-primary);flex:none;}',
      '.dt-sec-title{margin:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dt-sec-count{margin-left:auto;font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--dt-line);color:var(--dsw-alias-label-secondary);}',
      '.dt-sec > ul,.dt-sec .dt-q,.dt-sec .dt-cards{padding:8px 12px 10px;margin:0;}',
      '.dt-gaps,.dt-plan,.dt-next,.dt-sources{list-style:none;display:flex;flex-direction:column;gap:6px;}',
      '.dt-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',
      '.dt-gap{padding:7px 9px;border:1px solid var(--dt-line);border-radius:8px;background:var(--dsw-alias-bg-layer-1);}',
      '.dt-gap-top{display:flex;align-items:center;gap:8px;}',
      '.dt-dot{width:8px;height:8px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);}',
      '.dt-pri-error{background:var(--dsw-alias-state-error-primary);}',
      '.dt-pri-warn{background:var(--dsw-alias-state-warn-primary);}',
      '.dt-pri-idle{background:var(--dsw-alias-state-idle-primary);}',
      '.dt-gap-title{font-size:12px;overflow-wrap:anywhere;}',
      '.dt-gap-detail{margin:4px 0 0 16px;font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;}',
      '.dt-plan-step{display:flex;gap:9px;align-items:flex-start;}',
      '.dt-plan-text{min-width:0;}',
      '.dt-done{width:14px;height:14px;border-radius:4px;border:1.5px solid var(--dsw-alias-label-secondary);flex:none;margin-top:1px;position:relative;}',
      '.dt-done-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
      '.dt-done-on:after{content:"";position:absolute;left:3.5px;top:.5px;width:4px;height:8px;border:solid var(--dsw-alias-bg-base);border-width:0 1.5px 1.5px 0;transform:rotate(40deg);}',
      '.dt-plan-step-title{font-size:12px;overflow-wrap:anywhere;}',
      '.dt-plan-step-detail{margin:2px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;}',
      '.dt-q-stem{margin:2px 0 8px;font-size:12.5px;font-weight:500;overflow-wrap:anywhere;}',
      '.dt-opts{list-style:none;display:flex;flex-direction:column;gap:5px;padding:0;margin:0 0 8px;}',
      '.dt-opt-row{list-style:none;display:block;}',
      '.dt-opt{display:flex;width:100%;gap:8px;align-items:flex-start;text-align:left;padding:6px 9px;border:1px solid var(--dt-line);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;cursor:pointer;overflow-wrap:anywhere;}',
      '.dt-opt:not(:disabled):hover{border-color:var(--dsw-alias-brand-primary);}',
      '.dt-opt:disabled{cursor:default;}',
      '.dt-opt-picked{border-color:var(--dsw-alias-brand-primary);}',
      '.dt-opt-correct{border-color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,transparent);}',
      '.dt-opt-wrong{border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);}',
      '.dt-opt-key{font-weight:600;color:var(--dsw-alias-brand-primary);flex:none;}',
      '.dt-opt-text{min-width:0;}',
      '.dt-opt:focus-visible,.dt-card:focus-visible,.dt-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}',
      '.dt-q-hint{margin:0 0 6px;font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.dt-q-verdict{margin-top:8px;font-size:11.5px;color:var(--dsw-alias-label-primary);display:flex;gap:4px;align-items:baseline;flex-wrap:wrap;}',
      '.dt-q-verdict strong{font-weight:600;}',
      '.dt-q-verdict-no strong{color:var(--dsw-alias-state-error-primary);}',
      '.dt-btn{padding:4px 12px;border-radius:8px;border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font:inherit;font-size:11.5px;cursor:pointer;}',
      '.dt-btn:disabled{opacity:.45;cursor:default;}',
      '.dt-btn-ghost{background:transparent;color:var(--dsw-alias-brand-primary);border-color:var(--dt-line);padding:2px 10px;}',
      '.dt-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;}',
      '.dt-card{position:relative;height:96px;cursor:pointer;perspective:600px;}',
      '.dt-card-face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid var(--dt-line);border-radius:8px;background:var(--dsw-alias-bg-layer-1);backface-visibility:hidden;text-align:center;font-size:11.5px;transition:transform .35s;overflow-wrap:anywhere;}',
      '.dt-card-back{transform:rotateY(180deg);color:var(--dsw-alias-label-secondary);}',
      '.dt-card-flipped .dt-card-front{transform:rotateY(180deg);}',
      '.dt-card-flipped .dt-card-back{transform:rotateY(0deg);}',
      '.dt-cards-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary);gap:8px;}',
      '.dt-next-item{position:relative;padding-left:14px;font-size:12px;overflow-wrap:anywhere;}',
      '.dt-next-item:before{content:"";position:absolute;left:0;top:6px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);}',
      '.dt-source{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;}',
      '.dt-empty{margin:2px 0;color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow-wrap:anywhere;}',
      // ---- Study mode: quiz fence ----------------------------------------------
      '.dt-quiz-item{border:1px solid var(--dt-line);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:8px;}',
      '.dt-quiz-item-ok{border-color:var(--dsw-alias-state-success-primary);}',
      '.dt-quiz-item-no{border-color:var(--dsw-alias-state-error-primary);}',
      '.dt-quiz-top{display:flex;align-items:baseline;gap:8px;}',
      '.dt-quiz-num{font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none;}',
      '.dt-quiz-expl{margin:0;font-size:11.5px;color:var(--dsw-alias-label-secondary);border-top:1px dashed var(--dt-line);padding-top:6px;overflow-wrap:anywhere;}',
      '.dt-quiz-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px;}',
      '.dt-quiz-score{font-size:12px;font-weight:600;overflow-wrap:anywhere;}',
      '.dt-opt-state-correct{border-color:var(--dsw-alias-state-success-primary);}',
      '.dt-opt-state-correct .dt-opt{border-color:var(--dsw-alias-state-success-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,transparent);}',
      '.dt-opt-state-wrong .dt-opt{border-color:var(--dsw-alias-state-error-primary);',
      'background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);}',
      '.dt-quiz-verdicts{display:flex;flex-direction:column;gap:4px;}',
      '.dt-quiz-verdicts .dt-quiz-expl{border-top:none;padding-top:0;}',
      '.dt-badge{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:10px;flex:none;',
      'border:1px solid var(--dt-line);color:var(--dsw-alias-label-secondary);white-space:nowrap;}',
      '.dt-badge-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}',
      '.dt-badge-brand{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
    ].join('');

    return {
      inject: ['slots', 'styles'],
      apply(ctx) {
        ctx.effect(() => {
          const disposeStyles = ctx.styles.insert(STYLES);
          const disposeFence = ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register(
            {
              name: 'conversation.chat.markdown.fence',
              key: 'deeptutor-dashboard',
              id: '@local/deeptutor/panel',
              order: 100,
            },
            DeepTutorFence,
          ));
          const disposeQuizFence = ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register(
            {
              name: 'conversation.chat.markdown.fence',
              key: 'deeptutor-quiz',
              id: '@local/deeptutor/quiz',
              order: 101,
            },
            DeepTutorQuizFence,
          ));
          return function dispose() {
            disposeFence();
            disposeQuizFence();
            disposeStyles();
          };
        }, 'deeptutor: fence layer + styles');
      },
    };
  },
});

// ============================================================================
// Locale registration (study.* namespace)
// ============================================================================

window.__ModuleLoader__.load({
  id: '@local/deeptutor/locale',
  factory(require) {
    const zhMessages = {
      study: {
        quizTitle: '随堂测验',
        quizSubmit: '提交答案',
        quizSubmitting: '提交中…',
        quizScore: '得分',
        quizOf: '共',
        quizCorrect: '答对',
        quizWrong: '答错',
        quizGraded: '已判分',
        quizWrongCount: '收录错题',
        quizPending: '请完成所有题目后再提交。',
        wrongbookTitle: '错题本',
        wrongbookDueToday: '今日复习',
        wrongbookMastered: '已掌握',
        wrongbookTotal: '全部',
        wrongbookTopic: '知识点',
        wrongbookMasteredBtn: '已掌握',
        wrongbookPracticeBtn: '再练一次',
        wrongbookAnswered: '你的答案',
        wrongbookCorrectAnswer: '正确答案',
        wrongbookDueBadge: '已到期',
        wrongbookNewBadge: '新加入',
        wrongbookRedoMode: '重做模式',
        wrongbookRedoSubmit: '提交答案',
        wrongbookEmpty: '本面板暂无练习内容。',
        kbTitle: '知识库管理',
        kbDocCount: '文档数',
        kbUpdated: '更新时间',
        kbDefault: '默认',
        kbNewKb: '新建知识库',
        kbName: '名称',
        kbDesc: '描述',
        kbCreate: '创建',
        kbDelete: '删除',
        kbAddDoc: '添加文档',
        kbSearch: '搜索',
        kbPreview: '预览',
        kbConfirmDelete: '确定要删除知识库「%s」吗？此操作不可恢复。',
        kbCreated: '知识库「%s」创建成功',
        kbDeleted: '知识库「%s」已删除',
        kbError: '操作失败：%s',
        reviewTitle: '开始温习',
        reviewSelectKb: '选择知识库',
        reviewOverview: '概览',
        reviewDocs: '文档数',
        reviewLastUpdated: '最后更新',
        reviewStart: '开始温习',
        reviewPrefill: '帮我温习 %s',
        reviewCopied: '已复制到剪贴板：',
        reviewFallbackHint: '也可手动粘贴到对话框发送。',
      },
    };
    const enMessages = {
      study: {
        quizTitle: 'Quiz',
        quizSubmit: 'Submit answers',
        quizSubmitting: 'Submitting…',
        quizScore: 'Score',
        quizOf: 'of',
        quizCorrect: 'Correct',
        quizWrong: 'Wrong',
        quizGraded: 'Graded',
        quizWrongCount: 'wrong items recorded',
        wrongbookTitle: 'Wrong Answers',
        wrongbookDueToday: 'Due today',
        wrongbookMastered: 'Mastered',
        wrongbookTotal: 'Total',
        wrongbookTopic: 'Topic',
        wrongbookMasteredBtn: 'Mastered',
        wrongbookPracticeBtn: 'Practice again',
        wrongbookAnswered: 'Your answer',
        wrongbookCorrectAnswer: 'Correct answer',
        wrongbookDueBadge: 'Due',
        wrongbookNewBadge: 'New',
        wrongbookRedoMode: 'Redo mode',
        wrongbookRedoSubmit: 'Submit answer',
        wrongbookEmpty: 'No practice content in this panel.',
        kbTitle: 'Knowledge Base',
        kbDocCount: 'Documents',
        kbUpdated: 'Updated',
        kbDefault: 'Default',
        kbNewKb: 'New knowledge base',
        kbName: 'Name',
        kbDesc: 'Description',
        kbCreate: 'Create',
        kbDelete: 'Delete',
        kbAddDoc: 'Add document',
        kbSearch: 'Search',
        kbPreview: 'Preview',
        kbConfirmDelete: 'Are you sure you want to delete "%s"? This cannot be undone.',
        kbCreated: 'Knowledge base "%s" created.',
        kbDeleted: 'Knowledge base "%s" deleted.',
        kbError: 'Operation failed: %s',
        reviewTitle: 'Review',
        reviewSelectKb: 'Select knowledge base',
        reviewOverview: 'Overview',
        reviewDocs: 'Documents',
        reviewLastUpdated: 'Last updated',
        reviewStart: 'Start review',
        reviewPrefill: 'Help me review %s',
        reviewCopied: 'Copied to clipboard:',
        reviewFallbackHint: 'You can also paste this into the chat manually.',
      },
    };

    const NS = 'deeptutor-study';

    return {
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposals = [];
          try { disposals.push(ctx.locale.register(NS, zhMessages)); } catch (e) { /* ignore */ }
          try { disposals.push(ctx.locale.register(NS, enMessages)); } catch (e) { /* ignore */ }
          return function dispose() { disposals.forEach(function (d) { try { d(); } catch (e) { /* ignore */ } }); };
        }, 'deeptutor: locale registration');
      },
    };
  },
});

// ============================================================================
// Shared sidebar-page plumbing
// ============================================================================

window.__ModuleLoader__.load({
  id: '@local/deeptutor/study-pages',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Locale labels: prefer the host locale registry (study.* keys registered by
    // the @local/deeptutor/locale module from locale/zh.json / en.json); fall
    // back to this inline bilingual copy when locale.bind is not provided.
    let zh = false;
    try { zh = /zh/i.test(navigator.language); } catch (e) { zh = false; }
    const FALLBACK = zh ? {
      wrongbookTitle: '错题本', wrongbookSub: '间隔复习 · 答错回 1 天，答对拉长间隔',
      wrongbookDueToday: '今日复习', wrongbookMastered: '已掌握', wrongbookTotal: '全部',
      wrongbookMasteredBtn: '已掌握', wrongbookPracticeBtn: '再练一次',
      wrongbookAnswered: '你的答案', wrongbookCorrectAnswer: '正确答案',
      wrongbookDueBadge: '已到期', wrongbookRedoSubmit: '提交答案',
      wrongbookEmpty: '本面板暂无练习内容。', wrongbookUndefined: '未分组',
      kbTitle: '知识库管理', kbSub: '模型写入 + 粘贴导入 · BM25 在线检索',
      kbDocCount: '文档数', kbUpdated: '更新时间', kbDefault: '默认',
      kbNewKb: '新建知识库', kbName: '名称', kbDesc: '描述', kbCreate: '创建', kbDelete: '删除',
      kbAddDoc: '添加文档', kbAddTitle: '文档标题', kbContent: '内容（Markdown）', kbAdd: '添加',
      kbSearch: '搜索', kbSearchPh: '输入关键词检索本库…', kbPreview: '预览',
      kbDocsTitle: '文档列表', kbConfirmDelete: '确定要删除知识库「%s」吗？此操作不可恢复。',
      kbError: '操作失败：%s', kbCreated: '知识库「%s」创建成功', kbDeleted: '知识库「%s」已删除',
      reviewTitle: '开始温习', reviewSub: '选库 → 概览 → 发到对话由 AI 讲解出题',
      reviewSelectKb: '选择知识库', reviewOverview: '概览', reviewDocs: '文档数',
      reviewLastUpdated: '最后更新', reviewStart: '开始温习',
      reviewPrefill: '帮我温习 %s', reviewFallbackHint: '也可手动粘贴到对话框发送。',
      reviewStartHint: '已为你预填对话输入「%s」，回车即可发送。',
      reload: '刷新', loading: '加载中…', none: '暂无', close: '关闭',
    } : {
      wrongbookTitle: 'Wrong Answers', wrongbookSub: 'Spaced repetition · 1 day on wrong, longer on correct',
      wrongbookDueToday: 'Due today', wrongbookMastered: 'Mastered', wrongbookTotal: 'Total',
      wrongbookMasteredBtn: 'Mastered', wrongbookPracticeBtn: 'Practice again',
      wrongbookAnswered: 'Your answer', wrongbookCorrectAnswer: 'Correct answer',
      wrongbookDueBadge: 'Due', wrongbookRedoSubmit: 'Submit answer',
      wrongbookEmpty: 'No practice content in this panel.', wrongbookUndefined: 'Ungrouped',
      kbTitle: 'Knowledge Base', kbSub: 'Model writes + paste import · BM25 online search',
      kbDocCount: 'Documents', kbUpdated: 'Updated', kbDefault: 'Default',
      kbNewKb: 'New knowledge base', kbName: 'Name', kbDesc: 'Description', kbCreate: 'Create', kbDelete: 'Delete',
      kbAddDoc: 'Add document', kbAddTitle: 'Document title', kbContent: 'Content (Markdown)', kbAdd: 'Add',
      kbSearch: 'Search', kbSearchPh: 'Type keywords to search this KB…', kbPreview: 'Preview',
      kbDocsTitle: 'Documents', kbConfirmDelete: 'Are you sure you want to delete "%s"? This cannot be undone.',
      kbError: 'Operation failed: %s', kbCreated: 'Knowledge base "%s" created.', kbDeleted: 'Knowledge base "%s" deleted.',
      reviewTitle: 'Review', reviewSub: 'Pick a KB → overview → the AI explains and quizzes in chat',
      reviewSelectKb: 'Select knowledge base', reviewOverview: 'Overview', reviewDocs: 'Documents',
      reviewLastUpdated: 'Last updated', reviewStart: 'Start review',
      reviewPrefill: 'Help me review %s', reviewFallbackHint: 'You can also paste this into the chat manually.',
      reviewStartHint: 'The chat input is pre-filled with "%s". Press Enter to send.',
      reload: 'Reload', loading: 'Loading…', none: 'None', close: 'Close',
    };

    // Resolve labels from the host locale registry (namespace 'deeptutor-study',
    // study.* keys per locale/zh.json / en.json). Mutates the shared L object
    // from apply(ctx) once the locale service is available; unresolved keys keep
    // the inline bilingual fallback above.
    const L = Object.assign({}, FALLBACK);
    function bindLocale(locale) {
      if (!locale || typeof locale.bind !== 'function') return;
      try {
        const bound = locale.bind('deeptutor-study');
        if (bound && typeof bound === 'object') {
          const study = bound.study || bound;
          for (const key of Object.keys(L)) {
            if (isStr(study[key])) L[key] = study[key];
          }
        }
      } catch (e) { /* keep FALLBACK */ }
    }

    function fmt(template) {
      if (typeof template !== 'string' || template.length === 0) return '';
      let out = template;
      for (let i = 1; i < arguments.length; i++) out = out.replace('%s', String(arguments[i]));
      return out;
    }
    function isStr(v) { return typeof v === 'string' && v.length > 0; }
    function isArr(v) { return Array.isArray(v) && v.length > 0; }
    function dict(key, value) { const o = {}; o[key] = value; return o; }

    // Same-origin JSON fetch with a JSON body; returns parsed body or throws.
    function api(method, path, body) {
      return fetch(path, {
        method: method,
        credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            const message = data && data.message ? data.message : 'HTTP ' + res.status;
            throw new Error(message);
          }
          return data;
        });
      });
    }
    function apiGet(path) { return api('GET', path); }
    function apiPost(path, body) { return api('POST', path, body); }

    function parseKbList(body) {
      const list = body && Array.isArray(body.knowledgeBases) ? body.knowledgeBases : [];
      return list.filter(function (k) { return k && isStr(k.name); });
    }

    // ISO date -> short local string; '' for empty input.
    function shortDate(iso) {
      if (!isStr(iso)) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    // Wrap a page body in the shared chrome: icon + title + subtitle + reload.
    function PageShell(iconPath, title, subtitle, reloadLabel, onReload, children) {
      return h('div', { className: 'dt-sb' },
        h('header', { className: 'dt-sb-head' },
          h('div', { className: 'dt-sb-mark', 'aria-hidden': true },
            h('svg', { viewBox: '0 0 24 24' }, h('path', { d: iconPath }))),
          h('div', { className: 'dt-sb-text' },
            h('h2', { className: 'dt-sb-title' }, title),
            h('p', { className: 'dt-sb-sub' }, subtitle)),
          typeof onReload === 'function'
            ? h('button', {
              type: 'button', className: 'dt-btn dt-btn-ghost',
              onClick: onReload, style: { marginLeft: 'auto', flex: 'none' },
            }, reloadLabel)
            : null),
        h('div', { className: 'dt-sb-body' }, children));
    }

    function Note(text, kind) {
      if (!isStr(text)) return null;
      return h('p', { className: kind === 'error' ? 'dt-sb-error' : 'dt-sb-note' }, text);
    }

    // ---- Wrong-answer notebook (sidebar.panellist order 6) --------------------
    // GET  /api/study/wrong-answers            -> {items:[schema v2]}
    // POST /api/study/wrong-answers            -> mastered | practice | answer
    // Interval advancement and grading stay server-side (single source of truth).
    const ICON_WRONGBOOK = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.2 4.2c1.9 0 3.2 1.1 3.2 2.8 0 1.2-.6 2-1.7 2.7-.8.5-1 .8-1 1.5v.3h-1.9v-.5c0-1.2.4-1.9 1.5-2.6.8-.5 1.1-.9 1.1-1.5 0-.7-.5-1.1-1.3-1.1-.8 0-1.4.4-1.5 1.4l-1.9-.3c.2-1.7 1.5-2.7 3.5-2.7ZM12 15.8a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z';

    function WrongBookItem(item) {
      const it = item.item; const onRedo = item.onRedo; const onAction = item.onAction;
      const st = React.useState(-1);                       // picked option in redo mode
      const picked = st[0]; const setPicked = st[1];
      const st2 = React.useState(null);                    // verdict after page redo
      const result = st2[0]; const setResult = st2[1];
      const busy = item.busy === true;

      function redo() {
        if (picked < 0 || busy) return;
        onAction(function () {
          return apiPost('/api/study/wrong-answers', { action: 'answer', id: it.id, answer: picked })
            .then(function (r) {
              setResult(r);
              onRedo();
              return r;
            });
        }, true);
      }

      const options = isArr(it.options) ? it.options : [];
      const due = !it.mastered && isStr(it.dueAt) && new Date(it.dueAt).getTime() <= Date.now();
      const answerLine = h('p', { className: 'dt-wa-ans' },
        L.wrongbookAnswered + ' ',
        h('b', null, it.userAnswer !== null && it.userAnswer !== undefined && options[it.userAnswer] !== undefined
          ? options[it.userAnswer] : String(it.userAnswer)),
        ' · ' + L.wrongbookCorrectAnswer + ' ',
        h('b', null, isStr(it.correctAnswer) ? it.correctAnswer : String(it.correctIndex)));

      return h('div', { className: 'dt-wa' },
        h('div', { className: 'dt-wa-top' },
          it.topic ? h('span', { className: 'dt-badge dt-badge-brand' }, it.topic) : null,
          it.mastered
            ? h('span', { className: 'dt-badge dt-badge-ok' }, L.wrongbookMastered)
            : due ? h('span', { className: 'dt-badge dt-badge-due' }, L.wrongbookDueBadge) : null,
          isStr(it.dueAt) ? h('span', { className: 'dt-badge' }, shortDate(it.dueAt)) : null,
          isStr(it.explanation) && result ? h('span', { className: 'dt-badge' }, '×' + (result.intervalDays || 1) + 'd') : null),
        h('p', { className: 'dt-wa-q' }, it.question),
        answerLine,
        isStr(it.explanation) ? h('p', { className: 'dt-wa-ans' }, it.explanation) : null,
        h('ul', { className: 'dt-opts', role: 'radiogroup' },
          options.map(function (opt, i) {
            let cls = 'dt-opt';
            if (result) {
              if (i === it.correctIndex) cls += ' dt-opt-correct';
              else if (i === picked) cls += ' dt-opt-wrong';
            } else if (picked === i) cls += ' dt-opt-picked';
            return h('li', { key: i, className: 'dt-opt-row' },
              h('label', { className: cls },
                h('input', {
                  type: 'radio', name: 'dt-wa-' + it.id, value: String(i),
                  checked: picked === i, disabled: busy || !!result,
                  onChange: function () { setPicked(i); },
                  style: { margin: '3px 0 0', flex: 'none', accentColor: 'var(--dsw-alias-brand-primary)' },
                }),
                h('span', { className: 'dt-opt-key', 'aria-hidden': true }, String.fromCharCode(65 + i)),
                h('span', { className: 'dt-opt-text' }, opt)));
          })),
        result
          ? h('p', { className: 'dt-verdict ' + (result.correct ? 'dt-verdict-ok' : 'dt-verdict-no') },
            (result.correct ? L.wrongbookCorrectAnswer : L.wrongbookAnswered)
            + ' · ' + (result.intervalDays || 1) + 'd'
            + (result.mastered ? ' · ' + L.wrongbookMastered : ''))
          : null,
        h('div', { className: 'dt-wa-actions' },
          !result ? h('button', {
            type: 'button', className: 'dt-btn', disabled: picked < 0 || busy, onClick: redo,
          }, L.wrongbookRedoSubmit) : null,
          h('button', {
            type: 'button', className: 'dt-btn dt-btn-ghost', disabled: busy,
            onClick: function () {
              onAction(function () {
                return apiPost('/api/study/wrong-answers', { action: 'mastered', id: it.id });
              });
            },
          }, L.wrongbookMasteredBtn),
          h('button', {
            type: 'button', className: 'dt-btn dt-btn-ghost', disabled: busy,
            onClick: function () {
              onAction(function () {
                return apiPost('/api/study/wrong-answers', { action: 'practice', id: it.id });
              });
            },
          }, L.wrongbookPracticeBtn)));
    }

    function WrongBook() {
      const st = React.useState({ items: null, error: null, loading: false, busy: false });
      const state = st[0]; const setState = st[1];

      function load() {
        setState(function (s) { return Object.assign({}, s, { loading: true, error: null }); });
        apiGet('/api/study/wrong-answers')
          .then(function (body) {
            const items = Array.isArray(body.items) ? body.items : [];
            setState(function (s) { return Object.assign({}, s, { items: items, loading: false }); });
          })
          .catch(function (err) {
            setState(function (s) { return Object.assign({}, s, { items: [], loading: false, error: String(err.message || err) }); });
          });
      }
      React.useEffect(load, []);

      function runAction(fn) {
        setState(function (s) { return Object.assign({}, s, { busy: true }); });
        Promise.resolve()
          .then(fn)
          .then(load)
          .catch(function (err) {
            setState(function (s) { return Object.assign({}, s, { busy: false, error: String(err.message || err) }); });
          });
      }

      const items = state.items;
      const now = Date.now();
      const dueCount = items === null ? 0 : items.filter(function (it) {
        return !it.mastered && isStr(it.dueAt) && new Date(it.dueAt).getTime() <= now;
      }).length;
      const masteredCount = items === null ? 0 : items.filter(function (it) { return it.mastered === true; }).length;

      // Group items by topic, preserving insertion order.
      let groups = null;
      if (items !== null) {
        groups = [];
        const seen = {};
        items.forEach(function (it) {
          const key = isStr(it.topic) ? it.topic : L.wrongbookUndefined;
          if (!seen[key]) { seen[key] = []; groups.push({ topic: key, list: seen[key] }); }
          seen[key].push(it);
        });
      }

      return PageShell(ICON_WRONGBOOK, L.wrongbookTitle, L.wrongbookSub, L.reload, load,
        items === null
          ? Note(L.loading)
          : h(React.Fragment, null,
            h('div', { className: 'dt-stats' },
              h('div', { className: 'dt-stat' },
                h('div', { className: 'dt-stat-num' + (dueCount > 0 ? ' dt-stat-num-due' : '') }, String(dueCount)),
                h('div', { className: 'dt-stat-label' }, L.wrongbookDueToday)),
              h('div', { className: 'dt-stat' },
                h('div', { className: 'dt-stat-num dt-stat-num-ok' }, String(masteredCount)),
                h('div', { className: 'dt-stat-label' }, L.wrongbookMastered)),
              h('div', { className: 'dt-stat' },
                h('div', { className: 'dt-stat-num' }, String(items.length)),
                h('div', { className: 'dt-stat-label' }, L.wrongbookTotal))),
            Note(state.error, 'error'),
            items.length === 0
              ? h('p', { className: 'dt-empty' }, L.wrongbookEmpty)
              : h('div', { className: 'dt-group' }, groups.map(function (g) {
                return h(React.Fragment, { key: g.topic },
                  h('p', { className: 'dt-group-title' },
                    L.wrongbookTopic + ' · ' + g.topic + ' (' + g.list.length + ')'),
                  g.list.map(function (it) {
                    return h(WrongBookItem, {
                      key: it.id, item: it, busy: state.busy,
                      onRedo: load, onAction: runAction,
                    });
                  }));
              }))));
    }

    // ---- Knowledge base manager (sidebar.panellist order 7) -------------------
    // GET  /api/study/kb                     -> {knowledgeBases:[{name,description,docCount,updatedAt,isDefault}]}
    // GET  /api/study/kb?docs=<kb>&kb=<kb>   -> {files:[title,...]}
    // GET  /api/study/kb?file=<name>&kb=<kb> -> {text, truncated}
    // GET  /api/study/kb?search=<q>&kb=<kb>  -> BM25 snippets (server-side BM25 on the search route lives on /api/study/kb search action per the design; the route above exposes docs/file today, so search uses the tool endpoint when present)
    // POST /api/study/kb                     -> create | delete | setDefault | add
    const ICON_KB = 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm11.5 1.5L18 17l2.5-2.5 1.4 1.4L19.4 18l2.5 2.5-1.4 1.4L18 19.4l-2.5 2.5-1.4-1.4L16.6 18l-2.5-2.5 1.4-1.4Z';

    function KbPage() {
      const st = React.useState({
        kbs: null, docsKb: null, files: [], preview: null, searching: false, hits: null,
        error: null, note: null, busy: false, loading: false,
        newKbOpen: false, addKb: null,
      });
      const state = st[0]; const setState = st[1];
      const patch = function (p) { setState(function (s) { return Object.assign({}, s, p); }); };

      function load() {
        patch({ loading: true, error: null });
        apiGet('/api/study/kb')
          .then(function (body) { patch({ kbs: parseKbList(body), loading: false }); })
          .catch(function (err) { patch({ kbs: [], loading: false, error: fmt(L.kbError, String(err.message || err)) }); });
      }
      React.useEffect(load, []);

      function loadDocs(kb) {
        apiGet('/api/study/kb?docs=' + encodeURIComponent(kb) + '&kb=' + encodeURIComponent(kb))
          .then(function (body) { patch({ docsKb: kb, files: Array.isArray(body.files) ? body.files : [], preview: null, hits: null }); })
          .catch(function (err) { patch({ error: fmt(L.kbError, String(err.message || err)) }); });
      }
      function openPreview(file) {
        apiGet('/api/study/kb?file=' + encodeURIComponent(file) + '&kb=' + encodeURIComponent(state.addKb))
          .then(function (body) { patch({ preview: { file: file, text: body.text || '', truncated: body.truncated === true } }); })
          .catch(function (err) { patch({ error: fmt(L.kbError, String(err.message || err)) }); });
      }
      function runQuery(query) {
        if (!isStr(query)) { patch({ hits: null, searching: false }); return; }
        patch({ searching: true });
        apiGet('/api/study/kb?search=' + encodeURIComponent(query) + '&kb=' + encodeURIComponent(state.addKb))
          .then(function (body) {
            const hits = Array.isArray(body.results) ? body.results
              : Array.isArray(body.hits) ? body.hits : [];
            patch({ hits: hits, searching: false });
          })
          .catch(function (err) { patch({ hits: [], searching: false, error: fmt(L.kbError, String(err.message || err)) }); });
      }
      function runAction(fn, successNote) {
        patch({ busy: true, error: null, note: null });
        Promise.resolve()
          .then(fn)
          .then(function () { patch({ busy: false, note: successNote || null, newKbOpen: false, addKb: null }); load(); })
          .catch(function (err) { patch({ busy: false, error: fmt(L.kbError, String(err.message || err)) }); });
      }

      // -- New KB sub-form ------------------------------------------------------
      function NewKbForm() {
        const ns = React.useState({ name: '', desc: '' });
        const form = ns[0]; const setForm = ns[1];
        return h('div', { className: 'dt-field' },
          h('div', { className: 'dt-row' },
            h('div', { className: 'dt-field' },
              h('label', { className: 'dt-label' }, L.kbName),
              h('input', {
                className: 'dt-input', value: form.name,
                onChange: function (e) { setForm(dict('name', e.target.value)); },
              })),
            h('div', { className: 'dt-field' },
              h('label', { className: 'dt-label' }, L.kbDesc),
              h('input', {
                className: 'dt-input', value: form.desc,
                onChange: function (e) { setForm(dict('desc', e.target.value)); },
              }))),
          h('button', {
            type: 'button', className: 'dt-btn', disabled: !isStr(form.name) || state.busy,
            onClick: function () {
              runAction(function () {
                return apiPost('/api/study/kb', { action: 'create', kb: form.name, description: form.desc })
                  .then(function () { return fmt(L.kbCreated, form.name); })
                  .then(function (note) { setForm({ name: '', desc: '' }); return note; });
              });
            },
          }, L.kbCreate));
      }

      // -- KB row + docs + preview + search + add-doc ---------------------------
      function KbRow(kb) {
        const expanded = state.docsKb === kb.name;
        return h('div', { key: kb.name, className: 'dt-sec2' },
          h('div', { className: 'dt-kb-row', style: { border: 'none', borderRadius: 0 } },
            h('button', {
              type: 'button', className: 'dt-file', style: { border: 'none', background: 'transparent', width: 'auto', flex: '1 1 auto', padding: 0 },
              onClick: function () { expanded ? patch({ docsKb: null, files: [], preview: null, hits: null }) : loadDocs(kb.name); },
            },
              h('span', { className: 'dt-kb-name' }, kb.name),
              isStr(kb.description) ? h('span', { className: 'dt-kb-desc' }, kb.description) : null),
            h('div', { className: 'dt-kb-meta' },
              kb.isDefault ? h('span', { className: 'dt-badge dt-badge-brand' }, L.kbDefault) : null,
              h('span', { className: 'dt-badge' }, L.kbDocCount + ' ' + (kb.docCount != null ? kb.docCount : 0)),
              h('span', { className: 'dt-badge' }, shortDate(kb.updatedAt)),
              h('button', {
                type: 'button', className: 'dt-btn dt-btn-ghost', disabled: state.busy,
                onClick: function () {
                  if (window.confirm(fmt(L.kbConfirmDelete, kb.name))) {
                    runAction(function () {
                      return apiPost('/api/study/kb', { action: 'delete', kb: kb.name })
                        .then(function () { return fmt(L.kbDeleted, kb.name); });
                    });
                  }
                },
              }, L.kbDelete))),
          expanded
            ? h('div', { className: 'dt-sec2-body' },
              h(KbDocs, { kb: kb.name, files: state.files, onPreview: openPreview, preview: state.preview }),
              h(KbSearch, { onSearch: runQuery, hits: state.hits, searching: state.searching }),
              h(KbAddDoc, { kb: kb.name, onAdd: runAction }))
            : null);
      }

      function KbDocs(props) {
        if (!isArr(props.files)) return null;
        if (props.files.length === 0) return h('p', { className: 'dt-sb-note' }, L.none);
        return h('div', { className: 'dt-field' },
          h('p', { className: 'dt-sub-title' }, L.kbDocsTitle),
          props.files.map(function (f) {
            return h('button', {
              key: f, type: 'button', className: 'dt-file',
              onClick: function () { props.onPreview(f); },
            }, h('span', null, f), h('span', { className: 'dt-kb-meta' }, L.kbPreview));
          }),
          props.preview
            ? h('div', { className: 'dt-field' },
              h('div', { className: 'dt-row' },
                h('p', { className: 'dt-sub-title' }, props.preview.file),
                props.preview.truncated ? h('span', { className: 'dt-badge dt-badge-due' }, 'truncated') : null,
                h('button', {
                  type: 'button', className: 'dt-btn dt-btn-ghost',
                  onClick: function () { patch({ preview: null }); },
                }, L.close)),
              h('pre', { className: 'dt-pre' }, props.preview.text))
            : null);
      }

      function KbSearch(props) {
        const ss = React.useState('');
        const q = ss[0]; const setQ = ss[1];
        return h('div', { className: 'dt-field' },
          h('p', { className: 'dt-sub-title' }, L.kbSearch),
          h('div', { className: 'dt-row' },
            h('input', {
              className: 'dt-input', value: q, placeholder: L.kbSearchPh,
              onChange: function (e) { setQ(e.target.value); },
              onKeyDown: function (e) { if (e.key === 'Enter') props.onSearch(q); },
            }),
            h('button', {
              type: 'button', className: 'dt-btn dt-btn-ghost',
              disabled: props.searching || !isStr(q),
              onClick: function () { props.onSearch(q); },
            }, L.kbSearch)),
          props.hits !== null ? (props.hits.length === 0
            ? h('p', { className: 'dt-sb-note' }, L.none)
            : h('div', { className: 'dt-group' }, props.hits.map(function (hit, i) {
              return h('div', { key: i, className: 'dt-search-hit' },
                h('div', { className: 'dt-search-hit-file' }, isStr(hit.file) ? hit.file : ''),
                h('p', { className: 'dt-search-hit-text' }, isStr(hit.snippet) ? hit.snippet : ''));
            }))) : null);
      }

      function KbAddDoc(props) {
        const as = React.useState({ title: '', content: '' });
        const form = as[0]; const setForm = as[1];
        return h('div', { className: 'dt-field' },
          h('p', { className: 'dt-sub-title' }, L.kbAddDoc),
          h('input', {
            className: 'dt-input', value: form.title, placeholder: L.kbAddTitle,
            onChange: function (e) { setForm(Object.assign({}, form, { title: e.target.value })); },
          }),
          h('textarea', {
            className: 'dt-textarea', value: form.content, placeholder: L.kbContent,
            onChange: function (e) { setForm(Object.assign({}, form, { content: e.target.value })); },
          }),
          h('button', {
            type: 'button', className: 'dt-btn',
            disabled: !isStr(form.title) || !isStr(form.content) || state.busy,
            onClick: function () {
              props.onAdd(function () {
                return apiPost('/api/study/kb', {
                  action: 'add', kb: props.kb, title: form.title, content: form.content,
                });
              });
              setForm({ title: '', content: '' });
            },
          }, L.kbAdd));
      }

      return PageShell(ICON_KB, L.kbTitle, L.kbSub, L.reload, load,
        state.kbs === null
          ? Note(L.loading)
          : h(React.Fragment, null,
            h('div', { className: 'dt-sec2' },
              h('div', { className: 'dt-sec2-head' },
                h('h3', { className: 'dt-sub-title' }, L.kbNewKb),
                h('button', {
                  type: 'button', className: 'dt-btn dt-btn-ghost', style: { marginLeft: 'auto' },
                  onClick: function () { patch({ newKbOpen: !state.newKbOpen }); },
                }, state.newKbOpen ? L.close : L.kbCreate)),
              state.newKbOpen ? h('div', { className: 'dt-sec2-body' }, h(NewKbForm)) : null),
            Note(state.note),
            Note(state.error, 'error'),
            state.kbs.length === 0
              ? h('p', { className: 'dt-empty' }, L.none)
              : h('div', { className: 'dt-group' }, state.kbs.map(function (kb) { return h(KbRow, kb); }))));
    }

    // ---- Review page (sidebar.panellist order 8) ------------------------------
    // Pick a KB -> overview -> prefill the chat input with "help me review <kb>".
    // The actual teach/quiz flow then runs in conversation via study_teach /
    // study_quiz; grading lands back in the wrong-answer notebook.
    const ICON_REVIEW = 'M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.5V9h5.5L13 4.5ZM7 12h10v1.6H7V12Zm0 4h10v1.6H7V16Zm0-8h4v1.6H7V8Z';

    function findChatInput() {
      const input = document.querySelector('textarea[placeholder], .chat-input textarea, [contenteditable="true"]');
      return input || null;
    }

    function setChatText(text) {
      const input = findChatInput();
      if (!input) return false;
      if (input.isContentEditable) {
        input.textContent = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const proto = window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(input, text); else input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.focus();
      return true;
    }

    function ReviewPage() {
      const st = React.useState({ kbs: null, selected: '', error: null, note: null, loading: false });
      const state = st[0]; const setState = st[1];
      const patch = function (p) { setState(function (s) { return Object.assign({}, s, p); }); };

      function load() {
        patch({ loading: true, error: null });
        apiGet('/api/study/kb')
          .then(function (body) {
            const kbs = parseKbList(body);
            const preferred = kbs.find(function (k) { return k.isDefault; }) || kbs[0];
            patch({ kbs: kbs, selected: preferred ? preferred.name : '', loading: false });
          })
          .catch(function (err) { patch({ kbs: [], loading: false, error: fmt(L.kbError, String(err.message || err)) }); });
      }
      React.useEffect(load, []);

      const selected = state.kbs && state.kbs.find(function (k) { return k.name === state.selected; });
      const prefill = fmt(L.reviewPrefill, state.selected || '');

      function start() {
        if (!isStr(state.selected)) return;
        const ok = setChatText(prefill);
        patch({ note: ok ? fmt(L.reviewStartHint, prefill) : prefill + '\n' + L.reviewFallbackHint });
        if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(prefill).catch(function () { /* ignore */ });
        }
      }

      return PageShell(ICON_REVIEW, L.reviewTitle, L.reviewSub, L.reload, load,
        state.kbs === null
          ? Note(L.loading)
          : h(React.Fragment, null,
            h('div', { className: 'dt-field' },
              h('label', { className: 'dt-label' }, L.reviewSelectKb),
              h('select', {
                className: 'dt-sel', value: state.selected,
                onChange: function (e) { patch(dict('selected', e.target.value)); },
              },
                state.kbs.length === 0 ? h('option', { value: '' }, L.none) : null,
                state.kbs.map(function (kb) {
                  return h('option', { key: kb.name, value: kb.name }, kb.name);
                }))),
            selected
              ? h('div', { className: 'dt-review-card' },
                h('div', { className: 'dt-review-stat' },
                  h('span', { className: 'dt-kb-name' }, selected.name),
                  isStr(selected.description) ? h('p', { className: 'dt-kb-desc' }, selected.description) : null),
                h('div', { className: 'dt-review-stat' },
                  h('span', { className: 'dt-stat-num' }, String(selected.docCount != null ? selected.docCount : 0)),
                  h('span', { className: 'dt-stat-label' }, L.reviewDocs)),
                h('div', { className: 'dt-review-stat' },
                  h('span', { className: 'dt-stat-num', style: { fontSize: '12px' } }, shortDate(selected.updatedAt) || '—'),
                  h('span', { className: 'dt-stat-label' }, L.reviewLastUpdated)))
              : null,
            Note(state.error, 'error'),
            state.note ? h('pre', { className: 'dt-pre' }, state.note) : null,
            h('div', { className: 'dt-row' },
              h('button', {
                type: 'button', className: 'dt-btn', disabled: !isStr(state.selected),
                onClick: start,
              }, L.reviewStart)),
            h('p', { className: 'dt-sb-note' }, L.reviewFallbackHint)));
    }

    // Module exports: the three pages share this factory so the fetch/locale
    // helpers stay in one place; each registers as its own sidebar entry.
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        bindLocale(ctx.locale);
        ctx.effect(() => {
          function injectPage(slotName, key, id, order, Component) {
            return ctx.slots.inject(slotName, () => ctx.slots.register(
              { name: slotName, key: key, id: id, order: order },
              Component,
            ));
          }
          const disposeWrongbookMain = injectPage('main', 'deeptutor-wrongbook-main', '@local/deeptutor/wrongbook-main', 101, WrongBook);
          const disposeWrongbookSide = injectPage('sidebar.panellist', 'deeptutor-wrongbook', '@local/deeptutor/wrongbook', 6, WrongBook);
          const disposeKnowledge = injectPage('sidebar.panellist', 'deeptutor-knowledge', '@local/deeptutor/knowledge', 7, KbPage);
          const disposeReview = injectPage('sidebar.panellist', 'deeptutor-review', '@local/deeptutor/review', 8, ReviewPage);
          return function dispose() {
            disposeWrongbookMain();
            disposeWrongbookSide();
            disposeKnowledge();
            disposeReview();
          };
        }, 'deeptutor: study sidebar pages');
      },
    };
  },
});
