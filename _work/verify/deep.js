/* 深度交互测试：答错倒推、诊断全流程、练习提示应用/撤销、实验室逐步播放、手机表格溢出 */
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const errors = [];

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // 1. 答错题 -> 解析 + 根因 + 误解卡
  await page.goto(URL + '#/lesson/ch04');
  await page.waitForTimeout(250);
  const q = page.locator('.quiz').first();
  const answer = await page.evaluate(() => {
    const el = document.querySelector('.quiz');
    return el ? Array.from(el.querySelectorAll('input')).map((i) => i.value) : [];
  });
  // 选最后一个选项（大概率错误），必要时选一个非正确答案
  await q.locator('input').last().click();
  await q.locator('.quiz-check').click();
  await page.waitForTimeout(250);
  const wrong = await page.evaluate(() => ({
    fb: document.querySelector('.quiz-feedback')?.textContent,
    cls: document.querySelector('.quiz-feedback')?.className,
    explain: document.querySelector('.quiz-explain')?.textContent?.slice(0, 30),
    remedy: document.querySelector('.quiz-remedy')?.textContent?.slice(0, 60),
    mis: document.querySelector('.mis-card')?.textContent?.slice(0, 40),
  }));
  console.log('wrong quiz:', JSON.stringify(wrong));

  // 2. 诊断：答完 6 题
  await page.goto(URL + '#/diagnose');
  await page.waitForTimeout(250);
  await page.locator('#diag-start').click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 6; i++) {
    const has = await page.evaluate(() => !!document.querySelector('#diag-stage .quiz'));
    if (!has) break;
    await page.locator('#diag-stage .quiz input').first().click();
    await page.locator('#diag-stage .quiz-check').click();
    await page.waitForTimeout(150);
    const next = page.locator('#diag-next');
    if (await next.count()) await next.click();
    await page.waitForTimeout(250);
  }
  const diagEnd = await page.evaluate(() => ({
    progress: document.querySelector('#diag-progress')?.textContent,
    score: document.querySelector('.diag-score')?.textContent,
    result: document.querySelector('#diag-result')?.textContent?.slice(0, 100),
  }));
  console.log('diag end:', JSON.stringify(diagEnd));

  // 3. 练习：提示 -> 应用 -> 撤销
  await page.goto(URL + '#/practice');
  await page.waitForTimeout(350);
  await page.locator('[data-act="hint"]').first().click();
  await page.waitForTimeout(300);
  const hasApply = await page.locator('[data-act="apply-hint"]').count();
  console.log('hint apply button:', hasApply);
  if (hasApply) {
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('#practice-board .cell .val')).length);
    await page.locator('[data-act="apply-hint"]').click();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('#practice-board .cell .val')).length);
    console.log('apply hint values:', before, '->', after);
    if (after <= before) throw new Error('应用提示没有落子');
    await page.locator('[data-act="undo"]').click();
    await page.waitForTimeout(250);
    const undone = await page.evaluate(() => Array.from(document.querySelectorAll('#practice-board .cell .val')).length);
    console.log('undo values:', undone);
    if (undone >= after) throw new Error('撤销没有生效');
  }

  // 4. 实验室逐步播放
  await page.goto(URL + '#/lab');
  await page.waitForTimeout(250);
  await page.locator('[data-lab-act="sample"]').click();
  await page.locator('[data-lab-act="solve"]').click();
  await page.waitForTimeout(1000);
  const play = page.locator('[data-lab-act="play"]');
  if (await play.count()) {
    await play.click();
    await page.waitForTimeout(300);
    await page.locator('#lab-player [data-p="next"]').click();
    await page.waitForTimeout(200);
    const p = await page.evaluate(() => ({
      title: document.querySelector('#play-title')?.textContent,
      progress: document.querySelector('#play-progress')?.textContent,
    }));
    console.log('lab player:', JSON.stringify(p));
    if (!p.title) throw new Error('实验室播放器没有内容');
  } else {
    console.log('lab player: no play button (可能无解)');
  }

  // 5. 手机课程页表格与示意图不过宽
  const mp = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const id of ['ch06', 'ch07', 'ch12']) {
    await mp.goto(URL + '#/lesson/' + id);
    await mp.waitForTimeout(350);
    const m = await mp.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      tables: Array.from(document.querySelectorAll('.lesson-body table')).map((t) => ({ w: t.getBoundingClientRect().width, sw: t.parentElement.scrollWidth, cw: t.parentElement.clientWidth })),
      schematics: Array.from(document.querySelectorAll('.schematic')).map((s) => s.getBoundingClientRect().width),
    }));
    console.log('mobile', id, JSON.stringify(m));
  }
  await mp.goto(URL + '#/lesson/ch06');
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(__dirname, 'screens', '390-ch06.png'), fullPage: false });

  console.log('ERRORS:', errors.length);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
