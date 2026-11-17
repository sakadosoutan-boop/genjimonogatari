// 進行・保存・学習機能の回帰テスト（jsdom）。実行: npm test
// 画面を実際に組み立てて、ボタンを押しながら帖を最後まで通す。3D は読み込まず、絵巻モード（Stage2D）で確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const SCRIPTS = ['src/js/core.js', 'src/data/chars.js', 'src/data/stage-spec.js', 'src/data/bunpo.js', 'src/data/kiritsubo.js', 'src/data/wakamurasaki.js',
  'src/js/stage2d.js', 'src/js/games.js', 'src/js/study.js', 'src/js/ui.js', 'src/js/engine.js'];
const KEY = 'genji:v1';

function boot(saved, extra) {
  const dom = new JSDOM('<!doctype html><html><body><div id="gj-stage"></div><div id="gj-ui"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
  const w = dom.window;
  w.localStorage.setItem(KEY, JSON.stringify(saved || { v: 1, settings: { view: '2d', big: false, instant: true, ruby: true, sound: false, classroom: true }, ch: {} }));
  w.GENJI_NO_AUTOBOOT = true;
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = w.Element.prototype.scrollIntoView || function () {};
  SCRIPTS.concat(extra || []).forEach((f) => w.eval(fs.readFileSync(path.join(root, f), 'utf8')));
  w.GENJI.Engine.boot();
  return w;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 5));

/** 押せるものを一つ押す。wrong を渡すと、読解でわざと一度まちがえる。 */
function step(w, opt) {
  const E = w.GENJI.Engine, d = w.document, q = (s) => d.querySelector(s), live = (e) => e && !e.disabled && !e.closest('[hidden]');
  const m = E._mode(), n = E._cur();
  if (m === 'card') return q('.gj-card').click();
  let b = q('.gj-panel .gj-next') || q('[data-g="done"]');
  if (live(b)) return b.click();
  if (m === 'ask' && n) {
    let i = n.o.findIndex((o) => o.ok); if (i < 0) i = 0;
    if (opt && opt.wrong && opt.wrong(n)) i = n.o.findIndex((o) => !o.ok);
    b = q('.gj-opt[data-i="' + i + '"]');
    if (live(b)) return b.click();
  }
  if (q('.gj-musubi') && n && n.cfg && n.cfg.left) {
    const c = n.cfg, left = c.left.find((l) => !q('.gj-ms-item.L.linked[data-id="' + l.id + '"]'));
    if (left) { const L = q('.gj-ms-item.L[data-id="' + left.id + '"]'); if (!L.classList.contains('sel')) L.click(); return q('.gj-ms-item.R[data-id="' + c.pairs[left.id] + '"]').click(); }
  }
  b = q('[data-g="check"]') || q('[data-s2="step"]') || q('[data-s2="gap"]');
  if (live(b)) return b.click();
}
async function playToEnd(w, opt, guard = 40000) {
  const E = w.GENJI.Engine; let last = '', same = 0;
  for (let i = 0; i < guard; i++) {
    if (E._mode() === 'end') return i;
    step(w, opt); await tick(1);
    const sig = E._mode() + '/' + (E._state() || {}).node + '/' + w.document.querySelectorAll('.gj-ms-item.linked, [data-s2].done, .gj-fb').length;
    if (sig === last) { if (++same > 400) throw new Error('進みません: ' + sig); } else { same = 0; last = sig; }
  }
  throw new Error('結末に届きません: ' + E._mode() + ' ' + (E._state() || {}).node);
}

test('表紙に帖が並び、目次から段を選べる', () => {
  const w = boot(), d = w.document, G = w.GENJI;
  assert.equal(G.Engine._mode(), 'title');
  assert.equal(G.chapterOrder.join(), 'kiritsubo,wakamurasaki');
  assert.ok(d.querySelector('.gj-chap[data-ch="kiritsubo"]') && d.querySelector('.gj-chap[data-ch="wakamurasaki"]'));
  d.querySelector('.gj-chap[data-ch="kiritsubo"]').click();
  assert.equal(d.querySelectorAll('.gj-acts [data-gj="jump"]').length, G.chapters.kiritsubo.acts.length, '授業モードでは全段を開ける');
  assert.equal(G.Engine.stageName(), '絵巻（軽量）');
});

