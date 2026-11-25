// 実際のブラウザー（Chromium）で画面を開く確認。実行: npm run test:browser
// 表紙 → 帖を選ぶ → 数ノード進める、を PC 幅とスマホ縦（390×844）で行い、コンソールエラーが 0 であることを確かめる。
// あわせて tests/fixtures の架空の帖を最後まで通し、全ノード種別・遊び（絵巻の wataru / kaimami を含む）が完走することを見る。
// 帖データがまだ無いときは、fixtures の帖だけで動かす。SKIP_3D=1 で 3D の確認を省く。
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const page = 'file://' + path.resolve(__dirname, '..', process.argv[2] || 'index.html');
const FIXTURE = path.resolve(__dirname, 'fixtures', 'chapter.js');
const KEY = 'genji:v1';

async function open(browser, viewport, view) {
  const p = await browser.newPage({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  // 3D は CI（GPU なしのソフトウェア描画）で 1 コマ数秒かかる。押す操作の待ちを長めにとる（実機の速さとは別）
  if (view === '3d') p.setDefaultTimeout(120000);
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // 別の担当が作成中のファイルが無いときの「読み込めない」は数えない（それでも起動することを見る）
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.addInitScript(([key, view]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 1, settings: { view, big: false, instant: true, ruby: true, sound: false, classroom: true }, ch: {} }));
  }, [KEY, view]);
  await p.goto(page);
  await p.waitForFunction(() => window.GENJI && window.GENJI.Engine && window.GENJI.Engine._mode() === 'title');
  const real = await p.evaluate(() => window.GENJI.chapterOrder.slice());
  await p.addScriptTag({ path: FIXTURE });
  await p.evaluate(() => window.GENJI.Engine.title());
  return { p, errors, real };
}

/** 一手進める：札 → 次へ → 選択肢 → 遊び、の順に押せるものを押す。 */
const STEP = () => {
  const E = window.GENJI.Engine, vis = (s) => [...document.querySelectorAll(s)].find((e) => e.offsetParent && !e.disabled);
  if (E._mode() === 'card') return document.querySelector('.gj-card').click();
  let b = vis('.gj-panel .gj-next') || vis('[data-g="done"]');
  if (b) return b.click();
  const n = E._cur();
  if (E._mode() === 'ask' && n) {
    const i = n.o.findIndex((o) => o.ok), pickI = i >= 0 ? i : 0;
    b = document.querySelector('.gj-opt[data-i="' + pickI + '"]');
    if (b && !b.disabled) return b.click();
  }
  if (vis('.gj-musubi')) {
    const c = n.cfg, left = c.left.find((l) => !document.querySelector('.gj-ms-item.L.linked[data-id="' + l.id + '"]'));
    if (left) { const L = document.querySelector('.gj-ms-item.L[data-id="' + left.id + '"]'); if (!L.classList.contains('sel')) L.click(); return document.querySelector('.gj-ms-item.R[data-id="' + c.pairs[left.id] + '"]').click(); }
  }
  b = vis('[data-g="check"]') || vis('[data-s2="step"]') || vis('[data-s2="gap"]');
  if (b) return b.click();
  b = vis('[data-a3="peek"]');
  if (b) return b.click();
  // 3D の遊び：補助ボタン（自動で歩く・手がかり）で進める
  b = vis('[data-a3="auto"]');
  if (b && !b.classList.contains('gj3-on')) return b.click();
};
async function play(p, until, guard = 700) {
  for (let i = 0; i < guard; i++) {
    if (await p.evaluate(until)) return i;
    await p.evaluate(STEP);
    // 3D の遊びの最中は、歩く・目をとめる時間を待つ
    await p.waitForTimeout(await p.evaluate(() => !!(window.GENJI.Stage3D && window.GENJI.Stage3D._state && window.GENJI.Stage3D._state.act)) ? 300 : 40);
  }
  throw new Error('進みませんでした: mode=' + await p.evaluate(() => window.GENJI.Engine._mode() + ' node=' + (window.GENJI.Engine._state() || {}).node));
}
const rect = (p, s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; });

