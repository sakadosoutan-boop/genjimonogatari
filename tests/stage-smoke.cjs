// 3D 舞台（GENJI.Stage3D）だけを実ブラウザーで確かめる。実行: node tests/stage-smoke.cjs （数分かかる）
// tools/stage-preview.html を file:// で開き、次を見る。
//   - 高精細の人物のデータ（stage3d-hd-assets.js）が表紙のあとに裏で届き、人物が差し替わる（file:// でも）
//   - 8 つの舞台 × 光で描け、真っ白・真っ黒にならない。コンソールのエラーが 0
//   - 全人物 × stage-spec.js の全姿勢を高精細版で作れる。寄り（focus）で顔が文字の窓（下 4 割）より上に来る
//   - 画質 lite では簡素な人形のまま。遊び（wataru・kaimami）が最後まで進む
//   - 女性・子どもは新しい頭（lady / woman / ama / girl。tools/build-heian-heads.py）で、肌の画像・まつ毛・まぶたの開き角がそろう。データは 8MB 以下
//   - 一枚 HTML（dist/index.html）でも、埋め込んだデータから高精細の人物を作れる
// QUICK=1 で舞台と姿勢の組み合わせを減らす。
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const PREVIEW = 'file://' + path.join(root, 'tools/stage-preview.html');
const QUICK = !!process.env.QUICK;