for (const id of ['kiritsubo', 'wakamurasaki']) {
  test(id + '：はじめから本文どおりの結末まで通る（授業モード）', async () => {
    const w = boot(), E = w.GENJI.Engine, ch = w.GENJI.chapters[id];
    E.start(id);
    await playToEnd(w);
    const st = E._state(), cm = E._meta().ch[id];
    assert.equal(ch.endings[st.ending || Object.keys(cm.endings)[0]].kind, 'true', '本文どおりの結末');
    assert.equal(Object.keys(cm.gen).length, ch.genbun.length, '原文の段がすべて綴じられる');
    ch.acts.forEach((a) => assert.ok(cm.cleared[a.id], a.id + ' を読み終えた'));
    assert.ok(w.document.querySelector('.gj-end'), '結末とふり返りの画面');
    assert.ok(JSON.parse(w.localStorage.getItem(KEY)).ch[id], '保存される');
  });
}

test('授業モード：読解は一度目にヒントで読み直し、二度目に解説。読解率は一度目で数える', async () => {
  const w = boot(), E = w.GENJI.Engine, d = w.document;
  E.start('kiritsubo', 'k1');
  for (let i = 0; i < 400 && !(E._mode() === 'ask' && ['read', 'subject', 'keigo'].includes(E._cur().k)); i++) { step(w); await tick(1); }
  const n = E._cur();
  assert.ok(n && n.hint && n.exp);
  const wrong = n.o.findIndex((o) => !o.ok), right = n.o.findIndex((o) => o.ok);
  d.querySelector('.gj-opt[data-i="' + wrong + '"]').click();
  assert.ok(d.querySelector('.gj-fb.retry'), '読み直しの表示');
  assert.ok(d.querySelector('.gj-hint'), 'ヒントが出る');
  assert.equal(E._mode(), 'ask', 'まだ同じ問い');
  d.querySelector('.gj-opt[data-i="' + right + '"]').click();
  assert.ok(d.querySelector('.gj-fb.ok'), '解説が出る');
  assert.equal(E._state().q, 1, '問いを一つ数える');
  assert.equal(E._state().ok, 0, '読解率は一度目の答えで数える（誤り）');
});

test('保存と再開：途中でやめても同じ所から続けられる', async () => {
  const w = boot(), E = w.GENJI.Engine;
  E.start('wakamurasaki');
  for (let i = 0; i < 60; i++) { step(w); await tick(1); }
  const at = E._state().node, act = E._state().act;
  E.title();
  const saved = JSON.parse(w.localStorage.getItem(KEY));
  const w2 = boot(saved), E2 = w2.GENJI.Engine;
  assert.ok(w2.document.querySelector('[data-gj="continue"]'), '表紙に「続きから」');
  E2.continueSave('wakamurasaki');
  assert.equal(E2._state().act, act);
  assert.equal(E2._state().node, at);
});

test('保存が使えなくても起動して遊べる', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="gj-stage"></div><div id="gj-ui"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
  w.GENJI_NO_AUTOBOOT = true; w.scrollTo = () => {};
  SCRIPTS.forEach((f) => w.eval(fs.readFileSync(path.join(root, f), 'utf8')));
  w.GENJI.Engine.boot();
  w.GENJI.Engine.start('kiritsubo');
  for (let i = 0; i < 30; i++) { step(w); await tick(1); }
  assert.ok(w.GENJI.Engine._state().node, '進められる');
});

test('架空の帖：全ノード種別・分岐・遊びを通る', async () => {
  const w = boot(null, ['tests/fixtures/chapter.js']), E = w.GENJI.Engine;
  E.start('tameshi');
  await playToEnd(w);
  assert.ok(w.document.querySelector('.gj-end'));
});

test('原文帳と図鑑が開ける', () => {
  const w = boot(), d = w.document;
  d.querySelector('.gj-chap[data-ch="kiritsubo"]').click();
  [...d.querySelectorAll('[data-gj="book"]')].pop().click();
  assert.ok(d.querySelector('.gj-book .gj-gen-text'), '原文帳');
  d.querySelector('.gj-book [data-st="layer"][data-l="hinshi"]').click();
  assert.ok(d.querySelector('.gj-book .gj-tok'), '品詞分解の層');
  d.querySelector('.gj-book [data-st="zukan"]').click();
  assert.ok(d.querySelector('.gj-zk-item'), '図鑑の項目');
});

