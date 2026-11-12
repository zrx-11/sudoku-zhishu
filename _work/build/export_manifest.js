/* 由内容源导出 manifest.json 的原始数据；由 build_site.py 调用 */
global.window = global;
window.ZS = {};

require('../../src/content/seeds.js');
require('../../src/content/meta.js');
require('../../src/content/lessons-a.js');
require('../../src/content/lessons-b.js');
require('../../src/content/quizzes.js');

const ZS = window.ZS;
const lessons = ZS.lessons.slice().sort((a, b) => a.num - b.num);

const manifest = {
  slug: 'sudoku-zhishu',
  title: ZS.META.title,
  subtitle: ZS.META.subtitle,
  book: {
    title: ZS.META.title,
    author: ZS.META.author,
    source: ['知枢学习系统生成：规则、技巧与程序实现均在本机编写并验证'],
  },
  audience: '零基础到进阶；不要求先会编程',
  goal: '按依赖顺序掌握数独从规则、候选数到链的完整解法，并能用程序求解、验证唯一解与生成分级题目。',
  learningPath: lessons.map((l) => ({
    step: String(l.num).padStart(2, '0'),
    title: l.title,
    chapterIds: [l.id],
    checkpoint: '完成本章自测，正确率 ≥ 80%',
  })),
  chapters: lessons.map((l) => ({
    id: l.id,
    title: '第 ' + l.num + ' 章：' + l.title,
    difficulty: l.difficulty,
    minutes: l.minutes,
    prerequisites: l.prereq || [],
    concepts: l.concepts || [],
    source: { file: '知枢学习系统生成', page: 0 },
  })),
  glossary: ZS.GLOSSARY.map((g) => ({ term: g.term, def: g.def, chapterId: g.lesson })),
  quizzes: ZS.quizzes.map((q) => ({
    id: q.id,
    chapterId: q.lesson === '__all' ? 'ch16' : q.lesson,
    type: 'single',
    question: q.question,
    options: q.options,
    answer: q.answer,
    explain: q.explain,
    relatedConceptId: q.concept,
    source: { file: '知枢学习系统生成', page: 0 },
  })),
  flashcards: ZS.CARDS.map((c, i) => ({
    id: 'f' + String(i + 1).padStart(2, '0'),
    chapterId: c.lesson,
    front: c.front,
    back: c.back,
    tags: [c.lesson],
  })),
  site: {
    entry: 'index.html',
    routes: ['#/', '#/path', '#/lesson/:id', '#/practice', '#/diagnose', '#/lab', '#/cheat', '#/glossary', '#/cards'],
    offline: true,
    storageKey: 'zhishu-sudoku-v1',
  },
};

process.stdout.write(JSON.stringify(manifest, null, 2));