async function open(browser, viewport, qs) {
  const p = await browser.newPage({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(PREVIEW + '?' + qs);
  await p.waitForFunction(() => window.GENJI && window.GENJI.Stage3D && window.GENJI.Stage3D._state.scene);
  return { p, errors };
}
const hdReady = (p) => p.waitForFunction(() => window.GENJI.S3H && window.GENJI.S3H.loaded(), null, { timeout: 90000 });

async function stages(browser) {
  const { p, errors } = await open(browser, { width: 1280, height: 800 }, 'stage=kiritsubo&bare=1');
  await hdReady(p);
  await p.waitForTimeout(400);
  const swapped = await p.evaluate(() => { const S = window.GENJI.Stage3D._state; return S.order.every((k) => S.figs[k].every((f) => f.hd)); });
  assert.ok(swapped, '届いたあと、いまの舞台の人物が高精細版に差し替わる');
  const spec = await p.evaluate(() => ({ stages: Object.keys(window.GENJI.stageSpec.stages), lights: window.GENJI.stageSpec.lights }));
  const lights = QUICK ? ['day', 'night'] : spec.lights;
  for (const st of spec.stages) {
    for (const lt of (st === 'kokyu' || st === 'kitayama' ? ['day'] : lights)) {
      const r = await p.evaluate(([st, lt]) => {
        const P = window.__preview.PRESET[st] || [];
        window.GENJI.Stage3D.setScene({ stage: st, light: lt, season: 'spring', cast: P });
        const pr = window.GENJI.Stage3D._probe();
        const S = window.GENJI.Stage3D._state;
        return { pr, hd: S.order.every((k) => S.figs[k].every((f) => f.hd)), n: P.length };
      }, [st, lt]);
      assert.ok(r.pr.sd > 6, st + '/' + lt + ': 絵が単色でない（sd=' + r.pr.sd.toFixed(1) + '）');
      assert.ok(r.pr.mean > 12 && r.pr.mean < 250, st + '/' + lt + ': 明るさが極端でない（' + r.pr.mean.toFixed(0) + '）');
      assert.equal(r.pr.figs, r.n, st + ': 配役の数だけ人物がいる');
      assert.ok(r.hd, st + ': 人物は高精細版');
    }
  }
  assert.deepEqual(errors, [], '舞台めぐり: エラーなし');
  await p.close();
  console.log('✔ 8 つの舞台 × 光（高精細の人物）');
}

async function figures(browser, viewport, label) {
  const { p, errors } = await open(browser, viewport, 'stage=kiritsubo&bare=1&cast=koui:kami');
  await hdReady(p);
  const ids = await p.evaluate(() => Object.keys(window.GENJI.chars).filter((k) => window.GENJI.chars[k].look));
  const poses = await p.evaluate(() => window.GENJI.stageSpec.poses);
  for (const id of ids) {
    const r = await p.evaluate(([id, poses, quick]) => {
      const St = window.GENJI.Stage3D, S = St._state;
      St.setScene({ stage: 'kiritsubo', light: 'day', cast: [{ id: id, at: 'naka' }, { id: id === 'koui' ? 'mikado' : 'koui', at: 'kamiR' }] });
      const f = S.figs[id][0], out = { hd: !!f.hd, poses: [] };
      (quick ? poses.slice(0, 4) : poses).forEach((ps) => { St.pose(id, ps); for (let i = 0; i < 4; i++) f.update(0.1, i * 0.1); out.poses.push(f.pose); });
      St.pose(id, 'sit'); St.focus(id); St.speak(id);
      for (let i = 0; i < 90; i++) { S.figs[id].forEach((g) => g.update(0.05, i * 0.05)); }
      const pr = St._probe();
      /* 寄ったときの顔の位置：画面の上 6 割の中、左右も画面の内側 */
      const v = new THREE.Vector3(); f.headWorld(v); v.project(S.camera);
      const x = (v.x + 1) / 2 * S.w, y = (1 - v.y) / 2 * S.h;
      return Object.assign(out, { x, y, w: S.w, h: S.h, panel: S.panel, sd: pr.sd, jaw: f.head && f.head.jaw ? 1 : 0 });
    }, [id, poses, QUICK]);
    assert.ok(r.hd, label + ' ' + id + ': 高精細版');
    assert.equal(r.poses.length, QUICK ? 4 : poses.length, label + ' ' + id + ': 姿勢');
    assert.ok(r.y > 0 && r.y < r.h * (1 - r.panel), label + ' ' + id + ': 寄りの顔は文字の窓より上（y=' + Math.round(r.y) + '）');
    assert.ok(r.x > 0 && r.x < r.w, label + ' ' + id + ': 寄りの顔は画面の内側');
    assert.ok(r.sd > 6, label + ' ' + id + ': 寄りの絵が単色でない');
  }
  assert.deepEqual(errors, [], label + ': エラーなし');
  await p.close();
  console.log('✔ ' + label + '：全人物 × 全姿勢・寄り（' + ids.length + ' 人）');
}

async function heian(browser) {
  const fs = require('node:fs');
  const mb = fs.statSync(path.join(root, 'src/js/stage3d-hd-assets.js')).size / 1048576;
  assert.ok(mb < 8, '裏読み込みのデータは 8MB 以下（' + mb.toFixed(2) + ' MB）');
  const { p, errors } = await open(browser, { width: 1280, height: 800 }, 'stage=kiritsubo&bare=1&cast=koui:kami');
  await hdReady(p);
  const WANT = { koui: 'lady', fujitsubo: 'lady', kokiden: 'lady', nyobo: 'lady', haha: 'woman', shonagon: 'woman', amagimi: 'ama', murasaki: 'girl', inuki: 'girl', wakamiya: 'girl', ichinomiya: 'girl' };
  for (const id of Object.keys(WANT)) {
    await p.evaluate((id) => { const St = window.GENJI.Stage3D; St.setScene({ stage: 'kiritsubo', light: 'day', cast: [{ id: id, at: 'naka' }] }); St.focus(id); }, id);
    await p.waitForFunction((id) => { const f = window.GENJI.Stage3D._state.figs[id][0]; let ok = true; f.root.traverse((o) => { const im = o.isMesh && o.material && o.material.map && o.material.map.image; if (im && im.tagName === 'IMG' && !im.complete) ok = false; }); return ok; }, id, { timeout: 20000 });
    const r = await p.evaluate((id) => {
      const S = window.GENJI.Stage3D._state, f = S.figs[id][0];
      for (let i = 0; i < 40; i++) f.update(0.05, i * 0.05);
      const h = f.head, skin = h.skin, lash = h.lids.filter((l) => l.children.length).length;
      return { role: f.headLook.role, uv: !!skin.geometry.attributes.uv, map: !!(skin.material.map && skin.material.map.image && skin.material.map.image.width >= 512), lids: h.lids.length, lash, open: h.open, sd: window.GENJI.Stage3D._probe().sd };
    }, id);
    assert.equal(r.role, WANT[id], id + ': 頭は ' + WANT[id]);
    assert.ok(r.uv && r.map, id + ': 肌の画像（UV つき）');
    assert.equal(r.lids, 2, id + ': まぶた 2 つ'); assert.equal(r.lash, 2, id + ': まつ毛 2 つ');
    assert.ok(r.open < -0.2 && r.open > -0.8, id + ': まぶたの開き角（' + r.open + '）');
    assert.ok(r.sd > 6, id + ': 絵が単色でない');
  }
  assert.deepEqual(errors, [], '新しい頭: エラーなし');
  await p.close();
  console.log('✔ 女性・子どもの新しい頭（' + Object.keys(WANT).length + ' 人。データ ' + mb.toFixed(2) + ' MB）');
}

async function lite(browser) {
  const { p, errors } = await open(browser, { width: 1280, height: 800 }, 'stage=soubou&bare=1&q=lite');
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const S = window.GENJI.Stage3D._state; return { q: S.q, hd: S.order.some((k) => S.figs[k].some((f) => f.hd)), sd: window.GENJI.Stage3D._probe().sd }; });
  assert.equal(r.q, 'lite'); assert.equal(r.hd, false, '画質 lite は簡素な人形'); assert.ok(r.sd > 6);
  assert.deepEqual(errors, []);
  await p.close();
  console.log('✔ 画質 lite（簡素な人形）');
}

