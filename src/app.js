/* =========================================================================
 * 知枢 · 数独 —— 应用层
 * 路由、课程页、交互盘面、练习场、诊断、求解器实验室、速查与卡片
 * ========================================================================= */
(function () {
  'use strict';

  const E = window.SudokuEngine;
  const ZS = window.ZS;

  const META = ZS.META;
  const SEEDS = ZS.SEEDS;
  const LESSONS = ZS.lessons.slice().sort((a, b) => a.num - b.num);
  const QUIZZES = ZS.quizzes;
  const CARDS = ZS.CARDS;
  const GLOSSARY = ZS.GLOSSARY;
  const TECH = ZS.TECH_META;
  const REFS = ZS.REFERENCES;

  const LESSON_MAP = {};
  LESSONS.forEach((l) => { LESSON_MAP[l.id] = l; });
  const QUIZ_MAP = {};
  QUIZZES.forEach((q) => { QUIZ_MAP[q.id] = q; });

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const STORE_KEY = 'zhishu-sudoku-v1';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) { return {}; }
  }
  const saved = loadState();
  const state = {
    theme: saved.theme || 'auto',
    visited: Array.isArray(saved.visited) ? saved.visited : [],
    quiz: saved.quiz && typeof saved.quiz === 'object' ? saved.quiz : {},
    cards: saved.cards && typeof saved.cards === 'object' ? saved.cards : {},
    practiceSolved: saved.practiceSolved || 0,
    currentPractice: saved.currentPractice || null,
    cardFilter: saved.cardFilter || '',
    cardIdx: saved.cardIdx || 0,
  };

  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { /* 存储满或隐私模式 */ }
    }, 160);
  }

  /* ---------------------------------------------------------------------
   * 主题
   * ------------------------------------------------------------------- */
  function effectiveTheme() {
    if (state.theme === 'light' || state.theme === 'dark') return state.theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', effectiveTheme());
    $$('[data-theme-icon]').forEach((el) => {
      el.innerHTML = effectiveTheme() === 'dark'
        ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>'
        : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5 7 7 0 0 0 20.5 14.5z"/></svg>';
    });
  }
  applyTheme();

  /* ---------------------------------------------------------------------
   * 路由
   * ------------------------------------------------------------------- */
  let currentRoute = { view: 'home', id: '' };
  let lastRouteKey = '';

  function parseRoute() {
    const raw = (location.hash || '#/').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { view: 'home' };
    if (parts[0] === 'lesson') return { view: 'lesson', id: parts[1] || '' };
    if (['practice', 'path', 'diagnose', 'lab', 'cheat', 'glossary', 'cards', 'search'].indexOf(parts[0]) >= 0) {
      return { view: parts[0] };
    }
    return { view: 'home' };
  }

  function routeLabel(route) {
    if (route.view === 'home') return '总览';
    if (route.view === 'path') return '学习路径';
    if (route.view === 'lesson') {
      const l = LESSON_MAP[route.id];
      return l ? ('第 ' + l.num + ' 章 · ' + l.title) : '课程';
    }
    return {
      practice: '练习场', diagnose: '诊断测试', lab: '求解器实验室',
      cheat: '速查表', glossary: '术语表', cards: '抽认卡', search: '搜索',
    }[route.view] || '总览';
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ---------------------------------------------------------------------
   * 侧边栏 / 顶栏
   * ------------------------------------------------------------------- */
  function ringSVG(pct) {
    const r = 20, c = 2 * Math.PI * r;
    return '<svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="23" cy="23" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct / 100)) + '" transform="rotate(-90 23 23)"/></svg>';
  }

  function sidebarHTML(route) {
    const done = state.visited.length;
    const pct = Math.round(done / LESSONS.length * 100);
    let html = '';
    html += '<div class="brand"><a href="#/">';
    html += '<div class="brand-kicker">知枢 · 学习系统</div>';
    html += '<h1>数独：从规则到链</h1>';
    html += '<div class="brand-sub">16 章 · 可下手 · 可验证</div>';
    html += '</a></div>';
    html += '<div class="progress-block">';
    html += '<div class="progress-ring">' + ringSVG(pct) + '<span class="ring-text">' + pct + '%</span></div>';
    html += '<div class="progress-meta"><b>' + done + ' / ' + LESSONS.length + '</b> 章已学<br>' + state.practiceSolved + ' 盘练习完成</div>';
    html += '</div>';
    html += '<input id="nav-search" type="search" placeholder="筛课程…" aria-label="筛课程">';
    html += '<nav class="nav" id="nav">';
    html += '<div class="nav-group">开始</div>';
    html += navItem('#/', '总览', '', route.view === 'home');
    html += navItem('#/path', '学习路径', '', route.view === 'path');
    html += navItem('#/diagnose', '诊断测试', '', route.view === 'diagnose');
    html += '<div class="nav-group">课程</div>';
    LESSONS.forEach((l) => {
      html += navItem('#/lesson/' + l.id, l.title, String(l.num).padStart(2, '0'), route.view === 'lesson' && route.id === l.id, state.visited.indexOf(l.id) >= 0);
    });
    html += '<div class="nav-group">练手</div>';
    html += navItem('#/practice', '练习场', '', route.view === 'practice');
    html += navItem('#/lab', '求解器实验室', '', route.view === 'lab');
    html += '<div class="nav-group">资料</div>';
    html += navItem('#/cheat', '速查表', '', route.view === 'cheat');
    html += navItem('#/glossary', '术语表', '', route.view === 'glossary');
    html += navItem('#/cards', '抽认卡', '', route.view === 'cards');
    html += '</nav>';
    return html;
  }
  function navItem(href, title, num, active, done) {
    return '<a class="nav-item' + (active ? ' active' : '') + (done ? ' done' : '') + '" href="' + href + '">' +
      '<span class="nav-num">' + (num || '') + '</span><span class="nav-title">' + esc(title) + '</span><span class="nav-done"></span></a>';
  }

  function topbarHTML(route) {
    return '<button class="icon-btn menu-btn" id="menu-btn" aria-label="打开目录">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
      '<div class="crumb"><b>' + esc(routeLabel(route)) + '</b></div>' +
      '<div class="top-actions"><button class="icon-btn" id="theme-btn" aria-label="切换主题"><span data-theme-icon></span></button></div>';
  }

  /* ---------------------------------------------------------------------
   * 通用页面块
   * ------------------------------------------------------------------- */
  function difficultyStars(n) {
    let s = '';
    for (let i = 1; i <= 3; i++) s += '<span class="' + (i <= n ? '' : 'off') + '">★</span>';
    return '<span class="difficulty" aria-label="难度 ' + n + ' 星">' + s + '</span>';
  }

  function chapterCard(l) {
    const done = state.visited.indexOf(l.id) >= 0;
    return '<a class="chapter-card' + (done ? ' done' : '') + '" href="#/lesson/' + l.id + '">' +
      '<div class="num"><span>第 ' + String(l.num).padStart(2, '0') + ' 章</span><span>' + difficultyStars(l.difficulty) + '</span></div>' +
      '<h3>' + esc(l.title) + '</h3>' +
      '<p>' + esc(l.kicker) + '</p>' +
      '<div class="meta"><span>' + l.minutes + ' 分钟</span><span>' + (done ? '已学' : '未开始') + '</span></div></a>';
  }

  function homeHTML() {
    const done = state.visited.length;
    const pct = Math.round(done / LESSONS.length * 100);
    const quizIds = Object.keys(state.quiz);
    const quizOk = quizIds.filter((id) => state.quiz[id] && state.quiz[id].correct).length;
    const acc = quizIds.length ? Math.round(quizOk / quizIds.length * 100) : 0;
    let html = '';
    html += '<section class="hero">';
    html += '<div class="hero-kicker">知枢 · 数独学习系统</div>';
    html += '<h1>把数独从“会填”<br>学到“讲得清为什么”。</h1>';
    html += '<p class="lead">16 章按依赖顺序走：规则与候选数打底，唯一余数、隐性唯一、区块、数组、鱼形、链逐层升级；每一章配可下手的盘面、会解释的提示，以及能验证唯一解与难度的求解器。</p>';
    html += '<div class="hero-actions"><a class="btn primary" href="#/lesson/ch01">从第 1 章开始</a><a class="btn" href="#/practice">直接去练习</a><a class="btn ghost" href="#/lab">打开求解器</a></div>';
    html += '<div class="hero-note">零基础可读。不需要先会数学，只需要愿意把候选数写出来。</div>';
    html += '</section>';
    html += '<div class="stats-row">' +
      '<div class="stat"><b>' + pct + '%</b><span>课程进度 · ' + done + '/' + LESSONS.length + ' 章</span></div>' +
      '<div class="stat"><b>' + acc + '%</b><span>测验正确率 · 已作答 ' + quizIds.length + ' 题</span></div>' +
      '<div class="stat"><b>' + state.practiceSolved + '</b><span>练习完成盘数</span></div></div>';

    html += '<div class="section-head"><h2>学习路径</h2><span class="small">按依赖顺序，前一章是后一章的地基</span></div>';
    html += '<div class="path-lanes">';
    html += '<div class="lane"><h4>基础 · 规则与候选</h4><ul>' + LESSONS.slice(0, 5).map((l) => '<li><a href="#/lesson/' + l.id + '">' + l.num + '. ' + esc(l.title) + '</a></li>').join('') + '</ul></div>';
    html += '<div class="lane"><h4>进阶 · 排除与结构</h4><ul>' + LESSONS.slice(5, 9).map((l) => '<li><a href="#/lesson/' + l.id + '">' + l.num + '. ' + esc(l.title) + '</a></li>').join('') + '</ul></div>';
    html += '<div class="lane"><h4>高难 · 唯一性与链</h4><ul>' + LESSONS.slice(9, 12).map((l) => '<li><a href="#/lesson/' + l.id + '">' + l.num + '. ' + esc(l.title) + '</a></li>').join('') + '</ul></div>';
    html += '<div class="lane"><h4>应用 · 程序与检验</h4><ul>' + LESSONS.slice(12).map((l) => '<li><a href="#/lesson/' + l.id + '">' + l.num + '. ' + esc(l.title) + '</a></li>').join('') + '</ul></div>';
    html += '</div>';

    html += '<div class="section-head"><h2>十六章</h2><span class="small">点开任意一章；学完会自动记进度</span></div>';
    html += '<div class="chapter-grid">' + LESSONS.map(chapterCard).join('') + '</div>';
    html += '<div class="note-strip">建议顺序：先把第 1–5 章走完，能独立做入门题；再用第 6–9 章处理中等题；第 10–12 章是专家题的分水岭；第 13–16 章把方法收成流程，并交给程序验证。</div>';
    return html;
  }

  function pathHTML() {
    let html = '<div class="lesson-head"><div class="lesson-kicker">学习路径</div><h1>十六步，按依赖排</h1><p class="lesson-sub">每一步都给出前置与检查点。前置没过就往下走，后面会反复卡住。</p></div>';
    html += '<div class="table-wrap"><table class="tech-table"><thead><tr><th>步骤</th><th>章节</th><th>前置</th><th>检查点</th></tr></thead><tbody>';
    LESSONS.forEach((l) => {
      const pre = (l.prereq || []).map((p) => LESSON_MAP[p] ? '第 ' + LESSON_MAP[p].num + ' 章' : p).join('、') || '无';
      html += '<tr><td>' + String(l.num).padStart(2, '0') + '</td><td><a href="#/lesson/' + l.id + '">' + esc(l.title) + '</a></td><td>' + esc(pre) + '</td><td>做完本章测验，正确率 ≥ 80%</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="note-strip">如果你只想尽快能做中等题，走 1 → 3 → 4 → 5 → 6 → 7 → 8。想理解“为什么这些技巧成立”，不要跳第 2、10、12 章。</div>';
    return html;
  }

  /* ---------------------------------------------------------------------
   * 课程页
   * ------------------------------------------------------------------- */
  let DEMO_SPECS = [];

  function demoPlaceholder(spec, caption) {
    const id = 'd' + DEMO_SPECS.length;
    DEMO_SPECS.push({ spec: spec, caption: caption || spec.caption || '' });
    return '<div data-demo="' + id + '"></div>';
  }

  function lessonHTML(id) {
    const l = LESSON_MAP[id];
    if (!l) return '<p>没有这一章。<a href="#/">回到总览</a></p>';
    DEMO_SPECS = [];
    const idx = LESSONS.indexOf(l);
    const prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
    let html = '';
    html += '<div class="lesson-kicker">第 ' + l.num + ' 章 · 难度 ' + difficultyStars(l.difficulty) + '</div>';
    html += '<div class="lesson-head"><h1>' + esc(l.title) + '</h1><p class="lesson-sub">' + esc(l.kicker) + '</p>';
    html += '<div class="lesson-meta"><span class="chip">' + l.minutes + ' 分钟</span>';
    (l.prereq || []).forEach((p) => {
      const pl = LESSON_MAP[p];
      if (pl) html += '<a class="chip" href="#/lesson/' + p + '">⬅ 第 ' + pl.num + ' 章 · ' + esc(pl.title) + '</a>';
    });
    html += '<a class="chip teal" href="#/practice">去练习场</a></div></div>';

    html += '<div class="goal-box"><h3>学完你能</h3><ul>' + l.goals.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul></div>';
    html += '<div class="core-box"><span class="label">一句话核心</span>' + esc(l.core) + '</div>';
    html += '<article class="lesson-body">' + l.body + '</article>';

    if (l.demo) html += '<h2 class="lesson-section-title">上手看一遍</h2>';
    if (l.demo) html += demoPlaceholder(l.demo, l.demo.caption);
    if (l.demos) {
      html += '<h2 class="lesson-section-title">两个方向都看一遍</h2>';
      l.demos.forEach((d) => { html += demoPlaceholder(d, d.caption); });
    }

    if (l.misconceptions && l.misconceptions.length) {
      html += '<section class="misconceptions"><h2>常见误解</h2>';
      l.misconceptions.forEach((m) => {
        html += '<div class="mis-item"><span class="x">×</span><div><b>别以为：</b>' + esc(m.wrong) + '<br><span class="right"><b>实际上：</b>' + esc(m.right) + '</span></div></div>';
      });
      html += '</section>';
    }

    if (l.depth) {
      html += '<details class="depth"><summary>🔬 展开完整第一性原理推导：' + esc(l.depth.title) + '</summary><div class="depth-body">' + l.depth.html + '</div></details>';
    }

    const qs = QUIZZES.filter((q) => q.lesson === l.id);
    if (qs.length) {
      html += '<section class="quizzes"><h2>自测</h2>' + qs.map((q, i) => quizBlock(q, i + 1)).join('') + '</section>';
    }

    html += '<section class="anchors"><h2>复习锚点</h2><ul>' + l.anchors.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul></section>';
    if (l.sources && l.sources.length) {
      html += '<section class="sources"><h2>参考</h2><ul>' + l.sources.map((s) => '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a></li>').join('') + '</ul></section>';
    }
    html += '<div class="lesson-nav">';
    html += prev ? '<a class="btn" href="#/lesson/' + prev.id + '">← 第 ' + prev.num + ' 章 · ' + esc(prev.title) + '</a>' : '<span></span>';
    html += next ? '<a class="btn primary" href="#/lesson/' + next.id + '">第 ' + next.num + ' 章 · ' + esc(next.title) + ' →</a>' : '<a class="btn primary" href="#/diagnose">去做诊断 →</a>';
    html += '</div>';
    return html;
  }

  /* ---------------------------------------------------------------------
   * 盘面渲染
   * ------------------------------------------------------------------- */
  function parseDigitsToMask(s) {
    let m = 0;
    String(s || '').split('').forEach((ch) => {
      const d = parseInt(ch, 10);
      if (d >= 1 && d <= 9) m |= E.bit(d);
    });
    return m;
  }

  function conflictsIn(grid) {
    const bad = new Set();
    E.UNITS.forEach((unit) => {
      const map = {};
      unit.cells.forEach((c) => {
        const v = grid[c];
        if (!v) return;
        if (map[v] === undefined) map[v] = c;
        else { bad.add(c); bad.add(map[v]); }
      });
    });
    return bad;
  }

  function boardHTML(opts) {
    const grid = opts.grid;
    const cand = opts.cand || null;
    const given = opts.given || null;
    const focus = opts.focus || [];
    const hl2 = opts.hl2 || [];
    const unit = opts.unit || [];
    const elims = opts.elims || [];
    const pending = opts.pending || [];
    const wrong = opts.wrong || new Set();
    const selected = opts.selected;
    const interactive = !!opts.interactive;
    const elimMap = {};
    elims.forEach((e) => {
      elimMap[e.cell] = elimMap[e.cell] || {};
      elimMap[e.cell][e.digit] = true;
    });
    const pendingMap = {};
    pending.forEach((p) => { pendingMap[p.cell] = p.digit; });
    const conflict = opts.conflict ? conflictsIn(grid) : new Set();
    const cls = opts.cls || 'board';
    let html = '<div class="' + cls + '"' + (interactive ? ' id="practice-board"' : '') + ' role="grid" aria-label="数独盘面">';
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const classes = ['cell'];
      if (c % 3 === 2 && c !== 8) classes.push('br');
      if (r % 3 === 2 && r !== 8) classes.push('bb');
      if (given && given[i]) classes.push('given');
      else if (grid[i]) classes.push('user');
      if (focus.indexOf(i) >= 0) classes.push('focus');
      if (hl2.indexOf(i) >= 0) classes.push('unit');
      if (unit.indexOf(i) >= 0) classes.push('unit');
      if (conflict.has(i) || wrong.has(i)) classes.push('wrong');
      if (elimMap[i]) classes.push('elim-cell');
      if (selected === i) classes.push('selected');
      if (interactive) classes.push('practice');
      const tag = interactive ? 'button' : 'div';
      const attrs = interactive ? ' type="button" data-i="' + i + '" aria-label="R' + (r + 1) + 'C' + (c + 1) + ' ' + (grid[i] ? grid[i] : '空') + '"' : ' data-i="' + i + '"';
      html += '<' + tag + ' class="' + classes.join(' ') + '"' + attrs + '>';
      if (grid[i]) {
        html += '<span class="val">' + grid[i] + '</span>';
      } else {
        if (pendingMap[i]) {
          html += '<span class="pending-val">' + pendingMap[i] + '</span>';
        } else {
          html += '<span class="notes">';
          for (let d = 1; d <= 9; d++) {
            const on = cand && (cand[i] & E.bit(d));
            const hit = focus.indexOf(i) >= 0 && on;
            const elim = elimMap[i] && elimMap[i][d];
            html += '<span class="' + (hit ? 'hit' : '') + (elim ? ' elim' : '') + '">' + (on ? d : '') + '</span>';
          }
          html += '</span>';
        }
      }
      html += '</' + tag + '>';
    }
    html += '</div>';
    return html;
  }

  function renderStaticBoards(root) {
    $$('.mini-board[data-board]', root).forEach((el) => {
      const board = E.parse(el.getAttribute('data-board'));
      const notes = {};
      const rawNotes = el.getAttribute('data-notes') || '';
      rawNotes.split(',').forEach((pair) => {
        if (!pair) return;
        const kv = pair.split(':');
        notes[parseInt(kv[0], 10)] = parseDigitsToMask(kv[1]);
      });
      const cand = new Uint16Array(81);
      Object.keys(notes).forEach((k) => { cand[k] = notes[k]; });
      const hl = (el.getAttribute('data-hl') || '').split(',').filter(Boolean).map(Number);
      const hl2 = (el.getAttribute('data-hl2') || '').split(',').filter(Boolean).map(Number);
      const shade = (el.getAttribute('data-shade') || '').split(',').filter(Boolean);
      const unitCells = [];
      shade.forEach((spec) => {
        const [type, idxStr] = spec.split(':');
        const idx = parseInt(idxStr, 10);
        const cells = type === 'row' ? E.ROWS[idx] : type === 'col' ? E.COLS[idx] : E.BOXES[idx];
        cells.forEach((c) => unitCells.push(c));
      });
      el.innerHTML = boardHTML({
        grid: board, cand: cand, given: board,
        focus: hl, hl2: hl2, unit: unitCells,
        conflict: el.getAttribute('data-conflict') === '1',
        cls: 'mini-board',
      });
      const cap = el.getAttribute('data-caption');
      if (cap) {
        const p = document.createElement('p');
        p.className = 'mini-caption';
        p.textContent = cap;
        el.insertAdjacentElement('afterend', p);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * 示意图
   * ------------------------------------------------------------------- */
  function schematicHTML(kind) {
    const S = 26, PAD = 20, TOP = 14, W = 9 * S + PAD * 2, H = TOP + 9 * S + 30;
    const CELL = (i) => ({ x: PAD + (i % 9) * S, y: TOP + Math.floor(i / 9) * S });
    const fills = { a: 'var(--accent-soft)', b: 'var(--accent-2-soft)', c: 'color-mix(in srgb, var(--gold) 20%, var(--panel))' };
    function grid() {
      let s = '';
      for (let i = 0; i < 81; i++) {
        const p = CELL(i);
        s += '<rect x="' + p.x + '" y="' + p.y + '" width="' + S + '" height="' + S + '" fill="var(--panel)" stroke="var(--line)" stroke-width="0.6"/>';
      }
      for (let k = 0; k <= 3; k++) {
        s += '<line x1="' + (PAD + k * 3 * S) + '" y1="' + TOP + '" x2="' + (PAD + k * 3 * S) + '" y2="' + (TOP + 9 * S) + '" stroke="var(--board-thick)" stroke-width="1.6"/>';
        s += '<line x1="' + PAD + '" y1="' + (TOP + k * 3 * S) + '" x2="' + (PAD + 9 * S) + '" y2="' + (TOP + k * 3 * S) + '" stroke="var(--board-thick)" stroke-width="1.6"/>';
      }
      return s;
    }
    function cell(i, fill, label, cls) {
      const p = CELL(i);
      let s = '<rect x="' + (p.x + 1) + '" y="' + (p.y + 1) + '" width="' + (S - 2) + '" height="' + (S - 2) + '" fill="' + (fills[fill] || fill) + '" stroke="var(--accent)" stroke-width="' + (cls === 'strong' ? 2 : 1.2) + '" rx="1"/>';
      if (label) s += '<text x="' + (p.x + S / 2) + '" y="' + (p.y + S / 2 + 4) + '" text-anchor="middle" font-size="11" fill="var(--ink)" font-family="ui-monospace,monospace">' + label + '</text>';
      return s;
    }
    function line(a, b, dashed) {
      const p = CELL(a), q = CELL(b);
      return '<line x1="' + (p.x + S / 2) + '" y1="' + (p.y + S / 2) + '" x2="' + (q.x + S / 2) + '" y2="' + (q.y + S / 2) + '" stroke="var(--accent-2)" stroke-width="1.6" stroke-dasharray="' + (dashed ? '4 4' : '0') + '"/>';
    }
    function caption(text, color) {
      return '<text x="' + PAD + '" y="' + (TOP + 9 * S + 19) + '" font-size="10" fill="' + (color || 'var(--muted)') + '">' + text + '</text>';
    }
    let body = grid();
    if (kind === 'pointing') {
      body += cell(0, 'a', '5') + cell(1, 'a', '5') + cell(2, 'c', '5');
      body += '<line x1="' + (PAD + 3 * S) + '" y1="' + (TOP + 0.5 * S) + '" x2="' + (PAD + 9 * S) + '" y2="' + (TOP + 0.5 * S) + '" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="5 4"/>';
      body += caption('宫 1 的 5 只在这一行', 'var(--accent)');
    } else if (kind === 'claiming') {
      body += cell(18, 'a', '7') + cell(19, 'a', '7') + cell(20, 'c', '7');
      body += caption('第 3 行的 7 只在这个宫', 'var(--accent)');
    } else if (kind === 'xwing') {
      [10, 16, 46, 52].forEach((i) => { body += cell(i, 'a', 'd'); });
      body += line(10, 16) + line(46, 52) + line(10, 46, true) + line(16, 52, true);
      body += caption('两行两列 · 四个角');
    } else if (kind === 'swordfish') {
      [0, 4, 27, 35, 54, 62].forEach((i) => { body += cell(i, 'a', 'd'); });
      body += line(0, 27, true) + line(4, 35, true) + line(54, 62, true);
      body += caption('三行 · 三列');
    } else if (kind === 'ur') {
      [0, 3, 9, 12].forEach((i, k) => { body += cell(i, 'a', ['a', 'b', 'b', 'a'][k]); });
      body += caption('两行两列 · 两个宫', 'var(--accent)');
    } else if (kind === 'xywing') {
      body += cell(40, 'a', 'x,y') + cell(13, 'b', 'x,z') + cell(39, 'b', 'y,z');
      body += line(40, 13, true) + line(40, 39, true) + line(13, 39, true);
      body += caption('枢轴 z 同时看见两翼');
    } else if (kind === 'chain') {
      body += cell(10, 'a', 'T') + cell(13, 'b', 'F') + cell(22, 'a', 'T') + cell(31, 'b', 'F') + cell(40, 'a', 'T');
      body += line(10, 13) + line(13, 22, true) + line(22, 31) + line(31, 40, true);
      body += caption('实线 = 强链 · 虚线 = 弱链');
    }
    return '<div class="schematic"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="结构示意图">' + body + '</svg></div>';
  }

  function renderSchematics(root) {
    $$('.schematic[data-kind]', root).forEach((el) => {
      el.outerHTML = schematicHTML(el.getAttribute('data-kind'));
    });
  }

  /* ---------------------------------------------------------------------
   * 技巧演示
   * ------------------------------------------------------------------- */
  function buildDemo(puzzle, targetTech) {
    const parsed = E.parse(puzzle);
    const st = E.initialState(parsed);
    const frames = [];
    let target = -1;
    for (let i = 0; i < 90; i++) {
      if (E.isSolved(st.grid)) break;
      const step = E.findStep(st, 99);
      if (!step) break;
      frames.push({
        grid: E.cloneGrid(st.grid),
        cand: new Uint16Array(st.cand),
        step: step,
      });
      E.applyStep(st, step);
      if (step.tech === targetTech) { target = frames.length - 1; break; }
    }
    return { parsed: parsed, frames: frames, target: target };
  }

  function mountDemo(container, spec, caption) {
    if (spec.kind === 'board') {
      const parsed = E.parse(spec.puzzle);
      const shade = spec.shade || [];
      const unit = [];
      shade.forEach((s) => {
        const parts = s.split(':');
        const idx = parseInt(parts[1], 10);
        const cells = parts[0] === 'row' ? E.ROWS[idx] : parts[0] === 'col' ? E.COLS[idx] : E.BOXES[idx];
        cells.forEach((c) => unit.push(c));
      });
      container.innerHTML = '<div class="demo"><div class="demo-head"><h4>盘面</h4></div>' +
        '<div class="demo-board">' + boardHTML({ grid: parsed, given: parsed, focus: spec.focus || [], unit: unit, cls: 'mini-board' }) + '</div>' +
        '<p class="demo-caption">' + esc(caption) + '</p></div>';
      return;
    }
    const demo = buildDemo(spec.puzzle, spec.tech);
    if (!demo.frames.length) {
      container.innerHTML = '<div class="demo"><p class="muted">这道演示题没有可展示的步骤。</p></div>';
      return;
    }
    let idx = demo.target >= 0 ? demo.target : 0;
    container.innerHTML = '<div class="demo"><div class="demo-head"><h4>盘面演示</h4><span class="demo-badge" id="demo-badge"></span></div>' +
      '<div class="demo-layout"><div class="demo-board" id="demo-board"></div>' +
      '<div class="demo-side"><div class="demo-step-title" id="demo-title"></div><div class="demo-step-text" id="demo-text"></div>' +
      '<div class="demo-controls"><button class="btn small" data-act="first">开局</button><button class="btn small" data-act="prev">上一步</button><button class="btn small" data-act="next">下一步</button><button class="btn small primary" data-act="target">跳到目标技巧</button></div>' +
      '<div class="demo-progress" id="demo-progress"></div></div></div>' +
      '<p class="demo-caption">' + esc(caption) + '</p></div>';
    const boardEl = $('#demo-board', container);
    const titleEl = $('#demo-title', container);
    const textEl = $('#demo-text', container);
    const badgeEl = $('#demo-badge', container);
    const progressEl = $('#demo-progress', container);

    function paint() {
      const f = demo.frames[idx];
      boardEl.innerHTML = boardHTML({
        grid: f.grid, cand: f.cand, given: demo.parsed,
        focus: f.step.focus, unit: f.step.unit ? f.step.unit.cells : [],
        elims: f.step.eliminations, pending: f.step.placements, cls: 'board',
      });
      titleEl.textContent = '第 ' + (idx + 1) + ' 步 · ' + f.step.title;
      textEl.textContent = f.step.text;
      progressEl.textContent = '第 ' + (idx + 1) + ' / ' + demo.frames.length + ' 步' + (demo.target >= 0 ? ' · 目标：' + demo.frames[demo.target].step.title : '');
      badgeEl.textContent = demo.target >= 0 && idx < demo.target ? ('还差 ' + (demo.target - idx) + ' 步') : (demo.target >= 0 && idx === demo.target ? '目标技巧' : '');
    }
    function go(i) { idx = Math.max(0, Math.min(demo.frames.length - 1, i)); paint(); }
    $$('[data-act]', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        if (act === 'first') go(0);
        else if (act === 'prev') go(idx - 1);
        else if (act === 'next') go(idx + 1);
        else if (act === 'target') go(demo.target >= 0 ? demo.target : 0);
      });
    });
    paint();
  }

  function mountAllDemos(root) {
    $$('[data-demo]', root).forEach((el) => {
      const item = DEMO_SPECS[parseInt(el.getAttribute('data-demo').slice(1), 10)];
      if (item) mountDemo(el, item.spec, item.caption);
    });
  }

  /* ---------------------------------------------------------------------
   * 测验
   * ------------------------------------------------------------------- */
  function quizBlock(q, num) {
    let html = '<div class="quiz" data-q="' + q.id + '">';
    html += '<p class="quiz-q"><b>Q' + num + '.</b> ' + esc(q.question) + '</p>';
    html += '<div class="quiz-opts">';
    q.options.forEach((o, i) => {
      html += '<label class="quiz-opt"><input type="radio" name="' + q.id + '" value="' + i + '"> <span>' + esc(o) + '</span></label>';
    });
    html += '</div><div class="quiz-actions"><button class="btn small quiz-check">检查答案</button><span class="quiz-feedback"></span></div></div>';
    return html;
  }

  function traceRoots(lessonId) {
    const out = [];
    const seen = new Set([lessonId]);
    const queue = [lessonId];
    while (queue.length && out.length < 5) {
      const id = queue.shift();
      const l = LESSON_MAP[id];
      if (!l) continue;
      (l.prereq || []).forEach((p) => {
        if (seen.has(p) || !LESSON_MAP[p]) return;
        seen.add(p);
        out.push(p);
        queue.push(p);
      });
    }
    return out.slice(0, 5).map((id) => LESSON_MAP[id]);
  }

  function bindQuiz(el, q) {
    const btn = $('.quiz-check', el);
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const sel = $('input:checked', el);
      const val = sel ? parseInt(sel.value, 10) : null;
      const correct = val === q.answer;
      $$('.quiz-opt', el).forEach((opt) => {
        const input = $('input', opt);
        opt.classList.remove('correct', 'wrong');
        if (parseInt(input.value, 10) === q.answer) opt.classList.add('correct');
        else if (input.checked) opt.classList.add('wrong');
      });
      const fb = $('.quiz-feedback', el);
      fb.className = 'quiz-feedback ' + (correct ? 'ok' : 'bad');
      fb.textContent = correct ? '✓ 正确' : (val === null ? '未作答' : '✗ 错误');
      let ex = $('.quiz-explain', el);
      if (!ex) {
        ex = document.createElement('div');
        ex.className = 'quiz-explain';
        el.appendChild(ex);
      }
      ex.textContent = '解析：' + q.explain;

      let remedy = $('.quiz-remedy', el);
      if (!correct) {
        if (!remedy) {
          remedy = document.createElement('div');
          remedy.className = 'quiz-remedy';
          el.appendChild(remedy);
        }
        const roots = traceRoots(q.lesson === '__all' ? (q.concept ? conceptLesson(q.concept) : q.lesson) : q.lesson);
        if (roots.length) {
          remedy.innerHTML = '🔍 可能的根因：' + roots.map((l) => '<a href="#/lesson/' + l.id + '">第 ' + l.num + ' 章 · ' + esc(l.title) + '</a>').join(' → ');
        } else {
          remedy.innerHTML = '这题没有更早的前置章，回看本章的“一句话核心”和第一个示例。';
        }
        if (val !== null && q.mis && q.mis[val]) {
          const card = document.createElement('div');
          card.className = 'mis-card';
          card.innerHTML = '<b>⚠ 你选的选项对应一个常见误解</b><br>' + esc(q.mis[val]);
          remedy.appendChild(card);
        }
      } else if (remedy) remedy.innerHTML = '';

      const old = state.quiz[q.id] || { attempts: 0, correct: false };
      state.quiz[q.id] = { attempts: old.attempts + 1, correct: correct };
      saveState();
    });
  }

  function conceptLesson(conceptId) {
    const l = LESSONS.find((x) => (x.concepts || []).indexOf(conceptId) >= 0);
    return l ? l.id : '';
  }

  function bindQuizzes(root) {
    $$('.quiz[data-q]', root).forEach((el) => {
      const q = QUIZ_MAP[el.getAttribute('data-q')];
      if (q) bindQuiz(el, q);
    });
  }

  /* ---------------------------------------------------------------------
   * 练习场
   * ------------------------------------------------------------------- */
  let P = null;
  let practiceTicker = null;
  let pendingPractice = null;
  const DIFF_ORDER = ['starter', 'easy', 'medium', 'hard', 'expert'];
  const DIFF_LABEL = { starter: '入门', easy: '简单', medium: '中等', hard: '困难', expert: '专家' };

  function snapshot() {
    return { grid: E.cloneGrid(P.grid), notes: new Uint16Array(P.notes) };
  }

  function startPractice(diff, forcedPuzzle) {
    diff = diff || 'starter';
    let puzzle, solution;
    if (forcedPuzzle && forcedPuzzle.puzzle) {
      puzzle = E.parse(forcedPuzzle.puzzle);
      solution = forcedPuzzle.solution ? E.parse(forcedPuzzle.solution) : E.solve(puzzle);
    } else {
      const bank = SEEDS[diff] && SEEDS[diff].length ? SEEDS[diff] : SEEDS.starter;
      const seed = bank[Math.floor(Math.random() * bank.length)];
      puzzle = E.transform(E.parse(seed.puzzle));
      solution = E.solve(puzzle);
    }
    if (!solution) {
      // 极少数情况下题目非法，退回一道固定题
      puzzle = E.parse(SEEDS.starter[0].puzzle);
      solution = E.solve(puzzle);
    }
    P = {
      diff: diff,
      puzzle: puzzle,
      solution: solution,
      given: E.cloneGrid(puzzle),
      grid: E.cloneGrid(puzzle),
      notes: E.candidates(puzzle),
      selected: firstEmpty(puzzle),
      mode: 'value',
      candMode: 'auto',
      history: [],
      future: [],
      hint: null,
      wrong: new Set(),
      elapsed: 0,
      solved: false,
      startedAt: Date.now(),
    };
    state.currentPractice = serializePractice();
    saveState();
  }

  function firstEmpty(grid) {
    for (let i = 0; i < 81; i++) if (!grid[i]) return i;
    return 40;
  }

  function serializePractice() {
    if (!P) return null;
    return {
      puzzle: E.format(P.puzzle, '0'), solution: E.format(P.solution, '0'),
      grid: Array.from(P.grid), notes: Array.from(P.notes),
      elapsed: P.elapsed, diff: P.diff, candMode: P.candMode, solved: P.solved,
    };
  }

  function restorePractice() {
    const s = state.currentPractice;
    if (!s || !s.puzzle) return false;
    try {
      const puzzle = E.parse(s.puzzle);
      const solution = E.parse(s.solution);
      const grid = new Uint8Array(81);
      for (let i = 0; i < 81; i++) grid[i] = s.grid[i] || 0;
      const notes = new Uint16Array(81);
      for (let i = 0; i < 81; i++) notes[i] = s.notes[i] || 0;
      P = {
        diff: s.diff || 'starter', puzzle: puzzle, solution: solution, given: E.cloneGrid(puzzle),
        grid: grid, notes: notes, selected: firstEmpty(grid), mode: 'value',
        candMode: s.candMode || 'auto', history: [], future: [], hint: null,
        wrong: new Set(), elapsed: s.elapsed || 0, solved: !!s.solved, startedAt: Date.now(),
      };
      return true;
    } catch (err) { return false; }
  }

  function ensurePractice() {
    if (pendingPractice) {
      const forced = pendingPractice;
      pendingPractice = null;
      startPractice(forced.diff || 'medium', forced);
      return;
    }
    if (P) return;
    if (!restorePractice()) startPractice('starter');
  }

  function practiceBoardCand() {
    if (!P) return null;
    if (P.candMode === 'auto') return E.candidates(P.grid);
    return P.notes;
  }

  function practiceHTML() {
    ensurePractice();
    const clues = Array.from(P.given).filter(Boolean).length;
    let hint = '';
    if (P.hint) {
      const s = P.hint;
      hint = '<div class="hint-box"><b>' + esc(s.title) + '</b><br>' + esc(s.text) +
        (s.placements && s.placements.length ? '<div class="hint-actions"><button class="btn small primary" data-act="apply-hint">填入这一步</button>' : '') +
        '<button class="btn small" data-act="close-hint">收起</button></div>';
    }
    let html = '<div class="practice-head"><h1>练习场</h1><span class="chip">' + (DIFF_LABEL[P.diff] || P.diff) + '</span><span class="chip">' + clues + ' 个提示</span><span class="chip teal" id="timer-chip">用时 ' + fmtTime(P.elapsed) + '</span></div>';
    html += '<div class="diff-tabs">' + DIFF_ORDER.map((d) => '<button data-diff="' + d + '" class="' + (P.diff === d ? 'active' : '') + '">' + DIFF_LABEL[d] + '</button>').join('') + '<button data-act="new">换一题</button></div>';
    html += '<div class="practice-layout"><div class="practice-main">';
    html += '<div class="practice-board-wrap">' + boardHTML({
      grid: P.grid, cand: practiceBoardCand(), given: P.given,
      focus: P.hint && P.hint.focus ? P.hint.focus : [],
      unit: P.hint && P.hint.unit ? P.hint.unit.cells : [],
      elims: P.hint && P.hint.eliminations ? P.hint.eliminations : [],
      pending: P.hint && P.hint.placements ? P.hint.placements : [],
      wrong: P.wrong, selected: P.selected, interactive: true, conflict: true, cls: 'board',
    }) + '</div>';
    html += '<div class="practice-info"><span>选中 ' + E.cellName(P.selected) + ' · ' + (P.mode === 'note' ? '标记候选' : '填数') + ' · 候选' + (P.candMode === 'auto' ? '自动' : '手动') + '</span><span>' + (P.solved ? '已完成' : '') + '</span></div>';
    html += '<div class="pad">';
    for (let d = 1; d <= 9; d++) html += '<button data-digit="' + d + '">' + d + '</button>';
    html += '<button data-digit="0" aria-label="删除">⌫</button>';
    html += '<button data-act="notes" class="' + (P.mode === 'note' ? 'active' : '') + '">标记</button>';
    html += '<button data-act="undo">撤销</button><button data-act="redo">重做</button><button data-act="check">检查</button><button data-act="hint">提示</button>';
    html += '</div></div>';
    html += '<aside class="practice-side">';
    html += '<div class="card"><h3 style="margin:0 0 6px;font-size:14px">操作</h3><div class="small muted" style="line-height:1.8">点格子选中；键盘 1–9 填数；N 切换标记；方向键移动。每填一格，候选自动更新。</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn small" data-act="hint">提示下一步</button><button class="btn small" data-act="reveal">显示一格答案</button><button class="btn small" data-act="candmode">候选：' + (P.candMode === 'auto' ? '自动' : '手动') + '</button></div></div>';
    html += '<div class="card"><h3 style="margin:0 0 6px;font-size:14px">这盘题</h3><div class="small muted" style="line-height:1.9">难度：' + (DIFF_LABEL[P.diff] || P.diff) + '<br>提示数：' + clues + '<br>用时：<span id="timer-text">' + fmtTime(P.elapsed) + '</span><br>错误标记：' + P.wrong.size + '</div></div>';
    if (hint) html += hint;
    html += '<div class="card small muted"><b style="color:var(--ink)">卡住了？</b><br>先点“提示下一步”。系统会按技巧顺序找到当前盘面能用的最简单一招，并把涉及的格子标出来。</div>';
    html += '</aside></div>';
    return html;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function updateTimerUI() {
    const a = $('#timer-chip'), b = $('#timer-text');
    if (a) a.textContent = '用时 ' + fmtTime(P.elapsed);
    if (b) b.textContent = fmtTime(P.elapsed);
  }

  function startTicker() {
    if (!P || P.solved) return;
    if (practiceTicker) return;
    practiceTicker = setInterval(() => {
      if (!P || currentRoute.view !== 'practice') return;
      P.elapsed++;
      updateTimerUI();
      if (P.elapsed % 5 === 0) { state.currentPractice = serializePractice(); saveState(); }
    }, 1000);
  }
  function stopTicker() {
    if (practiceTicker) { clearInterval(practiceTicker); practiceTicker = null; }
    if (P && currentRoute.view === 'practice') { state.currentPractice = serializePractice(); saveState(); }
  }

  function practiceRender() {
    $('#view').innerHTML = practiceHTML();
    renderStaticBoards($('#view'));
    bindPractice();
    startTicker();
  }

  function pushHistory() {
    P.history.push(snapshot());
    if (P.history.length > 80) P.history.shift();
    P.future.length = 0;
  }

  function placeDigit(i, d) {
    if (!P || P.given[i]) return;
    pushHistory();
    if (P.grid[i] === d) {
      P.grid[i] = 0;
      P.notes[i] = E.candidates(P.grid)[i];
    } else {
      P.grid[i] = d;
      P.notes[i] = 0;
      E.PEERS[i].forEach((p) => { P.notes[p] &= ~E.bit(d); });
    }
    P.hint = null;
    P.wrong = new Set();
    afterMove();
  }

  function toggleNote(i, d) {
    if (!P || P.given[i] || P.grid[i]) return;
    pushHistory();
    P.notes[i] ^= E.bit(d);
    P.candMode = 'manual';
    P.hint = null;
    afterMove();
  }

  function afterMove() {
    if (isPracticeSolved()) {
      P.solved = true;
      state.practiceSolved++;
      stopTicker();
      toast('完成！用时 ' + fmtTime(P.elapsed) + '，共 ' + Array.from(P.given).filter(Boolean).length + ' 个提示。');
    } else {
      P.solved = false;
    }
    state.currentPractice = serializePractice();
    saveState();
    practiceRender();
  }

  function isPracticeSolved() {
    for (let i = 0; i < 81; i++) if (P.grid[i] !== P.solution[i]) return false;
    return true;
  }

  function bindPractice() {
    $$('#practice-board [data-i]').forEach((cell) => {
      cell.addEventListener('click', () => {
        P.selected = parseInt(cell.getAttribute('data-i'), 10);
        practiceRender();
      });
    });
    $$('[data-digit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.getAttribute('data-digit'), 10);
        if (d === 0) {
          if (P.given[P.selected]) return;
          pushHistory();
          P.grid[P.selected] = 0;
          P.hint = null;
          afterMove();
        } else if (P.mode === 'note') toggleNote(P.selected, d);
        else placeDigit(P.selected, d);
      });
    });
    $$('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        startPractice(btn.getAttribute('data-diff'));
        practiceRender();
      });
    });
    $$('[data-act]').forEach((btn) => {
      const act = btn.getAttribute('data-act');
      btn.addEventListener('click', () => {
        if (act === 'notes') {
          P.mode = P.mode === 'note' ? 'value' : 'note';
          if (P.mode === 'note') P.candMode = 'manual';
          practiceRender();
        } else if (act === 'undo') {
          if (!P.history.length) return;
          P.future.push(snapshot());
          const s = P.history.pop();
          P.grid = s.grid; P.notes = s.notes; P.hint = null;
          afterMove();
        } else if (act === 'redo') {
          if (!P.future.length) return;
          P.history.push(snapshot());
          const s = P.future.pop();
          P.grid = s.grid; P.notes = s.notes; P.hint = null;
          afterMove();
        } else if (act === 'check') {
          checkPractice();
        } else if (act === 'hint') {
          computeHint();
        } else if (act === 'reveal') {
          revealOne();
        } else if (act === 'candmode') {
          P.candMode = P.candMode === 'auto' ? 'manual' : 'auto';
          if (P.candMode === 'manual') P.notes = E.candidates(P.grid);
          practiceRender();
        } else if (act === 'new') {
          startPractice(P.diff);
          practiceRender();
        } else if (act === 'apply-hint') {
          applyHint();
        } else if (act === 'close-hint') {
          P.hint = null;
          practiceRender();
        }
      });
    });
  }

  function checkPractice() {
    const wrong = new Set();
    for (let i = 0; i < 81; i++) {
      if (!P.given[i] && P.grid[i] && P.solution[i] && P.grid[i] !== P.solution[i]) wrong.add(i);
    }
    P.wrong = wrong;
    practiceRender();
    toast(wrong.size ? ('有 ' + wrong.size + ' 个格子填错了，已用红色标出。') : '目前没有填错的格子。');
  }

  function revealOne() {
    for (let i = 0; i < 81; i++) {
      if (!P.grid[i]) {
        pushHistory();
        P.grid[i] = P.solution[i];
        P.notes[i] = 0;
        P.hint = null;
        afterMove();
        toast('已填入 ' + E.cellName(i) + ' = ' + P.solution[i] + '。');
        return;
      }
    }
    toast('盘面已经填满了。');
  }

  function computeHint() {
    try {
      const st = { grid: P.grid, cand: E.candidates(P.grid) };
      const step = E.findStep(st, 99);
      if (!step) {
        P.hint = null;
        practiceRender();
        toast('当前技巧库没找到下一步，可能需要猜测；可以点“显示一格答案”。');
        return;
      }
      P.hint = step;
      practiceRender();
    } catch (err) {
      P.hint = null;
      practiceRender();
      toast('盘面里可能有冲突，先点“检查”或撤销错误填数，再要提示。');
    }
  }

  function applyHint() {
    if (!P.hint || !P.hint.placements || !P.hint.placements.length) return;
    pushHistory();
    P.hint.placements.forEach((pl) => {
      P.grid[pl.cell] = pl.digit;
      P.notes[pl.cell] = 0;
      E.PEERS[pl.cell].forEach((p) => { P.notes[p] &= ~E.bit(pl.digit); });
    });
    P.hint = null;
    afterMove();
  }

  function practiceKeydown(e) {
    if (!P || currentRoute.view !== 'practice') return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      if (P.mode === 'note') toggleNote(P.selected, parseInt(e.key, 10));
      else placeDigit(P.selected, parseInt(e.key, 10));
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      e.preventDefault();
      if (!P.given[P.selected]) {
        pushHistory();
        P.grid[P.selected] = 0;
        P.hint = null;
        afterMove();
      }
    } else if (e.key === 'n' || e.key === 'N') {
      P.mode = P.mode === 'note' ? 'value' : 'note';
      practiceRender();
    } else if (e.key.indexOf('Arrow') === 0) {
      e.preventDefault();
      const r = Math.floor(P.selected / 9), c = P.selected % 9;
      let nr = r, nc = c;
      if (e.key === 'ArrowUp') nr = Math.max(0, r - 1);
      if (e.key === 'ArrowDown') nr = Math.min(8, r + 1);
      if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1);
      if (e.key === 'ArrowRight') nc = Math.min(8, c + 1);
      P.selected = nr * 9 + nc;
      practiceRender();
    }
  }

  /* ---------------------------------------------------------------------
   * 诊断
   * ------------------------------------------------------------------- */
  let DIAG = { queue: [], idx: 0, wrong: [], active: false };

  function diagnoseHTML() {
    let html = '<div class="lesson-head"><div class="lesson-kicker">诊断测试</div><h1>先找根因，再补课</h1><p class="lesson-sub">随机抽 6 题。答错时，系统沿依赖链往回走，指出你更可能缺的那一章。</p></div>';
    html += '<div class="diag-wrap"><div class="diag-controls"><button class="btn primary" id="diag-start">开始诊断（随机 6 题）</button><span class="small muted" id="diag-progress"></span></div>';
    html += '<div class="diag-stage" id="diag-stage"></div><div class="diag-result" id="diag-result"></div></div>';
    return html;
  }

  function startDiagnosis() {
    const pool = QUIZZES.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    DIAG = { queue: pool.slice(0, Math.min(6, pool.length)), idx: 0, wrong: [], active: true };
    showDiag();
  }

  function showDiag() {
    const stage = $('#diag-stage'), result = $('#diag-result');
    if (!stage) return;
    result.innerHTML = '';
    if (DIAG.idx >= DIAG.queue.length) { finishDiag(); return; }
    const q = DIAG.queue[DIAG.idx];
    $('#diag-progress').textContent = '第 ' + (DIAG.idx + 1) + ' / ' + DIAG.queue.length + ' 题';
    stage.innerHTML = quizBlock(q, DIAG.idx + 1);
    const el = $('.quiz', stage);
    const btn = $('.quiz-check', el);
    btn.addEventListener('click', () => {
      const sel = $('input:checked', el);
      const val = sel ? parseInt(sel.value, 10) : null;
      const correct = val === q.answer;
      $$('.quiz-opt', el).forEach((opt) => {
        const input = $('input', opt);
        opt.classList.remove('correct', 'wrong');
        if (parseInt(input.value, 10) === q.answer) opt.classList.add('correct');
        else if (input.checked) opt.classList.add('wrong');
      });
      const fb = $('.quiz-feedback', el);
      fb.className = 'quiz-feedback ' + (correct ? 'ok' : 'bad');
      fb.textContent = correct ? '✓ 正确' : (val === null ? '未作答' : '✗ 错误');
      let ex = $('.quiz-explain', el);
      if (!ex) { ex = document.createElement('div'); ex.className = 'quiz-explain'; el.appendChild(ex); }
      ex.textContent = '解析：' + q.explain;
      if (!correct) {
        DIAG.wrong.push(q);
        const roots = traceRoots(q.lesson === '__all' ? conceptLesson(q.concept) : q.lesson);
        const html = roots.length
          ? '<h3>这道题答错了，可能的根因：</h3>' + roots.map((l) => '<div class="diag-remedy-item">📚 <a href="#/lesson/' + l.id + '">第 ' + l.num + ' 章 · ' + esc(l.title) + '</a></div>').join('')
          : '<p>这道题没有更早的前置章，问题可能就在本章；回看“一句话核心”和第一个示例。</p>';
        result.innerHTML = html + '<p><button class="btn small primary" id="diag-next">下一题 →</button></p>';
      } else {
        result.innerHTML = '<p>✓ 正确。<button class="btn small primary" id="diag-next">下一题 →</button></p>';
      }
      const next = $('#diag-next');
      if (next) next.addEventListener('click', () => { DIAG.idx++; showDiag(); });
    });
  }

  function finishDiag() {
    const total = DIAG.queue.length, wrong = DIAG.wrong.length;
    const right = total - wrong;
    let html = '<div class="diag-score">' + right + ' / ' + total + ' 正确</div>';
    if (!wrong) {
      html += '<p>这组题全对，可以往下一章走。</p>';
    } else {
      const roots = [];
      DIAG.wrong.forEach((q) => { traceRoots(q.lesson === '__all' ? conceptLesson(q.concept) : q.lesson).forEach((l) => { if (roots.indexOf(l) < 0) roots.push(l); }); });
      html += '<p>错题按依赖链回溯，建议先补：</p>';
      if (roots.length) {
        html += roots.map((l) => '<div class="diag-remedy-item">📚 <a href="#/lesson/' + l.id + '">第 ' + l.num + ' 章 · ' + esc(l.title) + '</a></div>').join('');
      } else {
        const direct = [];
        DIAG.wrong.forEach((q) => {
          const lid = q.lesson === '__all' ? conceptLesson(q.concept) : q.lesson;
          const l = LESSON_MAP[lid];
          if (l && direct.indexOf(l) < 0) direct.push(l);
        });
        html += direct.map((l) => '<div class="diag-remedy-item">📚 <a href="#/lesson/' + l.id + '">第 ' + l.num + ' 章 · ' + esc(l.title) + '</a>（没有更早的前置章，问题就在本章）</div>').join('');
      }
      html += '<p class="small muted" style="margin-top:10px">补完那一章，再回来重做诊断。</p>';
    }
    $('#diag-stage').innerHTML = '';
    $('#diag-result').innerHTML = html;
    $('#diag-progress').textContent = '完成';
  }

  /* ---------------------------------------------------------------------
   * 求解器实验室
   * ------------------------------------------------------------------- */
  let LAB = { tab: 'solve', result: null, gen: null };

  function labHTML() {
    let html = '<div class="lesson-head"><div class="lesson-kicker">实验室</div><h1>求解、验证、出题</h1><p class="lesson-sub">把盘面交给程序：数解、评级、看完整技巧日志，或者生成一道新题拿去练。</p></div>';
    html += '<div class="lab-tabs"><button data-lab-tab="solve" class="' + (LAB.tab === 'solve' ? 'active' : '') + '">求解与验证</button><button data-lab-tab="gen" class="' + (LAB.tab === 'gen' ? 'active' : '') + '">出题</button></div>';
    if (LAB.tab === 'solve') {
      html += '<div id="lab-solve-pane"><label class="small muted" for="lab-input">粘贴 81 个字符，0 或 . 表示空格</label>';
      html += '<textarea class="lab-input" id="lab-input" spellcheck="false" placeholder="例如：914000820060000004000049007000001050000530048653080100506924000490300000031000492"></textarea>';
      html += '<div class="lab-actions"><button class="btn primary" data-lab-act="solve">求解并验证</button><button class="btn" data-lab-act="sample">填入示例</button><button class="btn" data-lab-act="clear">清空</button></div>';
      html += '<div class="lab-result" id="lab-result">' + (LAB.result ? labResultHTML(LAB.result) : '') + '</div><div id="lab-player"></div></div>';
    } else {
      html += '<div id="lab-gen-pane"><div class="lab-actions"><label class="small muted" for="lab-diff">目标难度</label><select id="lab-diff" class="filter-input" style="max-width:180px;margin:0">' +
        DIFF_ORDER.map((d) => '<option value="' + d + '">' + DIFF_LABEL[d] + '</option>').join('') + '</select>' +
        '<button class="btn primary" data-lab-act="generate">从题库生成变体</button><button class="btn" data-lab-act="generate-live">现场随机生成</button></div>';
      html += '<div class="small muted">“题库生成”从已分级的题里做数字置换与几何变换，即时出题；“现场随机生成”会重新挖洞，耗时约 1–3 秒。</div>';
      html += '<div class="lab-result" id="lab-gen-result">' + (LAB.gen ? labGenHTML(LAB.gen) : '') + '</div></div>';
    }
    return html;
  }

  function labResultHTML(res) {
    let html = '<div class="lab-stats"><span class="chip">解的数量：' + (res.count >= 2 ? '≥ 2（多解）' : res.count) + '</span><span class="chip">提示数：' + res.clues + '</span><span class="chip">难度：' + esc(res.rate.label) + '</span><span class="chip">技巧步数：' + res.log.steps.length + '</span></div>';
    if (res.count === 0) html += '<div class="lab-warn">这盘题没有解：提示数之间有冲突。</div>';
    if (res.count >= 2) html += '<div class="lab-warn">这盘题有多个解，不能使用唯一矩形等依赖唯一解的技巧。</div>';
    if (res.count === 1) html += '<div class="lab-ok">唯一解。下面给出第一个解与完整技巧日志。</div>';
    if (res.solution) html += '<div class="mini-board-wrap"><div class="mini-board" data-board="' + E.format(res.solution, '0') + '"></div><p class="mini-caption">求解结果（第一个解）。</p></div>';
    if (res.log.steps.length) {
      html += '<div class="lab-log">' + res.log.steps.slice(0, 30).map((s, i) => '<div class="lab-log-item"><span class="n">' + (i + 1) + '</span><span><b>' + esc(s.title) + '</b> · ' + esc(s.text) + '</span></div>').join('') + '</div>';
      if (res.log.steps.length > 30) html += '<p class="small muted">只列出前 30 步。</p>';
      html += '<div class="lab-actions"><button class="btn" data-lab-act="play">逐步演示这盘题</button></div>';
    } else if (!res.log.solved) {
      html += '<div class="lab-warn">技巧库无法完全解出（' + esc(res.log.reason || '未知原因') + '），需要猜测或更高级的链。</div>';
    }
    return html;
  }

  function labRunSolve() {
    const raw = $('#lab-input') ? $('#lab-input').value : '';
    let puzzle;
    try { puzzle = E.parse(raw); } catch (err) { LAB.result = { error: err.message }; $('#lab-result').innerHTML = '<div class="lab-warn">' + esc(err.message) + '</div>'; return; }
    const count = E.countSolutions(puzzle, 2);
    const solution = count ? E.solve(puzzle) : null;
    const rate = count ? E.rate(puzzle) : { label: '无解', level: 99, clues: 0, steps: 0, techniques: {} };
    const log = count ? E.solveLog(puzzle, 99) : { solved: false, steps: [], reason: '无解' };
    let clues = 0; for (let i = 0; i < 81; i++) if (puzzle[i]) clues++;
    LAB.result = { puzzle: puzzle, solution: solution, count: count, rate: rate, log: log, clues: clues };
    $('#lab-result').innerHTML = labResultHTML(LAB.result);
    $('#lab-player').innerHTML = '';
    renderStaticBoards($('#lab-result'));
  }

  function labGenerate(live) {
    const diff = $('#lab-diff') ? $('#lab-diff').value : 'medium';
    let puzzle, solution;
    if (live) {
      const g = E.generate(diff, { attempts: 8 });
      puzzle = g.puzzle; solution = g.solution;
    } else {
      const bank = SEEDS[diff] && SEEDS[diff].length ? SEEDS[diff] : SEEDS.medium;
      const seed = bank[Math.floor(Math.random() * bank.length)];
      puzzle = E.transform(E.parse(seed.puzzle));
      solution = E.solve(puzzle);
    }
    const rate = E.rate(puzzle);
    const log = E.solveLog(puzzle, 99);
    let clues = 0; for (let i = 0; i < 81; i++) if (puzzle[i]) clues++;
    LAB.gen = { puzzle: puzzle, solution: solution, rate: rate, log: log, clues: clues, diff: diff };
    $('#lab-gen-result').innerHTML = labGenHTML(LAB.gen);
    renderStaticBoards($('#lab-gen-result'));
  }

  function labGenHTML(g) {
    let html = '<div class="lab-stats"><span class="chip">目标：' + DIFF_LABEL[g.diff] + '</span><span class="chip">实际评级：' + esc(g.rate.label) + '</span><span class="chip">提示数：' + g.clues + '</span><span class="chip">技巧步数：' + g.log.steps.length + '</span></div>';
    html += '<div class="mini-board-wrap"><div class="mini-board" data-board="' + E.format(g.puzzle, '0') + '"></div><p class="mini-caption">新题。点下面的按钮可以拿去练习场。</p></div>';
    html += '<div class="lab-actions"><button class="btn primary" data-lab-act="use">拿去练习</button><button class="btn" data-lab-act="copy">复制题目</button></div>';
    return html;
  }

  function labPlay() {
    if (!LAB.result || !LAB.result.log || !LAB.result.log.steps.length) return;
    const puzzle = LAB.result.puzzle;
    const log = LAB.result.log;
    const host = $('#lab-player');
    let st = E.initialState(puzzle);
    const frames = log.steps.map((step) => {
      const frame = { grid: E.cloneGrid(st.grid), cand: new Uint16Array(st.cand), step: step };
      E.applyStep(st, step);
      return frame;
    });
    let idx = 0;
    host.innerHTML = '<h3 style="font-family:\'Noto Serif SC\',\'Songti SC\',serif;font-size:20px;margin:24px 0 10px">逐步演示</h3>' +
      '<div class="demo"><div class="demo-layout"><div class="demo-board" id="play-board"></div><div class="demo-side"><div class="demo-step-title" id="play-title"></div><div class="demo-step-text" id="play-text"></div>' +
      '<div class="demo-controls"><button class="btn small" data-p="first">开局</button><button class="btn small" data-p="prev">上一步</button><button class="btn small" data-p="next">下一步</button></div>' +
      '<div class="demo-progress" id="play-progress"></div></div></div></div>';
    function paint() {
      const f = frames[idx];
      $('#play-board').innerHTML = boardHTML({ grid: f.grid, cand: f.cand, given: puzzle, focus: f.step.focus, unit: f.step.unit ? f.step.unit.cells : [], elims: f.step.eliminations, pending: f.step.placements, cls: 'board' });
      $('#play-title').textContent = '第 ' + (idx + 1) + ' 步 · ' + f.step.title;
      $('#play-text').textContent = f.step.text;
      $('#play-progress').textContent = '第 ' + (idx + 1) + ' / ' + frames.length + ' 步';
    }
    $$('[data-p]', host).forEach((btn) => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-p');
      if (act === 'first') idx = 0;
      if (act === 'prev') idx = Math.max(0, idx - 1);
      if (act === 'next') idx = Math.min(frames.length - 1, idx + 1);
      paint();
    }));
    paint();
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------------------------------------------------------------
   * 速查 / 术语 / 卡片
   * ------------------------------------------------------------------- */
  function cheatHTML() {
    let html = '<div class="lesson-head"><div class="lesson-kicker">速查表</div><h1>技巧清单</h1><p class="lesson-sub">按“识别特征 → 动作”记。做题卡住时，从上往下扫一遍。</p></div>';
    html += '<div class="table-wrap"><table class="tech-table"><thead><tr><th>技巧</th><th>识别特征</th><th>动作</th><th>难度</th></tr></thead><tbody>';
    TECH.forEach((t) => {
      html += '<tr><td><a href="#/lesson/' + t.lesson + '">' + esc(t.name) + '</a><br><span class="small muted">' + esc(t.en) + '</span></td><td>' + esc(t.detect) + '</td><td>' + esc(t.action) + '</td><td>' + esc(t.tier) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="section-head"><h2>坐标与单元</h2></div>';
    html += '<div class="card small" style="line-height:2">R4C5 = 第 4 行第 5 列；宫 B1–B9 从左到右、从上到下；三个宫横排叫带（band），竖排叫栈（stack）。</div>';
    html += '<div class="section-head"><h2>解题顺序</h2></div>';
    html += '<div class="card small" style="line-height:2">更新候选 → 唯一余数 → 隐性唯一（宫→行→列）→ 区块（指向→声明）→ 显性数组 → 隐性数组 → X-Wing → Swordfish → XY-Wing → 唯一矩形 → 染色 → AIC。</div>';
    html += '<div class="section-head"><h2>参考</h2><span class="small">外部资料</span></div>';
    html += '<div class="card small" style="line-height:1.9">' + REFS.map((r) => '<div><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.label) + '</a></div>').join('') + '</div>';
    return html;
  }

  function glossaryHTML() {
    let html = '<div class="lesson-head"><div class="lesson-kicker">术语表</div><h1>把词说清</h1><p class="lesson-sub">术语第一次出现时都解释过；这里做集中索引。</p></div>';
    html += '<input class="filter-input" id="gloss-filter" type="search" placeholder="筛术语…" aria-label="筛术语">';
    html += '<ul class="glossary-list" id="gloss-list">';
    GLOSSARY.forEach((g) => {
      html += '<li class="glossary-item" data-term="' + esc(g.term) + '"><b>' + esc(g.term) + '</b><span>' + esc(g.def) + '</span><a class="ref" href="#/lesson/' + g.lesson + '">出处</a></li>';
    });
    html += '</ul>';
    return html;
  }

  function cardsHTML() {
    const filter = state.cardFilter || '';
    const deck = CARDS.filter((c) => !filter || c.lesson === filter);
    const idx = Math.min(state.cardIdx || 0, Math.max(0, deck.length - 1));
    const card = deck[idx];
    const known = Object.keys(state.cards).filter((k) => state.cards[k] === 'known').length;
    const again = Object.keys(state.cards).filter((k) => state.cards[k] === 'again').length;
    let html = '<div class="lesson-head"><div class="lesson-kicker">抽认卡</div><h1>主动回忆</h1><p class="lesson-sub">先自己想，再翻面。答不上来的卡片会被记下来。</p></div>';
    html += '<div class="card-toolbar"><label class="small muted">按章节筛：<select id="card-filter" class="filter-input" style="max-width:220px;margin:0"><option value="">全部</option>' +
      LESSONS.map((l) => '<option value="' + l.id + '"' + (filter === l.id ? ' selected' : '') + '>第 ' + l.num + ' 章 · ' + esc(l.title) + '</option>').join('') + '</select></label>';
    html += '<span class="card-counts">认识 <b>' + known + '</b> · 不熟 <b>' + again + '</b> · 本组 ' + (idx + 1) + '/' + deck.length + '</span></div>';
    if (!card) {
      html += '<p>这个筛选下没有卡片。</p>';
    } else {
      html += '<div class="card-stage"><div class="flashcard" id="flashcard"><div class="fc-inner">' +
        '<div class="fc-face fc-front"><div class="fc-label">正面 · 先自己想</div>' + esc(card.front) + '</div>' +
        '<div class="fc-face fc-back"><div class="fc-label">背面 · 答案</div>' + esc(card.back) + '</div></div></div></div>';
      html += '<div class="card-actions"><button class="btn" id="card-flip">翻面</button><button class="btn" id="card-prev">上一张</button><button class="btn" id="card-again">不熟</button><button class="btn primary" id="card-known">认识</button><button class="btn ghost" id="card-next">下一张</button></div>';
      html += '<p class="small muted center" style="margin-top:10px">出处：<a href="#/lesson/' + card.lesson + '">' + esc((LESSON_MAP[card.lesson] || {}).title || '') + '</a></p>';
    }
    return html;
  }

  /* ---------------------------------------------------------------------
   * 渲染与绑定
   * ------------------------------------------------------------------- */
  function render() {
    const route = parseRoute();
    const key = JSON.stringify(route);
    stopTicker();
    currentRoute = route;
    const sidebar = $('#sidebar');
    if (sidebar) {
      sidebar.innerHTML = sidebarHTML(route);
      sidebar.classList.remove('open');
    }
    const scrim = $('#scrim');
    if (scrim) scrim.classList.remove('show');
    const top = $('#topbar');
    if (top) top.innerHTML = topbarHTML(route);
    applyTheme();

    const view = $('#view');
    let html = '';
    if (route.view === 'home') html = homeHTML();
    else if (route.view === 'path') html = pathHTML();
    else if (route.view === 'lesson') html = lessonHTML(route.id);
    else if (route.view === 'practice') html = practiceHTML();
    else if (route.view === 'diagnose') html = diagnoseHTML();
    else if (route.view === 'lab') html = labHTML();
    else if (route.view === 'cheat') html = cheatHTML();
    else if (route.view === 'glossary') html = glossaryHTML();
    else if (route.view === 'cards') html = cardsHTML();
    else html = homeHTML();
    view.innerHTML = html;

    // 课程页需要先渲染静态盘面，再挂演示
    renderStaticBoards(view);
    renderSchematics(view);
    mountAllDemos(view);
    bindQuizzes(view);
    if (route.view === 'lesson') {
      const l = LESSON_MAP[route.id];
      if (l && state.visited.indexOf(l.id) < 0) {
        state.visited.push(l.id);
        saveState();
        if (sidebar) sidebar.innerHTML = sidebarHTML(route);
      }
    }
    bindCommon();
    if (route.view === 'practice') {
      ensurePractice();
      bindPractice();
      startTicker();
    }
    if (route.view === 'diagnose') bindDiagnosis();
    if (route.view === 'lab') bindLab();
    if (route.view === 'glossary') bindGlossary();
    if (route.view === 'cards') bindCards();
    if (key !== lastRouteKey) {
      window.scrollTo(0, 0);
      lastRouteKey = key;
    }
  }

  function bindCommon() {
    const menu = $('#menu-btn'), scrim = $('#scrim');
    if (menu) menu.addEventListener('click', () => { $('#sidebar').classList.add('open'); scrim.classList.add('show'); });
    if (scrim) scrim.addEventListener('click', () => { $('#sidebar').classList.remove('open'); scrim.classList.remove('show'); });
    const theme = $('#theme-btn');
    if (theme) theme.addEventListener('click', () => {
      state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
      saveState();
      applyTheme();
    });
    const search = $('#nav-search');
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        $$('.nav .nav-item').forEach((a) => {
          const t = a.textContent.toLowerCase();
          a.style.display = !q || t.indexOf(q) >= 0 ? '' : 'none';
        });
      });
    }
  }

  function bindDiagnosis() {
    const btn = $('#diag-start');
    if (btn && !btn.dataset.bound) { btn.dataset.bound = '1'; btn.addEventListener('click', startDiagnosis); }
  }

  function bindGlossary() {
    const input = $('#gloss-filter');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim();
      $$('.glossary-item').forEach((li) => {
        li.style.display = !q || li.textContent.indexOf(q) >= 0 ? '' : 'none';
      });
    });
  }

  function bindCards() {
    const flip = $('#flashcard');
    if (flip) flip.addEventListener('click', () => flip.classList.toggle('flipped'));
    const fbtn = $('#card-flip');
    if (fbtn) fbtn.addEventListener('click', () => flip.classList.toggle('flipped'));
    function deck() { return CARDS.filter((c) => !state.cardFilter || c.lesson === state.cardFilter); }
    function move(delta) {
      const d = deck();
      state.cardIdx = (Math.min(state.cardIdx || 0, d.length - 1) + delta + d.length) % d.length;
      saveState();
      render();
    }
    const prev = $('#card-prev'), next = $('#card-next');
    if (prev) prev.addEventListener('click', () => move(-1));
    if (next) next.addEventListener('click', () => move(1));
    const known = $('#card-known'), again = $('#card-again');
    const d = deck();
    const card = d[Math.min(state.cardIdx || 0, d.length - 1)];
    if (known) known.addEventListener('click', () => { if (card) state.cards[card.id || card.front] = 'known'; saveState(); move(1); });
    if (again) again.addEventListener('click', () => { if (card) state.cards[card.id || card.front] = 'again'; saveState(); move(1); });
    const filter = $('#card-filter');
    if (filter) filter.addEventListener('change', () => { state.cardFilter = filter.value; state.cardIdx = 0; saveState(); render(); });
  }

  function labAction(act) {
    if (act === 'solve') labRunSolve();
    else if (act === 'sample') { $('#lab-input').value = '914000820060000004000049007000001050000530048653080100506924000490300000031000492'; }
    else if (act === 'clear') { $('#lab-input').value = ''; }
    else if (act === 'generate') labGenerate(false);
    else if (act === 'generate-live') labGenerate(true);
    else if (act === 'play') labPlay();
    else if (act === 'use') {
      if (LAB.gen) {
        pendingPractice = { puzzle: E.format(LAB.gen.puzzle, '0'), solution: E.format(LAB.gen.solution, '0'), diff: LAB.gen.diff };
        navigate('#/practice');
      }
    } else if (act === 'copy') {
      if (LAB.gen) copyText(E.format(LAB.gen.puzzle, '0'));
    }
  }

  function bindLab() {
    $$('[data-lab-tab]').forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => { LAB.tab = btn.getAttribute('data-lab-tab'); render(); });
    });
    const view = $('#view');
    if (view && !view.dataset.labDelegated) {
      view.dataset.labDelegated = '1';
      view.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-lab-act]');
        if (btn) labAction(btn.getAttribute('data-lab-act'));
      });
    }
    const input = $('#lab-input');
    if (input) input.value = LAB.result && LAB.result.puzzle ? E.format(LAB.result.puzzle, '0') : (LAB.raw || '');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板。'), () => toast('复制失败，请手动选中。'));
    } else toast('当前浏览器不支持自动复制。');
  }

  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------------------------------------------------------------
   * 启动
   * ------------------------------------------------------------------- */
  function boot() {
    document.getElementById('sidebar').innerHTML = sidebarHTML(currentRoute);
    document.getElementById('topbar').innerHTML = topbarHTML(currentRoute);
    render();
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', practiceKeydown);
    window.addEventListener('beforeunload', () => {
      if (P) { state.currentPractice = serializePractice(); }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) {}
    });
    // 首次进入时恢复练习进度
    if (state.currentPractice && state.currentPractice.puzzle) restorePractice();
  }

  boot();
})();
