/* 针对高级技巧的定向单测：用人工候选数状态检验检测器逻辑，再用真实盘面回放检验 */
const E = require('../../src/engine.js');
const assert = require('assert');

function stateWith(baseMask) {
  const grid = new Uint8Array(81);
  const cand = new Uint16Array(81);
  for (let i = 0; i < 81; i++) cand[i] = baseMask;
  return { grid, cand };
}
function techFn(id) { return E.TECHNIQUES.find((t) => t.id === id).fn; }
const bit = E.bit;

let pass = 0;
function ok(name, cond, extra) { if (!cond) { console.log('FAIL ' + name, extra || ''); process.exitCode = 1; } else { pass++; console.log('ok   ' + name); } }

/* 隐性数对：第 1 行 c0/c1 是 {1,2,3}/{1,2,4}，其余格不含 1、2 */
{
  const st = stateWith(E.ALL & ~bit(1) & ~bit(2));
  const c0 = 0, c1 = 1;
  st.cand[c0] = bit(1) | bit(2) | bit(3);
  st.cand[c1] = bit(1) | bit(2) | bit(4);
  const step = techFn('hidden-subset')(st);
  ok('隐性数对检测', step && step.tech === 'hidden-subset', step && step.tech);
  if (step) {
    const cells = step.eliminations.map((e) => e.cell + ':' + e.digit).sort().join(',');
    ok('隐性数对排除正确', step.eliminations.length === 2 && step.eliminations.some(e => e.cell === c0 && e.digit === 3) && step.eliminations.some(e => e.cell === c1 && e.digit === 4), cells);
  }
}

/* Swordfish：第 1-3 行的 1 落在第 1-3 列 */
{
  const st = stateWith(E.ALL & ~bit(1));
  const put = (r, c) => { st.cand[r * 9 + c] |= bit(1); };
  put(0, 0); put(0, 1);
  put(1, 1); put(1, 2);
  put(2, 0); put(2, 2);
  put(3, 0); put(4, 1); put(5, 2); put(6, 0);
  const step = techFn('swordfish')(st);
  ok('Swordfish 检测', step && step.tech === 'swordfish', step && step.tech);
  if (step) {
    const bad = step.eliminations.some((e) => Math.floor(e.cell / 9) < 3 || (e.cell % 9) > 2);
    ok('Swordfish 只删第 1-3 列以外行的候选', !bad && step.eliminations.length >= 1, JSON.stringify(step.eliminations));
  }
}

/* Jellyfish：第 1-4 行的 1 落在第 1-4 列 */
{
  const st = stateWith(E.ALL & ~bit(1));
  const put = (r, c) => { st.cand[r * 9 + c] |= bit(1); };
  put(0, 0); put(0, 1);
  put(1, 1); put(1, 2);
  put(2, 2); put(2, 3);
  put(3, 0); put(3, 3);
  put(4, 0); put(5, 1); put(6, 2); put(7, 3);
  const step = techFn('jellyfish')(st);
  ok('Jellyfish 检测', step && step.tech === 'jellyfish', step && step.tech);
}

/* 唯一矩形类型 1 */
{
  const st = stateWith(E.ALL);
  const cells = [0, 3, 9, 12]; // r1c1,r1c4,r2c1,r2c4 -> 两个宫
  for (const c of cells) st.cand[c] = bit(1) | bit(2);
  st.cand[12] = bit(1) | bit(2) | bit(3);
  const step = techFn('unique-rectangle')(st);
  ok('唯一矩形检测', step && step.tech === 'unique-rectangle', step && step.tech);
  if (step) ok('唯一矩形删掉多出的格子里的 1、2', step.eliminations.length === 2 && step.eliminations.every(e => e.cell === 12), JSON.stringify(step.eliminations));
}

/* 真实盘面：回放 examples.json 中每条记录到目标步，核对排除与唯一解 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'examples.json');
if (fs.existsSync(file)) {
  const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const tech of Object.keys(ex)) {
    for (const item of ex[tech]) {
      const puzzle = E.parse(item.puzzle);
      const solution = E.parse(item.solution);
      const st = E.initialState(puzzle);
      const log = E.solveLog(puzzle, 99);
      for (let i = 0; i < item.stepIndex; i++) E.applyStep(st, log.steps[i]);
      const step = log.steps[item.stepIndex];
      for (const el of step.eliminations) {
        assert.notStrictEqual(solution[el.cell], el.digit, '真实盘面排除错误 ' + tech + ' ' + E.cellName(el.cell));
      }
      ok('真实盘面 ' + tech + ' 第 ' + item.stepIndex + ' 步（线索 ' + item.clues + '）', step.tech === item.tech);
    }
  }
}
console.log('\n通过 ' + pass + ' 项');
