/* =========================================================================
 * 数独引擎 · SudokuEngine
 * -------------------------------------------------------------------------
 * 供「知枢 · 数独」使用。所有技巧检测器都只在候选数集合上做逻辑推理：
 *   1. 唯一余数 / 隐性唯一
 *   2. 区块排除（指向 / 声明）
 *   3. 显性数组 / 隐性数组（数对、三数组、四数组）
 *   4. X-Wing / Swordfish / Jellyfish
 *   5. XY-Wing / XYZ-Wing
 *   6. 唯一矩形（依赖唯一解假设）
 *   7. 单数染色 / 交替推理链 AIC
 * 求解器用位运算 + MRV 回溯，唯一解校验最多数到 2 个解就停。
 *
 * 该文件同时支持浏览器（window.SudokuEngine）与 Node（module.exports）。
 * ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SudokuEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ALL = 0x3FE;                    // 二进制 1111111110，位 1..9
  const POP = new Uint8Array(1024);
  for (let i = 1; i < 1024; i++) POP[i] = POP[i >> 1] + (i & 1);

  const bit = (d) => 1 << d;
  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function bitsOf(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
    return out;
  }
  function lowestDigit(mask) {
    for (let d = 1; d <= 9; d++) if (mask & bit(d)) return d;
    return 0;
  }

  const ROWS = [], COLS = [], BOXES = [], UNITS = [], UNIT_OF = [];
  for (let r = 0; r < 9; r++) {
    const cells = [];
    for (let c = 0; c < 9; c++) cells.push(r * 9 + c);
    ROWS.push(cells);
  }
  for (let c = 0; c < 9; c++) {
    const cells = [];
    for (let r = 0; r < 9; r++) cells.push(r * 9 + c);
    COLS.push(cells);
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells = [];
      for (let r = br * 3; r < br * 3 + 3; r++)
        for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push(r * 9 + c);
      BOXES.push(cells);
    }
  }
  // 教学顺序：先宫，再行、列。隐性唯一按这个顺序找更符合人的扫描习惯。
  BOXES.forEach((cells, i) => UNITS.push({ type: 'box', index: i, cells }));
  ROWS.forEach((cells, i) => UNITS.push({ type: 'row', index: i, cells }));
  COLS.forEach((cells, i) => UNITS.push({ type: 'col', index: i, cells }));

  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const set = new Set();
    ROWS[r].forEach((x) => x !== i && set.add(x));
    COLS[c].forEach((x) => x !== i && set.add(x));
    BOXES[b].forEach((x) => x !== i && set.add(x));
    PEERS.push(Array.from(set));
  }
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    UNIT_OF[i] = {
      row: r, col: c,
      box: Math.floor(r / 3) * 3 + Math.floor(c / 3),
    };
  }

  function cellName(i) { return 'R' + (Math.floor(i / 9) + 1) + 'C' + (i % 9 + 1); }
  function unitName(u) {
    if (!u) return '';
    if (u.type === 'row') return '第 ' + (u.index + 1) + ' 行';
    if (u.type === 'col') return '第 ' + (u.index + 1) + ' 列';
    return '第 ' + (u.index + 1) + ' 宫';
  }
  function unitTypeName(t) {
    return t === 'row' ? '行' : t === 'col' ? '列' : '宫';
  }

  function parse(text) {
    const cleaned = String(text || '').replace(/[^0-9.]/g, '');
    if (cleaned.length !== 81) throw new Error('需要 81 个字符（0 或 . 表示空格），当前 ' + cleaned.length);
    const g = new Uint8Array(81);
    for (let i = 0; i < 81; i++) g[i] = cleaned[i] === '.' ? 0 : (Number(cleaned[i]) || 0);
    return g;
  }
  function format(grid, empty) {
    empty = empty === undefined ? '.' : empty;
    let s = '';
    for (let i = 0; i < 81; i++) s += grid[i] ? String(grid[i]) : empty;
    return s;
  }
  function cloneGrid(grid) { return new Uint8Array(grid); }

  function candidates(grid) {
    const rowMask = new Uint16Array(9), colMask = new Uint16Array(9), boxMask = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = grid[i];
      if (!v) continue;
      const r = Math.floor(i / 9), c = i % 9, b = UNIT_OF[i].box;
      rowMask[r] |= bit(v); colMask[c] |= bit(v); boxMask[b] |= bit(v);
    }
    const cand = new Uint16Array(81);
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const r = Math.floor(i / 9), c = i % 9, b = UNIT_OF[i].box;
      cand[i] = ALL & ~(rowMask[r] | colMask[c] | boxMask[b]);
    }
    return cand;
  }

  function initialState(grid) {
    const g = cloneGrid(grid);
    return { grid: g, cand: candidates(g) };
  }

  function isSolved(grid) {
    for (let i = 0; i < 81; i++) if (!grid[i]) return false;
    return isValid(grid);
  }

  function isValid(grid) {
    for (const unit of UNITS) {
      const seen = new Uint16Array(10);
      for (const c of unit.cells) {
        const v = grid[c];
        if (!v) continue;
        if (seen[v]) return false;
        seen[v] = 1;
      }
    }
    return true;
  }

  function applyStep(state, step) {
    let contradiction = false;
    if (step.placements) {
      for (const p of step.placements) {
        const d = p.digit;
        state.grid[p.cell] = d;
        state.cand[p.cell] = 0;
        for (const q of PEERS[p.cell]) state.cand[q] &= ~bit(d);
      }
    }
    if (step.eliminations) {
      for (const e of step.eliminations) {
        state.cand[e.cell] &= ~bit(e.digit);
        if (state.grid[e.cell] === 0 && state.cand[e.cell] === 0) contradiction = true;
      }
    }
    return contradiction;
  }

  function makeStep(tech, level, data) {
    return Object.assign({
      tech, level,
      placements: [], eliminations: [],
      focus: [], digits: [], unit: null,
    }, data);
  }

  /* -----------------------------------------------------------------------
   * 技巧 1：唯一余数
   * --------------------------------------------------------------------- */
  function nakedSingle(state) {
    for (let i = 0; i < 81; i++) {
      if (state.grid[i]) continue;
      if (POP[state.cand[i]] === 1) {
        const d = lowestDigit(state.cand[i]);
        return makeStep('naked-single', 1, {
          placements: [{ cell: i, digit: d }],
          focus: [i], digits: [d],
          title: '唯一余数',
          text: cellName(i) + ' 的候选只剩 ' + d + '。同行、同列、同宫已经把另外 8 个数字全排掉了，这里只能填 ' + d + '。',
        });
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 2：隐性唯一
   * --------------------------------------------------------------------- */
  function hiddenSingle(state, minLevel) {
    for (const unit of UNITS) {
      for (const d of DIGITS) {
        // 单元里已经有 d 就跳过
        let has = false;
        for (const c of unit.cells) if (state.grid[c] === d) { has = true; break; }
        if (has) continue;
        const pos = [];
        for (const c of unit.cells) {
          if (!state.grid[c] && (state.cand[c] & bit(d))) pos.push(c);
        }
        if (pos.length === 1) {
          const cell = pos[0];
          // 只有该格还保留别的候选时，才值得叫“隐性”而不是“唯一余数”
          if (POP[state.cand[cell]] === 1) continue;
          return makeStep('hidden-single', 2, {
            placements: [{ cell, digit: d }],
            focus: [cell], unit, digits: [d],
            title: '隐性唯一',
            text: '在' + unitName(unit) + '里，数字 ' + d + ' 只有一个格子还能放：' + cellName(cell) + '。别的格子要么已填，要么候选里没有 ' + d + '。',
          });
        }
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 3：区块排除
   * --------------------------------------------------------------------- */
  function lockedCandidates(state) {
    // 指向：宫里某数字的候选只落在同一行（或列）
    for (let b = 0; b < 9; b++) {
      const box = BOXES[b];
      for (const d of DIGITS) {
        const pos = [];
        for (const c of box) if (!state.grid[c] && (state.cand[c] & bit(d))) pos.push(c);
        if (pos.length < 2) continue;
        const rows = new Set(pos.map((c) => UNIT_OF[c].row));
        const cols = new Set(pos.map((c) => UNIT_OF[c].col));
        let elims = null, unit = null, lockName = '';
        if (rows.size === 1) {
          const r = pos[0] / 9 | 0;
          unit = { type: 'row', index: r, cells: ROWS[r] };
          lockName = '第 ' + (r + 1) + ' 行';
          elims = [];
          for (const c of ROWS[r]) {
            if (BOXES[b].includes(c)) continue;
            if (!state.grid[c] && (state.cand[c] & bit(d))) elims.push({ cell: c, digit: d });
          }
        } else if (cols.size === 1) {
          const c0 = pos[0] % 9;
          unit = { type: 'col', index: c0, cells: COLS[c0] };
          lockName = '第 ' + (c0 + 1) + ' 列';
          elims = [];
          for (const c of COLS[c0]) {
            if (BOXES[b].includes(c)) continue;
            if (!state.grid[c] && (state.cand[c] & bit(d))) elims.push({ cell: c, digit: d });
          }
        }
        if (elims && elims.length) {
          return makeStep('locked-pointing', 3, {
            eliminations: elims,
            focus: pos.slice(), unit, digits: [d],
            title: '区块排除（指向）',
            text: '第 ' + (b + 1) + ' 宫里，数字 ' + d + ' 的候选只落在' + lockName + '上。宫内的 ' + d + ' 一定在这几个格子里，所以' + lockName + '在宫外的其他格子不可能再放 ' + d + '。',
          });
        }
      }
    }
    // 声明：行/列里某数字的候选只落在同一个宫里
    const lines = ROWS.map((cells, i) => ({ type: 'row', index: i, cells }))
      .concat(COLS.map((cells, i) => ({ type: 'col', index: i, cells })));
    for (const lineObj of lines) {
      const line = lineObj.cells;
      const type = lineObj.type;
      for (const d of DIGITS) {
        let has = false;
        for (const c of line) if (state.grid[c] === d) { has = true; break; }
        if (has) continue;
        const pos = [];
        for (const c of line) if (!state.grid[c] && (state.cand[c] & bit(d))) pos.push(c);
        if (pos.length < 2) continue;
        const boxes = new Set(pos.map((c) => UNIT_OF[c].box));
        if (boxes.size !== 1) continue;
        const b = UNIT_OF[pos[0]].box;
        const elims = [];
        for (const c of BOXES[b]) {
          if (line.includes(c)) continue;
          if (!state.grid[c] && (state.cand[c] & bit(d))) elims.push({ cell: c, digit: d });
        }
        if (elims.length) {
          return makeStep('locked-claiming', 3, {
            eliminations: elims,
            focus: pos.slice(), unit: { type: type, index: type === 'row' ? UNIT_OF[pos[0]].row : UNIT_OF[pos[0]].col, cells: line },
            digits: [d],
            title: '区块排除（声明）',
            text: '在' + unitName({ type, index: type === 'row' ? UNIT_OF[pos[0]].row : UNIT_OF[pos[0]].col }) + '里，数字 ' + d + ' 的候选全部落在第 ' + (b + 1) + ' 宫里。这一行（列）的 ' + d + ' 必须在这个宫内，所以该宫其他格子可以删掉 ' + d + '。',
          });
        }
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 组合工具
   * --------------------------------------------------------------------- */
  function combinations(arr, k, cb) {
    const n = arr.length;
    if (k > n) return;
    const pick = [];
    (function rec(start, depth) {
      if (depth === k) { cb(pick.slice()); return; }
      for (let i = start; i <= n - (k - depth); i++) {
        pick.push(arr[i]);
        rec(i + 1, depth + 1);
        pick.pop();
      }
    })(0, 0);
  }

  /* -----------------------------------------------------------------------
   * 技巧 4：显性数组（数对 / 三数组 / 四数组）
   * --------------------------------------------------------------------- */
  function nakedSubsets(state) {
    for (const unit of UNITS) {
      const empty = unit.cells.filter((c) => !state.grid[c]);
      for (let n = 2; n <= 4; n++) {
        let found = null;
        combinations(empty, n, (combo) => {
          if (found) return;
          let union = 0;
          for (const c of combo) {
            const pc = POP[state.cand[c]];
            if (pc < 2 || pc > n) return;
            union |= state.cand[c];
          }
          if (POP[union] !== n) return;
          const elims = [];
          for (const c of unit.cells) {
            if (combo.indexOf(c) >= 0 || state.grid[c]) continue;
            const hit = state.cand[c] & union;
            for (const d of bitsOf(hit)) elims.push({ cell: c, digit: d });
          }
          if (!elims.length) return;
          found = makeStep('naked-subset', 4, {
            eliminations: elims, focus: combo.slice(),
            unit, digits: bitsOf(union),
            title: '显性' + (n === 2 ? '数对' : n === 3 ? '三数组' : '四数组'),
            text: combo.map(cellName).join('、') + ' 这 ' + n + ' 个格子的候选合起来只有 {' + bitsOf(union).join(', ') + '}。它们必须把这 ' + n + ' 个数字占完，所以' + unitName(unit) + '里其他格子不能再出现这些数字。',
          });
        });
        if (found) return found;
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 5：隐性数组（隐性数对 / 三数组）
   * --------------------------------------------------------------------- */
  function hiddenSubsets(state) {
    for (const unit of UNITS) {
      const empty = unit.cells.filter((c) => !state.grid[c]);
      for (let n = 2; n <= 3; n++) {
        let found = null;
        combinations(DIGITS, n, (digits) => {
          if (found) return;
          const posAll = [];
          const posByDigit = [];
          for (const d of digits) {
            const pos = empty.filter((c) => state.cand[c] & bit(d));
            if (pos.length < 2 || pos.length > n) return;
            posByDigit.push(pos);
            for (const c of pos) if (posAll.indexOf(c) < 0) posAll.push(c);
          }
          if (posAll.length !== n) return;
          const digitMask = digits.reduce((m, d) => m | bit(d), 0);
          const elims = [];
          for (const c of posAll) {
            const extra = state.cand[c] & ~digitMask;
            for (const d of bitsOf(extra)) elims.push({ cell: c, digit: d });
          }
          if (!elims.length) return;
          found = makeStep('hidden-subset', 5, {
            eliminations: elims, focus: posAll.slice(),
            unit, digits: digits.slice(),
            title: '隐性' + (n === 2 ? '数对' : '三数组'),
            text: '在' + unitName(unit) + '里，数字 ' + digits.join('、') + ' 只可能出现在 ' + posAll.map(cellName).join('、') + ' 这 ' + n + ' 个格子里。这 ' + n + ' 个格子被它们占满，其他候选都得删掉。',
          });
        });
        if (found) return found;
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 6：X-Wing
   * --------------------------------------------------------------------- */
  function xWing(state) {
    for (const d of DIGITS) {
      // 行版
      const rowPos = [];
      for (let r = 0; r < 9; r++) {
        const pos = ROWS[r].filter((c) => !state.grid[c] && (state.cand[c] & bit(d)));
        rowPos.push(pos);
      }
      for (let r1 = 0; r1 < 9; r1++) {
        if (rowPos[r1].length !== 2) continue;
        for (let r2 = r1 + 1; r2 < 9; r2++) {
          if (rowPos[r2].length !== 2) continue;
          const c1a = rowPos[r1][0] % 9, c1b = rowPos[r1][1] % 9;
          const c2a = rowPos[r2][0] % 9, c2b = rowPos[r2][1] % 9;
          if (c1a !== c2a || c1b !== c2b) continue;
          const cols = [c1a, c1b];
          const elims = [];
          for (const c of cols) {
            for (let r = 0; r < 9; r++) {
              if (r === r1 || r === r2) continue;
              const cell = r * 9 + c;
              if (!state.grid[cell] && (state.cand[cell] & bit(d))) elims.push({ cell, digit: d });
            }
          }
          if (elims.length) {
            return makeStep('x-wing', 6, {
              eliminations: elims,
              focus: [r1 * 9 + c1a, r1 * 9 + c1b, r2 * 9 + c2a, r2 * 9 + c2b],
              unit: { type: 'row', index: r1, cells: ROWS[r1] },
              digits: [d],
              title: 'X-Wing（交叉排除）',
              text: '数字 ' + d + ' 在第 ' + (r1 + 1) + ' 行和第 ' + (r2 + 1) + ' 行都只剩第 ' + (cols[0] + 1) + '、' + (cols[1] + 1) + ' 列两个位置。两行各放一个 ' + d + '，正好占掉这两列，所以这两列在其他行不能再有 ' + d + '。',
            });
          }
        }
      }
      // 列版
      const colPos = [];
      for (let c = 0; c < 9; c++) {
        const pos = COLS[c].filter((cell) => !state.grid[cell] && (state.cand[cell] & bit(d)));
        colPos.push(pos);
      }
      for (let c1 = 0; c1 < 9; c1++) {
        if (colPos[c1].length !== 2) continue;
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          if (colPos[c2].length !== 2) continue;
          const r1a = Math.floor(colPos[c1][0] / 9), r1b = Math.floor(colPos[c1][1] / 9);
          const r2a = Math.floor(colPos[c2][0] / 9), r2b = Math.floor(colPos[c2][1] / 9);
          if (r1a !== r2a || r1b !== r2b) continue;
          const rows = [r1a, r1b];
          const elims = [];
          for (const r of rows) {
            for (let c = 0; c < 9; c++) {
              if (c === c1 || c === c2) continue;
              const cell = r * 9 + c;
              if (!state.grid[cell] && (state.cand[cell] & bit(d))) elims.push({ cell, digit: d });
            }
          }
          if (elims.length) {
            return makeStep('x-wing', 6, {
              eliminations: elims,
              focus: [r1a * 9 + c1, r1b * 9 + c1, r2a * 9 + c2, r2b * 9 + c2],
              unit: { type: 'col', index: c1, cells: COLS[c1] },
              digits: [d],
              title: 'X-Wing（交叉排除）',
              text: '数字 ' + d + ' 在第 ' + (c1 + 1) + ' 列和第 ' + (c2 + 1) + ' 列都只剩第 ' + (rows[0] + 1) + '、' + (rows[1] + 1) + ' 行两个位置。两列各放一个 ' + d + '，正好占掉这两行，所以这两行在其他列不能再有 ' + d + '。',
            });
          }
        }
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 7：Swordfish / Jellyfish
   * --------------------------------------------------------------------- */
  function fish(state, size, tech, title) {
    for (const d of DIGITS) {
      for (const orient of ['row', 'col']) {
        const lines = orient === 'row' ? ROWS : COLS;
        const crossOf = (cell) => (orient === 'row' ? cell % 9 : Math.floor(cell / 9));
        const lineOf = (cell) => (orient === 'row' ? Math.floor(cell / 9) : cell % 9);
        const posByLine = lines.map((line) => line.filter((c) => !state.grid[c] && (state.cand[c] & bit(d))));
        const candidates = [];
        for (let i = 0; i < 9; i++) if (posByLine[i].length >= 2 && posByLine[i].length <= size) candidates.push(i);
        let found = null;
        combinations(candidates, size, (combo) => {
          if (found) return;
          const crossSet = new Set();
          for (const li of combo) for (const c of posByLine[li]) crossSet.add(crossOf(c));
          if (crossSet.size !== size) return;
          const elims = [];
          for (const cross of crossSet) {
            for (let li = 0; li < 9; li++) {
              if (combo.indexOf(li) >= 0) continue;
              const cell = orient === 'row' ? li * 9 + cross : cross * 9 + li;
              if (!state.grid[cell] && (state.cand[cell] & bit(d))) elims.push({ cell, digit: d });
            }
          }
          if (!elims.length) return;
          const focus = [];
          for (const li of combo) for (const c of posByLine[li]) focus.push(c);
          found = makeStep(tech, size === 3 ? 7 : 8, {
            eliminations: elims, focus,
            unit: { type: orient, index: combo[0], cells: lines[combo[0]] },
            digits: [d],
            title,
            text: '数字 ' + d + ' 在' + (orient === 'row' ? '行' : '列') + ' ' + combo.map((x) => x + 1).join('、') + ' 里的候选全部落在' + (orient === 'row' ? '列' : '行') + ' ' + Array.from(crossSet).map((x) => x + 1).join('、') + ' 上。这 ' + size + ' 个' + (orient === 'row' ? '行' : '列') + '必须各放一个 ' + d + '，正好占满这 ' + size + ' 个' + (orient === 'row' ? '列' : '行') + '，其他' + (orient === 'row' ? '行' : '列') + '可以删掉 ' + d + '。',
          });
        });
        if (found) return found;
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 8：XY-Wing / XYZ-Wing
   * --------------------------------------------------------------------- */
  function sees(a, b) {
    return Math.floor(a / 9) === Math.floor(b / 9) || (a % 9) === (b % 9) ||
      UNIT_OF[a].box === UNIT_OF[b].box;
  }
  function commonPeers(a, b) {
    const out = [];
    for (let i = 0; i < 81; i++) {
      if (i === a || i === b) continue;
      if (sees(i, a) && sees(i, b)) out.push(i);
    }
    return out;
  }

  function xyWing(state) {
    const bivalue = [];
    for (let i = 0; i < 81; i++) if (!state.grid[i] && POP[state.cand[i]] === 2) bivalue.push(i);
    for (const pivot of bivalue) {
      const pb = bitsOf(state.cand[pivot]);
      const a = pb[0], b = pb[1];
      for (const q1 of bivalue) {
        if (q1 === pivot || !sees(pivot, q1)) continue;
        const q1b = bitsOf(state.cand[q1]);
        if (q1b.indexOf(a) < 0) continue;
        const z = q1b[0] === a ? q1b[1] : q1b[0];
        if (z === b) continue;
        for (const q2 of bivalue) {
          if (q2 === pivot || q2 === q1 || !sees(pivot, q2)) continue;
          const q2b = bitsOf(state.cand[q2]);
          if (q2b[0] !== b && q2b[1] !== b) continue;
          if (q2b[0] !== z && q2b[1] !== z) continue;
          const elims = [];
          for (const c of commonPeers(q1, q2)) {
            if (c === pivot) continue;
            if (!state.grid[c] && (state.cand[c] & bit(z))) elims.push({ cell: c, digit: z });
          }
          if (elims.length) {
            return makeStep('xy-wing', 8, {
              eliminations: elims, focus: [pivot, q1, q2], digits: [a, b, z],
              title: 'XY-Wing',
              text: cellName(pivot) + ' 是枢纽，候选 {' + a + ',' + b + '}；' + cellName(q1) + ' 是 {' + a + ',' + z + '}，' + cellName(q2) + ' 是 {' + b + ',' + z + '}，两翼都看得见枢纽。枢纽取 ' + a + ' 时 ' + cellName(q2) + ' 必取 ' + z + '，枢纽取 ' + b + ' 时 ' + cellName(q1) + ' 必取 ' + z + '。两种情况都有人取 ' + z + '，所以同时看见两翼的格子不能取 ' + z + '。',
            });
          }
        }
      }
    }
    return null;
  }

  function xyzWing(state) {
    const tri = [];
    for (let i = 0; i < 81; i++) if (!state.grid[i] && POP[state.cand[i]] === 3) tri.push(i);
    for (const pivot of tri) {
      const pd = bitsOf(state.cand[pivot]);
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          if (x === y) continue;
          const zIdx = 3 - x - y;
          const X = pd[x], Y = pd[y], Z = pd[zIdx];
          const pincersX = [], pincersY = [];
          for (let i = 0; i < 81; i++) {
            if (i === pivot || state.grid[i] || POP[state.cand[i]] !== 2) continue;
            if (!sees(pivot, i)) continue;
            const m = state.cand[i];
            if ((m & bit(X)) && (m & bit(Z))) pincersX.push(i);
            if ((m & bit(Y)) && (m & bit(Z))) pincersY.push(i);
          }
          for (const q1 of pincersX) {
            for (const q2 of pincersY) {
              if (q1 === q2) continue;
              const elims = [];
              for (const c of commonPeers(q1, q2)) {
                if (c === pivot || c === q1 || c === q2) continue;
                if (sees(c, pivot) && !state.grid[c] && (state.cand[c] & bit(Z))) elims.push({ cell: c, digit: Z });
              }
              if (elims.length) {
                return makeStep('xyz-wing', 8, {
                  eliminations: elims, focus: [pivot, q1, q2], digits: [X, Y, Z],
                  title: 'XYZ-Wing',
                  text: cellName(pivot) + ' 有候选 {' + pd.join(',') + '}，两翼 ' + cellName(q1) + '、' + cellName(q2) + ' 分别与它共享 ' + X + '、' + Y + '，并且都含 ' + Z + '。三格中必有一格取 ' + Z + '，所以同时看见三格的格子不能取 ' + Z + '。',
                });
              }
            }
          }
        }
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 9：唯一矩形（依赖“题目有唯一解”的前提）
   * --------------------------------------------------------------------- */
  function uniqueRectangle(state) {
    for (let r1 = 0; r1 < 9; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 9; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            if (cells.some((c) => state.grid[c])) continue;
            const boxes = new Set(cells.map((c) => UNIT_OF[c].box));
            if (boxes.size !== 2) continue;
            const two = cells.filter((c) => POP[state.cand[c]] === 2);
            if (two.length !== 3) continue;
            const mask = state.cand[two[0]];
            if (two.some((c) => state.cand[c] !== mask)) continue;
            const extraCell = cells.find((c) => two.indexOf(c) < 0);
            if ((state.cand[extraCell] & mask) !== mask) continue;
            const pair = bitsOf(mask);
            const elims = pair.map((d) => ({ cell: extraCell, digit: d }));
            return makeStep('unique-rectangle', 9, {
              eliminations: elims, focus: cells.slice(), digits: pair.slice(),
              title: '唯一矩形（类型 1）',
              text: '四个格子 ' + cells.map(cellName).join('、') + ' 组成矩形，落在两个宫里。其中三格候选都是 {' + pair.join(',') + '}，只有 ' + cellName(extraCell) + ' 多了别的候选。如果它也取 ' + pair.join(' 或 ') + '，这四格就能互换 ' + pair.join('/') + ' 得到第二个解，与题目唯一解矛盾。所以 ' + cellName(extraCell) + ' 只能是那个多出来的数字。',
            });
          }
        }
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 10：单数染色
   * --------------------------------------------------------------------- */
  function simpleColoring(state) {
    for (const d of DIGITS) {
      const adj = {};
      for (let i = 0; i < 81; i++) adj[i] = [];
      for (const unit of UNITS) {
        const pos = unit.cells.filter((c) => !state.grid[c] && (state.cand[c] & bit(d)));
        if (pos.length === 2) {
          adj[pos[0]].push(pos[1]);
          adj[pos[1]].push(pos[0]);
        }
      }
      const color = new Int8Array(81).fill(-1);
      for (let start = 0; start < 81; start++) {
        if (color[start] !== -1 || !adj[start].length) continue;
        const comp = [];
        const queue = [start];
        color[start] = 0;
        let bad = false;
        while (queue.length) {
          const cur = queue.shift();
          comp.push(cur);
          for (const nb of adj[cur]) {
            if (color[nb] === -1) { color[nb] = 1 - color[cur]; queue.push(nb); }
            else if (color[nb] === color[cur]) bad = true;
          }
        }
        if (bad) continue;
        // 规则 1：同色两格互相看见 → 该颜色全假
        for (let i = 0; i < comp.length; i++) {
          for (let j = i + 1; j < comp.length; j++) {
            const a = comp[i], b = comp[j];
            if (color[a] === color[b] && sees(a, b)) {
              const cls = color[a];
              const elims = comp.filter((c) => color[c] === cls).map((c) => ({ cell: c, digit: d }));
              return makeStep('coloring', 10, {
                eliminations: elims, focus: comp.slice(), digits: [d],
                title: '单数染色',
                text: '把数字 ' + d + ' 的共轭对交替染成两色。' + cellName(a) + ' 和 ' + cellName(b) + ' 同为一种颜色，却互相看得见。同色格子不可能同时为真，这一色全部排除 ' + d + '。',
              });
            }
          }
        }
        // 规则 2：某格同时看见两种颜色 → 该格排除 d
        for (let c = 0; c < 81; c++) {
          if (state.grid[c] || !(state.cand[c] & bit(d)) || color[c] !== -1) continue;
          let sees0 = false, sees1 = false;
          for (const other of comp) {
            if (!sees(c, other)) continue;
            if (color[other] === 0) sees0 = true; else sees1 = true;
          }
          if (sees0 && sees1) {
            return makeStep('coloring', 10, {
              eliminations: [{ cell: c, digit: d }], focus: comp.slice(), digits: [d],
              title: '单数染色',
              text: '数字 ' + d + ' 的两色里必有一色为真。' + cellName(c) + ' 同时看得见两种颜色的格子，无论哪一色成立它都不能取 ' + d + '。',
            });
          }
        }
      }
    }
    return null;
  }

  /* -----------------------------------------------------------------------
   * 技巧 11：交替推理链 AIC
   * --------------------------------------------------------------------- */
  function aic(state) {
    const nodeId = (cell, digit) => cell * 10 + digit;
    const cellOf = (id) => Math.floor(id / 10);
    const digitOf = (id) => id % 10;

    function strongNeighbors(id) {
      const cell = cellOf(id), d = digitOf(id);
      const out = [];
      if (POP[state.cand[cell]] === 2) {
        const other = state.cand[cell] & ~bit(d);
        if (other) out.push(nodeId(cell, lowestDigit(other)));
      }
      for (const unit of UNITS) {
        if (unit.cells.indexOf(cell) < 0) continue;
        const pos = unit.cells.filter((c) => !state.grid[c] && (state.cand[c] & bit(d)));
        if (pos.length === 2) {
          const other = pos[0] === cell ? pos[1] : pos[0];
          out.push(nodeId(other, d));
        }
      }
      return out;
    }
    function weakNeighbors(id) {
      const cell = cellOf(id), d = digitOf(id);
      const out = [];
      for (const dd of bitsOf(state.cand[cell])) if (dd !== d) out.push(nodeId(cell, dd));
      for (const unit of UNITS) {
        if (unit.cells.indexOf(cell) < 0) continue;
        for (const c of unit.cells) {
          if (c !== cell && !state.grid[c] && (state.cand[c] & bit(d))) out.push(nodeId(c, d));
        }
      }
      return out;
    }

    const starts = [];
    for (let c = 0; c < 81; c++) {
      if (state.grid[c]) continue;
      for (const d of bitsOf(state.cand[c])) {
        const id = nodeId(c, d);
        if (strongNeighbors(id).length) starts.push(id);
      }
    }
    if (starts.length > 160) starts.length = 160; // 控制搜索规模

    let result = null;
    const targetsOf = (a, b) => {
      const ca = cellOf(a), cb = cellOf(b);
      const da = digitOf(a), db = digitOf(b);
      if (ca === cb && da !== db) {
        const others = bitsOf(state.cand[ca] & ~(bit(da) | bit(db)));
        return others.map((d) => ({ cell: ca, digit: d }));
      }
      if (da !== db) return [];
      const out = [];
      for (const c of commonPeers(ca, cb)) {
        if (c === ca || c === cb) continue;
        if (!state.grid[c] && (state.cand[c] & bit(da))) out.push({ cell: c, digit: da });
      }
      return out;
    };

    for (const start of starts) {
      if (result) break;
      const visited = new Set([start]);
      const path = [start];
      const dfs = (cur, depth, nextType) => {
        if (result || depth >= 9) return;
        const nbrs = nextType === 'strong' ? strongNeighbors(cur) : weakNeighbors(cur);
        for (const nb of nbrs) {
          if (visited.has(nb)) continue;
          visited.add(nb); path.push(nb);
          const links = depth + 1;
          if (nextType === 'strong' && links >= 3) {
            const elims = targetsOf(start, nb);
            if (elims.length) {
              const a = cellOf(start), b = cellOf(nb);
              result = makeStep('aic', 11, {
                eliminations: elims, focus: path.map(cellOf), digits: [digitOf(start)],
                title: '交替推理链（AIC）',
                text: '从 ' + cellName(a) + ' 的候选 ' + digitOf(start) + ' 出发，沿强链、弱链交替走到 ' + cellName(b) + '，链条两端都是强链。两端至少有一个为真，所以同时看见两端的格子不能取 ' + digitOf(start) + '。',
              });
              return;
            }
          }
          dfs(nb, links, nextType === 'strong' ? 'weak' : 'strong');
          path.pop(); visited.delete(nb);
        }
      };
      dfs(start, 0, 'strong');
    }
    return result;
  }

  const TECHNIQUES = [
    { id: 'naked-single', level: 1, name: '唯一余数', family: '基础', fn: nakedSingle },
    { id: 'hidden-single', level: 2, name: '隐性唯一', family: '基础', fn: hiddenSingle },
    { id: 'locked-candidates', level: 3, name: '区块排除', family: '进阶', fn: lockedCandidates },
    { id: 'naked-subset', level: 4, name: '显性数组', family: '进阶', fn: nakedSubsets },
    { id: 'hidden-subset', level: 5, name: '隐性数组', family: '进阶', fn: hiddenSubsets },
    { id: 'x-wing', level: 6, name: 'X-Wing', family: '进阶', fn: xWing },
    { id: 'swordfish', level: 7, name: 'Swordfish', family: '高难', fn: (s) => fish(s, 3, 'swordfish', 'Swordfish（剑鱼）') },
    { id: 'jellyfish', level: 8, name: 'Jellyfish', family: '高难', fn: (s) => fish(s, 4, 'jellyfish', 'Jellyfish（水母）') },
    { id: 'xy-wing', level: 9, name: 'XY-Wing', family: '高难', fn: xyWing },
    { id: 'xyz-wing', level: 9, name: 'XYZ-Wing', family: '高难', fn: xyzWing },
    { id: 'unique-rectangle', level: 10, name: '唯一矩形', family: '高难', fn: uniqueRectangle },
    { id: 'coloring', level: 11, name: '单数染色', family: '高难', fn: simpleColoring },
    { id: 'aic', level: 12, name: '交替推理链', family: '高难', fn: aic },
  ];

  function findStep(state, maxLevel) {
    if (maxLevel === undefined) maxLevel = 99;
    for (const t of TECHNIQUES) {
      if (t.level > maxLevel) continue;
      const step = t.fn(state);
      if (step) return step;
    }
    return null;
  }

  function solveLog(grid, maxLevel) {
    const state = initialState(grid);
    const steps = [];
    let guard = 0;
    while (!isSolved(state.grid)) {
      if (guard++ > 400) return { solved: false, steps, reason: '步数上限' };
      const step = findStep(state, maxLevel === undefined ? 99 : maxLevel);
      if (!step) return { solved: false, steps, reason: '技巧库已用尽', state };
      applyStep(state, step);
      steps.push(step);
      if (isSolved(state.grid) || steps.length > 300) break;
    }
    // 可能还有空格但候选全空
    return { solved: isSolved(state.grid), steps, state };
  }

  /* -----------------------------------------------------------------------
   * 回溯求解：位运算 + MRV
   * --------------------------------------------------------------------- */
  function pickCell(state) {
    let best = -1, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (state.grid[i]) continue;
      const pc = POP[state.cand[i]];
      if (pc === 0) return -2;
      if (pc < bestCount) { bestCount = pc; best = i; if (pc === 1) break; }
    }
    return best;
  }

  function search(state, limit, counter) {
    // 先做裸单与隐性唯一传播
    let dirty = true;
    while (dirty) {
      dirty = false;
      for (let i = 0; i < 81; i++) {
        if (!state.grid[i] && POP[state.cand[i]] === 1) {
          const d = lowestDigit(state.cand[i]);
          state.grid[i] = d; state.cand[i] = 0;
          for (const p of PEERS[i]) state.cand[p] &= ~bit(d);
          dirty = true;
        }
      }
      for (const unit of UNITS) {
        for (const d of DIGITS) {
          let has = false, pos = -1, count = 0;
          for (const c of unit.cells) {
            if (state.grid[c] === d) { has = true; break; }
            if (!state.grid[c] && (state.cand[c] & bit(d))) { count++; pos = c; }
          }
          if (!has && count === 1 && state.grid[pos] === 0) {
            state.grid[pos] = d; state.cand[pos] = 0;
            for (const p of PEERS[pos]) state.cand[p] &= ~bit(d);
            dirty = true;
          }
        }
      }
    }
    const cell = pickCell(state);
    if (cell === -2) return false;
    if (cell === -1) {
      counter.count++;
      if (limit && counter.count >= limit) return true;
      return false;
    }
    for (const d of bitsOf(state.cand[cell])) {
      const next = { grid: cloneGrid(state.grid), cand: new Uint16Array(state.cand) };
      next.grid[cell] = d; next.cand[cell] = 0;
      for (const p of PEERS[cell]) next.cand[p] &= ~bit(d);
      const stop = search(next, limit, counter);
      if (stop) return true;
    }
    return false;
  }

  function countSolutions(grid, limit) {
    limit = limit || 2;
    const state = initialState(grid);
    if (!isValid(state.grid)) return 0;
    const counter = { count: 0 };
    search(state, limit, counter);
    return counter.count;
  }

  function solve(grid) {
    const state = initialState(grid);
    if (!isValid(state.grid)) return null;
    return solveFirst(grid);
  }

  function solveFirst(grid) {
    const st = initialState(grid);
    if (!isValid(st.grid)) return null;
    // 传播 + 递归，直接返回第一个解
    function propagate(s) {
      let dirty = true;
      while (dirty) {
        dirty = false;
        for (let i = 0; i < 81; i++) {
          if (!s.grid[i] && POP[s.cand[i]] === 1) {
            const d = lowestDigit(s.cand[i]);
            s.grid[i] = d; s.cand[i] = 0;
            for (const p of PEERS[i]) s.cand[p] &= ~bit(d);
            dirty = true;
          }
        }
        for (const unit of UNITS) {
          for (const d of DIGITS) {
            let has = false, pos = -1, count = 0;
            for (const c of unit.cells) {
              if (s.grid[c] === d) { has = true; break; }
              if (!s.grid[c] && (s.cand[c] & bit(d))) { count++; pos = c; }
            }
            if (!has && count === 1 && s.grid[pos] === 0) {
              s.grid[pos] = d; s.cand[pos] = 0;
              for (const p of PEERS[pos]) s.cand[p] &= ~bit(d);
              dirty = true;
            }
          }
        }
      }
    }
    function rec(s) {
      propagate(s);
      let cell = -1, best = 10;
      for (let i = 0; i < 81; i++) {
        if (s.grid[i]) continue;
        const pc = POP[s.cand[i]];
        if (pc === 0) return null;
        if (pc < best) { best = pc; cell = i; if (pc === 1) break; }
      }
      if (cell === -1) return cloneGrid(s.grid);
      for (const d of bitsOf(s.cand[cell])) {
        const next = { grid: cloneGrid(s.grid), cand: new Uint16Array(s.cand) };
        next.grid[cell] = d; next.cand[cell] = 0;
        for (const p of PEERS[cell]) next.cand[p] &= ~bit(d);
        const res = rec(next);
        if (res) return res;
      }
      return null;
    }
    return rec(st);
  }

  /* -----------------------------------------------------------------------
   * 生成：随机终盘 + 挖洞，挖洞过程中保持唯一解
   * --------------------------------------------------------------------- */
  const BASE_GRID = parse(
    '123456789' +
    '456789123' +
    '789123456' +
    '234567891' +
    '567891234' +
    '891234567' +
    '345678912' +
    '678912345' +
    '912345678'
  );

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function randomFullGrid() {
    const digitMap = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rowsInBand = [0, 1, 2].map(() => shuffle([0, 1, 2]));
    const bands = shuffle([0, 1, 2]);
    const colsInStack = [0, 1, 2].map(() => shuffle([0, 1, 2]));
    const stacks = shuffle([0, 1, 2]);
    const transpose = Math.random() < 0.5;
    const g = new Uint8Array(81);
    for (let outR = 0; outR < 9; outR++) {
      for (let outC = 0; outC < 9; outC++) {
        const br = Math.floor(outR / 3), ir = outR % 3;
        const bc = Math.floor(outC / 3), ic = outC % 3;
        const r = bands[br] * 3 + rowsInBand[bands[br]][ir];
        const c = stacks[bc] * 3 + colsInStack[stacks[bc]][ic];
        const src = transpose ? BASE_GRID[c * 9 + r] : BASE_GRID[r * 9 + c];
        g[outR * 9 + outC] = digitMap[src - 1];
      }
    }
    return g;
  }

  function transform(grid) {
    // 数字置换 + 几何变换，保持题目结构与难度
    const digitMap = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rowsInBand = [0, 1, 2].map(() => shuffle([0, 1, 2]));
    const bands = shuffle([0, 1, 2]);
    const colsInStack = [0, 1, 2].map(() => shuffle([0, 1, 2]));
    const stacks = shuffle([0, 1, 2]);
    const transpose = Math.random() < 0.5;
    const out = new Uint8Array(81);
    for (let outR = 0; outR < 9; outR++) {
      for (let outC = 0; outC < 9; outC++) {
        const br = Math.floor(outR / 3), ir = outR % 3;
        const bc = Math.floor(outC / 3), ic = outC % 3;
        const r = bands[br] * 3 + rowsInBand[bands[br]][ir];
        const c = stacks[bc] * 3 + colsInStack[stacks[bc]][ic];
        const v = transpose ? grid[c * 9 + r] : grid[r * 9 + c];
        out[outR * 9 + outC] = v ? digitMap[v - 1] : 0;
      }
    }
    return out;
  }

  function digHoles(solution, targetClues, seedRng) {
    const puzzle = cloneGrid(solution);
    const order = shuffle(Array.from({ length: 81 }, (_, i) => i));
    let clues = 81;
    for (const idx of order) {
      if (clues <= targetClues) break;
      if (!puzzle[idx]) continue;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      const count = countSolutions(puzzle, 2);
      if (count !== 1) puzzle[idx] = backup;
      else clues--;
    }
    return puzzle;
  }

  const DIFFICULTY_BANDS = {
    starter: { label: '入门', maxLevel: 2, clues: 40 },
    easy: { label: '简单', maxLevel: 4, clues: 34 },
    medium: { label: '中等', maxLevel: 6, clues: 30 },
    hard: { label: '困难', maxLevel: 9, clues: 25 },
    expert: { label: '专家', maxLevel: 99, clues: 22 },
  };

  function levelLabel(maxLevel) {
    if (maxLevel <= 2) return '入门';
    if (maxLevel <= 4) return '简单';
    if (maxLevel <= 6) return '中等';
    if (maxLevel <= 9) return '困难';
    return '专家';
  }

  function rate(grid) {
    const started = Date.now();
    // 难度 = 解出这道题所需的最低技巧层级，而不是“过程中碰巧出现过的最难技巧”。
    // 对 L=1..12 依次限权求解，第一次成功的那一层就是这道题的下限。
    let log = null, level = 99;
    for (let L = 1; L <= 12; L++) {
      log = solveLog(grid, L);
      if (log.solved) { level = L; break; }
    }
    let maxLevel = 0;
    const used = {};
    if (log) {
      for (const s of log.steps) {
        if (s.level > maxLevel) maxLevel = s.level;
        used[s.tech] = (used[s.tech] || 0) + 1;
      }
    }
    let clues = 0;
    for (let i = 0; i < 81; i++) if (grid[i]) clues++;
    return {
      solved: level !== 99,
      level,
      label: level === 99 ? '未定' : levelLabel(level),
      clues,
      steps: log ? log.steps.length : 0,
      techniques: used,
      ms: Date.now() - started,
    };
  }

  function generate(difficulty, opts) {
    opts = opts || {};
    const band = DIFFICULTY_BANDS[difficulty] || DIFFICULTY_BANDS.medium;
    const attempts = opts.attempts || 12;
    let best = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const solution = randomFullGrid();
      const puzzle = digHoles(solution, band.clues);
      const r = rate(puzzle);
      // 优先保留技巧库内可解出的题；只有在所有尝试都超出技巧库时才退回未解题。
      if (r.solved) {
        if (!best || !best.rate.solved || r.level > best.rate.level) {
          best = { puzzle, solution, rate: r };
        }
      } else if (!best) {
        best = { puzzle, solution, rate: r };
      }
      if (r.solved && r.label === band.label) {
        return { puzzle, solution, rate: r, attempts: attempt + 1 };
      }
    }
    return { puzzle: best.puzzle, solution: best.solution, rate: best.rate, attempts };
  }

  function difficultyOfPuzzle(grid) { return rate(grid); }

  /* -----------------------------------------------------------------------
   * 导出
   * --------------------------------------------------------------------- */
  return {
    ALL, bit, POP, DIGITS,
    ROWS, COLS, BOXES, UNITS, PEERS, UNIT_OF,
    parse, format, cloneGrid, candidates, initialState, isSolved, isValid,
    applyStep, findStep, solveLog, solve, solveFirst, countSolutions,
    TECHNIQUES, rate, levelLabel, generate, randomFullGrid, transform, digHoles,
    cellName, unitName, unitTypeName, sees, bitsOf,
    DIFFICULTY_BANDS,
  };
});