async function story(browser, name, viewport, view) {
  const { p, errors, real } = await open(browser, viewport, view);
  const phone = viewport.width < 600;
  assert.ok(await p.isVisible('.gj-title h1'), name + ': 表紙が出る');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ': 表紙が横にはみ出さない');
  const stageKind = await p.evaluate(() => window.GENJI.Engine.stageName());
  const check = async (label) => {
    // 文字の窓は画面内。スマホでは下 4 割以内。ボタンは 44px 以上
    if (!(await p.isVisible('.gj-panel'))) return;
    const r = await rect(p, '.gj-panel');
    assert.ok(r.bottom <= viewport.height + 1 && r.left >= -1 && r.right <= viewport.width + 1, name + ': ' + label + ' 窓が画面内');
    if (phone) assert.ok(r.h <= viewport.height * 0.4 + 2, name + ': ' + label + ' 窓は画面の 4 割以内（' + Math.round(r.h) + 'px）');
    const small = await p.$$eval('.gj-panel button', (bs) => bs.filter((b) => b.offsetParent && b.getBoundingClientRect().height < 43.5).map((b) => b.className + ':' + Math.round(b.getBoundingClientRect().height)));
    assert.deepEqual(small, [], name + ': ' + label + ' タップ領域は 44px 以上');
  };

  // 本物の帖：表紙 → 帖 → はじめから → 数ノード
  for (const id of real) {
    await p.click('.gj-chap[data-ch="' + id + '"]');
    assert.ok(await p.isVisible('.gj-acts'), name + ': ' + id + ' の目次');
    await p.click('[data-gj="start"]');
    let seen = 0;
    for (let i = 0; i < 14; i++) {
      await p.evaluate(STEP); await p.waitForTimeout(60);
      const m = await p.evaluate(() => window.GENJI.Engine._mode());
      if (/say|ask|gen|feedback/.test(m)) { seen++; await check(id + ' ' + m); }
    }
    assert.ok(seen >= 3, name + ': ' + id + ' を数ノード進められる');
    assert.ok(await p.evaluate((k) => !!JSON.parse(localStorage.getItem(k)).ch, KEY), name + ': 保存される');
    await p.evaluate(() => window.GENJI.Engine.title());
    assert.ok(await p.isVisible('[data-gj="continue"]'), name + ': 表紙に「続きから」');
  }

  // 架空の帖を最後まで
  await p.click('.gj-chap[data-ch="tameshi"]');
  await p.click('[data-gj="start"]');
  await play(p, () => window.GENJI.Engine._mode() === 'say');
  await check('台詞');
  if (!phone) { await p.keyboard.press('Enter'); }
  // 文字を隠す → 戻す
  await p.click('[data-gj="hide"]');
  assert.equal(await p.isVisible('.gj-panel'), false, name + ': 文字を隠すと窓が消える');
  await p.click('[data-gj="reveal"]');
  assert.ok(await p.isVisible('.gj-panel'), name + ': 文字を表示で戻る');
  // 原文の段：層を重ねる
  await play(p, () => window.GENJI.Engine._mode() === 'gen');
  await check('原文の段');
  await p.click('.gj-panel [data-st="layer"][data-l="hinshi"]');
  assert.ok(await p.isVisible('.gj-panel .gj-tok'), name + ': 品詞分解の層');
  await p.click('.gj-panel [data-st="layer"][data-l="keigo"]');
  assert.ok(await p.isVisible('.gj-panel .gj-u-k'), name + ': 敬語の層');
  // 読解：一度目はヒント、二度目に解説
  await play(p, () => window.GENJI.Engine._mode() === 'ask');
  await check('問い');
  if (!phone) {
    const wm = await p.$eval('.gj-stem', (e) => getComputedStyle(e).writingMode);
    assert.equal(wm, 'vertical-rl', name + ': 広い画面では問う原文が縦書き');
    await p.keyboard.press('2');   // 画面の二番目の選択肢
    assert.notEqual(await p.evaluate(() => window.GENJI.Engine._state().phase), null, name + ': 数字キーで選べる');
    await p.evaluate(() => { const E = window.GENJI.Engine, s = E._state(); if (E._mode() !== 'ask') E._go(s.node); else { s.phase = null; E._go(s.node); } });
    await p.waitForFunction(() => window.GENJI.Engine._mode() === 'ask');
  }
  await p.click('.gj-opt[data-i="2"]');
  assert.ok(await p.isVisible('.gj-fb.retry'), name + ': 授業モードの読み直し');
  assert.ok(await p.isVisible('.gj-hint'), name + ': ヒントが出る');
  await p.click('.gj-opt[data-i="0"]');
  assert.ok(await p.isVisible('.gj-fb.ok'), name + ': 解説が出る');
  await check('解説');
  // 敬語：矢印の帯
  await play(p, () => window.GENJI.Engine._state().node === 'q-keigo' && window.GENJI.Engine._mode() === 'feedback');
  assert.ok(await p.isVisible('.gj-arrow'), name + ': 敬意の方向の帯');
  if (stageKind !== '3D') assert.ok(await p.$('.gj-s2-arrow'), name + ': 絵巻の舞台に矢印');
  await check('敬語の解説');
  // 遊びを通って結末へ
  await play(p, () => window.GENJI.Engine._state().node === 'g-narabe');
  await check('並べ替え');
  await play(p, () => window.GENJI.Engine._state().node === 'g-musubi');
  await check('結ぶ');
  await p.click('.gj-ms-item.L[data-id="l1"]');
  await p.click('.gj-ms-item.R[data-id="r1"]');
  assert.equal(await p.textContent('.gj-ms-item.R[data-id="r1"] .gj-ms-n'), '1', name + ': 左右の札を一回ずつ押すと結べる');
  await play(p, () => window.GENJI.Engine._state().node === 'g-kaimami');
  if (stageKind === '3D') {
    await play(p, () => window.GENJI.Engine._mode() === 'game' && document.querySelector('.gj3-kaimami-controls:not([hidden])'));
    await p.getByRole('button', { name: '右を見る' }).click();
    assert.match(await p.textContent('.gj3-kaimami-controls .gj3-hint'), /輪が光ったら/);
  }
  await play(p, () => window.GENJI.Engine._mode() === 'end');
  assert.ok(await p.isVisible('.gj-end'), name + ': 結末とふり返り');
  assert.match(await p.textContent('.gj-end'), /春の終わり/, name + ': 本文どおりの結末');
  // 原文帳・図鑑・設定
  await p.click('.gj-end [data-gj="book"]');
  assert.ok(await p.isVisible('.gj-book .gj-gen-text'), name + ': 原文帳');
  await p.click('.gj-book [data-st="zukan"]');
  assert.ok(await p.isVisible('.gj-zk-item'), name + ': 図鑑の項目');
  await p.click('[data-gj="modalback"]');
  await p.click('[data-gj="closemodal"]');
  await p.click('.gj-end [data-gj="title"]');
  await p.click('.gj-screen [data-gj="settings"]');   // 上の帯にも同じボタンがある（表紙では隠れている）
  await p.click('[data-gj="set"][data-k="big"]');
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('gj-big')), name + ': 文字を大きく');
  await p.click('[data-gj="closemodal"]');
  assert.deepEqual(errors, [], name + ': エラーなし');
  await p.close();
  console.log('✔ ' + name + '（舞台：' + stageKind + '、本物の帖 ' + real.length + '）');
}

(async () => {
  const browser = await chromium.launch();
  try {
    await story(browser, 'PC 1280×800・絵巻', { width: 1280, height: 800 }, '2d');
    await story(browser, 'スマホ縦 390×844・絵巻', { width: 390, height: 844 }, '2d');
    if (!process.env.SKIP_3D) {
      await story(browser, 'PC 1280×800・3D（無ければ絵巻に落ちる）', { width: 1280, height: 800 }, '3d');
      await story(browser, 'スマホ縦 390×844・3D（無ければ絵巻に落ちる）', { width: 390, height: 844 }, '3d');
    }
    console.log('✔ browser-smoke OK');
  } finally { await browser.close(); }
})().catch((e) => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