test('履歴：これまでの文・段の見出し・問いと自分の答えが残り、読み返せる', async () => {
  const w = boot(), E = w.GENJI.Engine, d = w.document;
  E.start('kiritsubo', 'k1');
  for (let i = 0; i < 400 && !(E._mode() === 'ask' && ['read', 'subject', 'keigo'].includes(E._cur().k)); i++) { step(w); await tick(1); }
  const n = E._cur();
  d.querySelector('.gj-opt[data-i="' + n.o.findIndex((o) => !o.ok) + '"]').click();
  d.querySelector('.gj-opt[data-i="' + n.o.findIndex((o) => o.ok) + '"]').click();
  const log = E._state().log;
  assert.ok(log.some((l) => l[3] === 'act'), '段の見出し');
  assert.ok(log.some((l) => l[3] === 'q' && l[1] === n.q), '問い');
  assert.equal(JSON.stringify(log.filter((l) => l[3] === 'a').slice(-2).map((l) => l[4])), '[0,2]', '一度目の誤り・読み直しての正解');
  d.querySelector('[data-gj="log"]').click();
  assert.ok(d.querySelector('.gj-modal .gj-log-q') && d.querySelector('.gj-modal .gj-log-a.ng') && d.querySelector('.gj-modal .gj-log-a.re'), '履歴の画面');
  assert.ok(E._meta().ch.kiritsubo.stat.k1, '段ごとの読解が記録される');
});

test('古い記録（段ごとの読解・履歴の種類がない）でも、目次と続きが開ける', () => {
  const old = { v: 1, settings: { view: '2d', big: false, instant: true, ruby: true, sound: false, classroom: true },
    ch: { kiritsubo: { gen: { k01: 1 }, cleared: { k0: 1 }, endings: {}, missed: {}, q: 3, ok: 2, save: { ch: 'kiritsubo', node: 'k1#0', act: 'k1', meters: {}, flags: {}, q: 1, ok: 1, picks: [], log: [['', '前の文', 0]], phase: null, met: {}, hinted: {}, seed: 1 } } }, last: 'kiritsubo' };
  const w = boot(old), E = w.GENJI.Engine, d = w.document;
  assert.ok(d.querySelector('[data-gj="continue"]'), '続きから');
  d.querySelector('.gj-chap[data-ch="kiritsubo"]').click();
  assert.ok(d.querySelector('.gj-acts'), '目次');
  E.continueSave('kiritsubo');
  assert.equal(E._state().node, 'k1#0');
});

test('和歌は上の句・下の句の二行に組む', () => {
  const w = boot(), U = w.GENJI.UI;
  const s = (x) => { const r = U.wakaSplit(x); return r && r.kami.map((u) => u.b).join('') + '/' + r.shimo.map((u) => u.b).join(''); };
  assert.equal(s('「限りとて別るる道の悲しきにいかまほしきは命なりけり」'), '限りとて別るる道の悲しきに/いかまほしきは命なりけり');
  assert.equal(s('「{初草|はつくさ}の若葉の上を見つるより旅寝の袖も露ぞ{乾|かわ}かぬ」'), '初草の若葉の上を見つるより/旅寝の袖も露ぞ乾かぬ');
  assert.equal(U.wakaSplit('「雀の子を犬君が逃がしつる。」'), null, '歌でない台詞は分けない');
});

test('結末：学習記録（コピー用の文）に読解率・読み・ふり返りが入る', async () => {
  const w = boot(null, ['tests/fixtures/chapter.js']), E = w.GENJI.Engine;
  E.start('tameshi');
  await playToEnd(w);
  const t = w.GENJI.UI.summaryText();
  assert.match(t, /読解率/);
  assert.match(t, /ふり返り/);
  assert.ok(w.document.querySelector('.gj-end [data-gj="copy"]') && w.document.querySelector('.gj-end [data-gj="print"]'));
});
