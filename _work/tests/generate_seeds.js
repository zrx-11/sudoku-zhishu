/* 为练习场生成题库存量：每个难度 8 道，按技巧评级严格匹配 */
const E = require('../../src/engine.js');
const fs = require('fs');

const TARGETS = {
  starter: { label: '入门', lo: 44, hi: 56, want: 8 },
  easy: { label: '简单', lo: 32, hi: 40, want: 8 },
  medium: { label: '中等', lo: 26, hi: 33, want: 8 },
  hard: { label: '困难', lo: 21, hi: 28, want: 8 },
  expert: { label: '专家', lo: 18, hi: 25, want: 8 },
};

const out = {};
const t0 = Date.now();
for (const key of Object.keys(TARGETS)) {
  const cfg = TARGETS[key];
  out[key] = [];
  let tries = 0;
  while (out[key].length < cfg.want && tries < 4000) {
    tries++;
    const solution = E.randomFullGrid();
    const clues = cfg.lo + Math.floor(Math.random() * (cfg.hi - cfg.lo + 1));
    const puzzle = E.digHoles(solution, clues);
    if (E.countSolutions(puzzle, 2) !== 1) continue;
    const r = E.rate(puzzle);
    if (!r.solved || r.label !== cfg.label) continue;
    out[key].push({
      puzzle: E.format(puzzle, '0'),
      solution: E.format(solution, '0'),
      clues: r.clues,
      level: r.level,
      label: r.label,
      techniques: r.techniques,
    });
  }
  console.log(key.padEnd(8), out[key].length + '/' + cfg.want, '尝试 ' + tries + ' 题');
}

fs.writeFileSync(__dirname + '/seeds.json', JSON.stringify(out, null, 2));
console.log('耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

// 同时输出可直接贴进 content.js 的精简数组
let js = 'const SEEDS = {\n';
for (const key of Object.keys(out)) {
  js += '  ' + key + ': [\n';
  for (const s of out[key]) {
    js += '    { puzzle: \'' + s.puzzle + '\', solution: \'' + s.solution + '\', clues: ' + s.clues + ', label: \'' + s.label + '\' },\n';
  }
  js += '  ],\n';
}
js += '};\n';
fs.writeFileSync(__dirname + '/seeds_snippet.js', js);
console.log(js.slice(0, 1200));
