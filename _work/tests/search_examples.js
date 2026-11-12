/* 搜出每种技巧真实出现的盘面，供课程例子与检测器回归测试使用 */
const E = require('../../src/engine.js');
const fs = require('fs');

const wanted = ['hidden-subset', 'swordfish', 'jellyfish', 'unique-rectangle', 'xy-wing', 'xyz-wing', 'aic', 'coloring', 'x-wing', 'locked-pointing', 'locked-claiming', 'naked-subset'];
const found = {};
const t0 = Date.now();
const N = parseInt(process.argv[2] || '80', 10);

for (let n = 0; n < N; n++) {
  const solution = E.randomFullGrid();
  const target = 20 + Math.floor(Math.random() * 16); // 20..35
  const puzzle = E.digHoles(solution, target);
  if (E.countSolutions(puzzle, 2) !== 1) continue;
  const log = E.solveLog(puzzle, 99);
  let clues = 0; for (let i = 0; i < 81; i++) if (puzzle[i]) clues++;
  log.steps.forEach((step, idx) => {
    if (!wanted.includes(step.tech)) return;
    found[step.tech] = found[step.tech] || [];
    if (found[step.tech].length >= 3) return;
    found[step.tech].push({
      tech: step.tech,
      puzzle: E.format(puzzle, '0'),
      solution: E.format(solution, '0'),
      stepIndex: idx,
      clues,
      level: step.level,
      text: step.text,
      eliminations: step.eliminations.length,
      focus: step.focus,
    });
  });
  if (n % 10 === 9) console.log('已处理 ' + (n + 1) + ' 题，' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

console.log('\n命中统计：');
for (const w of wanted) console.log(w.padEnd(18), found[w] ? found[w].length : 0);
fs.writeFileSync(__dirname + '/examples.json', JSON.stringify(found, null, 2));
console.log('\n耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's，写入 examples.json');
