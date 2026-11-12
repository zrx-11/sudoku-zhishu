/* 端到端冒烟：双视口、课程页、演示、测验、练习场、实验室、诊断、卡片 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'screens');
const URL = 'file://' + path.join(ROOT, 'index.html');

const errors = [];
const logs = [];

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/chromium',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    logs.push(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '1440-home.png'), fullPage: false });

  // 课程页逐个过
  const chapters = ['ch01', 'ch02', 'ch03', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10', 'ch11', 'ch12', 'ch14', 'ch16'];
  for (const id of chapters) {
    await page.goto(URL + '#/lesson/' + id, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    const info = await page.evaluate(() => ({
      h1: document.querySelector('.lesson-head h1')?.textContent,
      demos: document.querySelectorAll('.demo').length,
      boards: document.querySelectorAll('.mini-board').length,
      quizzes: document.querySelectorAll('.quiz').length,
      schematics: document.querySelectorAll('.schematic svg').length,
      bodyLen: document.querySelector('.lesson-body')?.innerHTML.length || 0,
    }));
    console.log(id, JSON.stringify(info));
    if (!info.h1) throw new Error(id + ' 没有标题');
    if (info.bodyLen < 500) throw new Error(id + ' 正文过短');
  }

  // 演示播放器：跳到下一步、目标
  await page.goto(URL + '#/lesson/ch08', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const demo = page.locator('.demo').first();
  await demo.locator('[data-act="first"]').click();
  await page.waitForTimeout(150);
  const before = await demo.locator('.demo-step-title').textContent();
  await demo.locator('[data-act="next"]').click();
  await page.waitForTimeout(150);
  const after = await demo.locator('.demo-step-title').textContent();
  console.log('demo next:', before, '->', after);
  if (before === after) throw new Error('演示下一步没有变化');
  await demo.screenshot({ path: path.join(OUT, 'demo-xwing.png') });

  // 测验判定
  await page.goto(URL + '#/lesson/ch04', { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const quiz = page.locator('.quiz').first();
  await quiz.locator('input').first().click();
  await quiz.locator('.quiz-check').click();
  await page.waitForTimeout(200);
  const fb = await quiz.locator('.quiz-feedback').textContent();
  console.log('quiz feedback:', fb);
  const cls = await quiz.locator('.quiz-feedback').getAttribute('class');
  console.log('quiz class:', cls);

  // 练习场
  await page.goto(URL + '#/practice', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const pInfo = await page.evaluate(() => {
    const board = document.querySelector('#practice-board');
    const empties = Array.from(document.querySelectorAll('#practice-board [data-i]')).filter((c) => !c.querySelector('.val'));
    return {
      cells: board ? board.querySelectorAll('[data-i]').length : 0,
      empties: empties.length,
      firstEmpty: empties.length ? empties[0].getAttribute('data-i') : null,
      timer: document.querySelector('#timer-chip')?.textContent,
    };
  });
  console.log('practice:', JSON.stringify(pInfo));
  if (pInfo.cells !== 81) throw new Error('练习盘不是 81 格');
  if (!pInfo.firstEmpty) throw new Error('练习盘没有空格');
  await page.locator('#practice-board [data-i="' + pInfo.firstEmpty + '"]').click();
  await page.waitForTimeout(120);
  await page.keyboard.press('5');
  await page.waitForTimeout(300);
  const val = await page.evaluate((i) => document.querySelector('#practice-board [data-i="' + i + '"] .val')?.textContent, pInfo.firstEmpty);
  console.log('practice input 5 ->', val);
  await page.locator('[data-act="hint"]').first().click();
  await page.waitForTimeout(400);
  const hintText = await page.evaluate(() => document.querySelector('.hint-box')?.textContent || '');
  console.log('hint:', hintText.slice(0, 80));
  await page.screenshot({ path: path.join(OUT, '1440-practice.png'), fullPage: false });

  // 实验室
  await page.goto(URL + '#/lab', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.locator('[data-lab-act="sample"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-lab-act="solve"]').click();
  await page.waitForTimeout(1200);
  const lab = await page.evaluate(() => ({
    stats: document.querySelector('.lab-stats')?.textContent || '',
    warn: document.querySelector('.lab-warn')?.textContent || '',
    log: document.querySelectorAll('.lab-log-item').length,
    board: !!document.querySelector('#lab-result .mini-board .cell'),
  }));
  console.log('lab:', JSON.stringify(lab));
  if (!lab.stats.includes('唯一解') && !lab.stats.includes('解的数量')) throw new Error('实验室没有结果');
  await page.screenshot({ path: path.join(OUT, '1440-lab.png'), fullPage: false });

  // 出题
  await page.locator('[data-lab-tab="gen"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-lab-act="generate"]').click();
  await page.waitForTimeout(700);
  const gen = await page.evaluate(() => ({
    stats: document.querySelector('#lab-gen-result .lab-stats')?.textContent || '',
    board: !!document.querySelector('#lab-gen-result .mini-board .cell'),
    use: !!document.querySelector('[data-lab-act="use"]'),
  }));
  console.log('gen:', JSON.stringify(gen));
  if (!gen.board) throw new Error('出题没有盘面');

  // 诊断
  await page.goto(URL + '#/diagnose', { waitUntil: 'load' });
  await page.waitForTimeout(250);
  await page.locator('#diag-start').click();
  await page.waitForTimeout(300);
  const diag = await page.evaluate(() => ({
    progress: document.querySelector('#diag-progress')?.textContent,
    quiz: !!document.querySelector('#diag-stage .quiz'),
  }));
  console.log('diag:', JSON.stringify(diag));
  if (!diag.quiz) throw new Error('诊断没有出题');

  // 卡片
  await page.goto(URL + '#/cards', { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const card = await page.locator('.flashcard');
  await card.click();
  await page.waitForTimeout(700);
  const flipped = await page.evaluate(() => document.querySelector('.flashcard')?.classList.contains('flipped'));
  console.log('card flipped:', flipped);
  if (!flipped) throw new Error('卡片没有翻转');
  await page.screenshot({ path: path.join(OUT, '1440-cards.png'), fullPage: false });

  // 术语与速查
  await page.goto(URL + '#/glossary', { waitUntil: 'load' });
  await page.waitForTimeout(200);
  const gloss = await page.evaluate(() => document.querySelectorAll('.glossary-item').length);
  console.log('glossary:', gloss);
  await page.goto(URL + '#/cheat', { waitUntil: 'load' });
  await page.waitForTimeout(200);
  const tech = await page.evaluate(() => document.querySelectorAll('.tech-table tbody tr').length);
  console.log('cheat rows:', tech);

  // 主题切换
  await page.locator('#theme-btn').click();
  await page.waitForTimeout(250);
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('theme after toggle:', theme);
  await page.screenshot({ path: path.join(OUT, '1440-dark.png'), fullPage: false });

  // 手机视口
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mobile.newPage();
  const mErrors = [];
  mp.on('console', (msg) => { if (msg.type() === 'error') mErrors.push(msg.text()); });
  mp.on('pageerror', (err) => mErrors.push('PAGEERROR: ' + err.message));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForTimeout(400);
  const layout = await mp.evaluate(() => {
    const main = document.querySelector('.main');
    const rect = main.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      mainLeft: rect.left,
      mainRight: window.innerWidth - rect.right,
      sidebarHidden: getComputedStyle(document.querySelector('.sidebar')).transform,
      navItems: document.querySelectorAll('.nav-item').length,
    };
  });
  console.log('mobile layout:', JSON.stringify(layout));
  if (layout.scrollWidth > layout.innerWidth + 1) throw new Error('手机视口横向溢出');
  await mp.screenshot({ path: path.join(OUT, '390-home.png'), fullPage: false });

  await mp.goto(URL + '#/lesson/ch01', { waitUntil: 'load' });
  await mp.waitForTimeout(300);
  const mMain = await mp.evaluate(() => {
    const v = document.querySelector('.view').getBoundingClientRect();
    return { left: v.left, right: window.innerWidth - v.right, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
  });
  console.log('mobile lesson padding:', JSON.stringify(mMain));
  await mp.screenshot({ path: path.join(OUT, '390-lesson.png'), fullPage: false });

  await mp.goto(URL + '#/practice', { waitUntil: 'load' });
  await mp.waitForTimeout(400);
  const mPractice = await mp.evaluate(() => {
    const b = document.querySelector('#practice-board').getBoundingClientRect();
    return { left: b.left, right: window.innerWidth - b.right, width: b.width, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
  });
  console.log('mobile practice board:', JSON.stringify(mPractice));
  await mp.screenshot({ path: path.join(OUT, '390-practice.png'), fullPage: false });
  await mp.locator('#menu-btn').click();
  await mp.waitForTimeout(300);
  const drawer = await mp.evaluate(() => ({
    open: document.querySelector('.sidebar').classList.contains('open'),
    scrim: document.querySelector('#scrim').classList.contains('show'),
    navHeight: document.querySelector('#nav')?.scrollHeight,
  }));
  console.log('drawer:', JSON.stringify(drawer));
  await mp.screenshot({ path: path.join(OUT, '390-drawer.png'), fullPage: false });

  if (errors.length) {
    console.log('\n--- CONSOLE ERRORS ---');
    errors.forEach((e) => console.log(e));
  }
  if (mErrors.length) {
    console.log('\n--- MOBILE ERRORS ---');
    mErrors.forEach((e) => console.log(e));
  }
  console.log('\nTOTAL errors:', errors.length + mErrors.length);
  console.log('TOTAL logs:', logs.length);
  await browser.close();
  if (errors.length + mErrors.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