async function activities(browser, viewport, label) {
  const { p, errors } = await open(browser, viewport, 'stage=soubou&light=dusk&bare=1&q=low&auto=150');
  await hdReady(p);
  for (const act of ['kaimami', 'wataru']) {
    await p.evaluate((a) => { window.__done = null; document.getElementById(a === 'kaimami' ? 'act2' : 'act1').click(); }, act);
    const t0 = Date.now();
    while (!(await p.evaluate(() => window.__done))) {
      if (Date.now() - t0 > 600000) throw new Error(label + ' ' + act + ' が終わらない');
      await p.evaluate(() => { const b = [...document.querySelectorAll('[data-a3="auto"]')].find((e) => e.offsetParent && !e.classList.contains('gj3-on')); if (b) b.click(); });
      await p.waitForTimeout(500);
    }
    const r = await p.evaluate(() => window.__done);
    assert.ok(r.ok, label + ' ' + act + ': 完走');
    if (act === 'kaimami') assert.ok(r.found >= 1, label + ': 垣間見で人を見つけた');
  }
  assert.deepEqual(errors, [], label + ' 遊び: エラーなし');
  await p.close();
  console.log('✔ ' + label + '：遊び（kaimami・wataru）');
}

async function dist(browser) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('file://' + path.join(root, 'dist/index.html'));
  await p.waitForFunction(() => window.GENJI && window.GENJI.S3H);
  const ok = await p.evaluate(() => window.GENJI.S3H.ready());
  assert.ok(ok, 'dist: 埋め込んだデータから読み込める');
  const hd = await p.evaluate(() => { const f = window.GENJI.S3F.make('fujitsubo', { pose: 'sit' }); const r = !!f.hd; f.dispose(); return r; });
  assert.ok(hd, 'dist: 高精細の人物を作れる');
  assert.deepEqual(errors, [], 'dist: エラーなし');
  await p.close();
  console.log('✔ 一枚 HTML（dist）でも高精細の人物');
}

(async () => {
  const browser = await chromium.launch();
  try {
    await stages(browser);
    await heian(browser);
    await figures(browser, { width: 1280, height: 800 }, 'PC 1280×800');
    await figures(browser, { width: 390, height: 844 }, 'スマホ縦 390×844');
    await lite(browser);
    if (!process.env.SKIP_ACT) await activities(browser, { width: 1280, height: 800 }, 'PC 1280×800');
    await dist(browser);
    console.log('✔ stage-smoke OK');
  } finally { await browser.close(); }
})().catch((e) => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
