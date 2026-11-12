const E = require('../../src/engine.js');
const assert = require('assert');

function givensOf(p) { let n = 0; for (let i = 0; i < 81; i++) if (p[i]) n++; return n; }

let pass = 0;
function ok(name, cond, extra) {
  if (!cond) { console.error('FAIL: ' + name, extra || ''); process.exitCode = 1; }
  else { pass++; console.log('ok  ' + name); }
}

/* 1. 基础 API */
const p1 = E.parse('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
const sol1 = E.solve(p1);
ok('solve 经典题', sol1 && E.format(sol1) === '534678912672195348198342567859761423426853791713924856961537284287419635345286179', E.format(sol1 || new Uint8Array(81)));
ok('countSolutions 经典题唯一', E.countSolutions(p1, 2) === 1);

/* 2. 空盘解数 > 1，矛盾盘 = 0 */
ok('空盘多解', E.countSolutions(new Uint8Array(81), 2) === 2);
const bad = E.parse('11' + '0'.repeat(79));
ok('非法盘 0 解', E.countSolutions(bad, 2) === 0);

/* 3. 技巧检测器单测：构造已知结构 */
// 唯一余数：某格只差一个数字
const ns = E.parse('123456789456789123789123456231674895875912364649835271364297518512368947987541632');
ok('唯一余数检测（整盘已解应为 null）', E.findStep(E.initialState(ns), 2) === null);

/* 4. 固定题库逐题重放：每步与唯一解一致 */
const seeds = require('./seeds.json');
const stats = {};
let checkedSteps = 0;
for (const diff of Object.keys(seeds)) {
  for (const seed of seeds[diff]) {
    const puzzle = E.parse(seed.puzzle);
    const solution = E.parse(seed.solution);
    assert.strictEqual(E.countSolutions(puzzle, 2), 1, diff + ' 固定题必须唯一解');
    const log = E.solveLog(puzzle, 99);
    assert.strictEqual(log.solved, true, diff + ' 固定题应可逻辑解出：' + seed.puzzle.slice(0, 12));
    const st = E.initialState(puzzle);
    for (const step of log.steps) {
      for (const pl of step.placements) {
        assert.strictEqual(solution[pl.cell], pl.digit, 'placement 必须等于唯一解：' + E.cellName(pl.cell));
      }
      for (const el of step.eliminations) {
        assert.notStrictEqual(solution[el.cell], el.digit, '排除不能删掉唯一解：' + E.cellName(el.cell) + '=' + el.digit + ' @' + step.tech);
      }
      E.applyStep(st, step);
      checkedSteps++;
    }
    for (let i = 0; i < 81; i++) assert.strictEqual(st.grid[i], solution[i], '最终盘面等于唯一解');
    for (const tech of Object.keys(seed.techniques || {})) stats[tech] = (stats[tech] || 0) + 1;
  }
  ok(diff + ' 固定题库 ' + seeds[diff].length + ' 题全部可逻辑解出', true);
}
ok('固定题库逐步核对 ' + checkedSteps + ' 步无违规', true);

/* 4b. 生成器抽查：唯一解且回溯解等于生成解（不要求一定落在技巧库内） */
for (const diff of ['starter', 'easy', 'medium', 'hard']) {
  const gen = E.generate(diff, { attempts: 8 });
  assert.strictEqual(E.countSolutions(gen.puzzle, 2), 1, diff + ' 生成题必须唯一解');
  assert.strictEqual(E.format(E.solve(gen.puzzle)), E.format(gen.solution), diff + ' 回溯解应等于生成终盘');
  ok(diff + ' 生成器抽查（线索 ' + givensOf(gen.puzzle) + '，评级 ' + gen.rate.label + '）', true);
}

/* 5. 技巧覆盖：用高难题与候选盘检验检测器 */
const corpus = [
  // 已知 17 线索题（来自公开的最小提示数例子）
  '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
  // 其他公开难题
  '000004028406000005100030600000301000087000140000709000002010003900000507670400000',
  '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
];
for (const s of corpus) {
  const p = E.parse(s);
  ok('公开难题唯一解 ' + s.slice(0, 8), E.countSolutions(p, 2) === 1);
  const log = E.solveLog(p, 99);
  if (log.solved) {
    ok('公开难题可解 ' + s.slice(0, 8) + '（' + log.steps.length + ' 步）', true);
  } else {
    console.log('已知超出技巧库 ' + s.slice(0, 8) + '（' + log.steps.length + ' 步，' + log.reason + '）');
  }
  for (const step of log.steps) stats[step.tech] = (stats[step.tech] || 0) + 1;
}

console.log('\n技巧使用统计：', stats);
const detected = new Set(Object.keys(stats));
for (const t of E.TECHNIQUES) {
  if (!detected.has(t.id)) console.log('（本轮未触发）' + t.id + ' ' + t.name);
}

/* 6. 生成器速度 */
const t0 = Date.now();
const g = E.generate('medium', { attempts: 6 });
const t1 = Date.now();
console.log('\n中等题生成 ' + (t1 - t0) + 'ms，线索 ' + givensOf(g.puzzle) + '，评级 ' + g.rate.label + '，技巧 ' + JSON.stringify(g.rate.techniques));

console.log('\n通过 ' + pass + ' 项');
