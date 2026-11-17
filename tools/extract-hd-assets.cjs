#!/usr/bin/env node
/* 姉妹作「鴻門の会」（-koumonnokai-）の頭部・手のデータから、源氏物語の 3D 人物に要る分だけを抜き出して
 * src/js/stage3d-hd-assets.js を作る。元は Blender Studio「Human Base Meshes v1.2.0」（CC0）由来。
 * 出典は docs/KOUSHOU-3D.md と docs/assets/manifest.csv（鴻門の会）。
 *
 *   node tools/extract-hd-assets.cjs [鴻門の会のフォルダ]
 *     既定: ../sakadosoutan-boop/-koumonnokai- → 見つからなければ /home/user/sakadosoutan-boop/-koumonnokai-
 *
 * 抜き出すもの（鴻門の会の id → こちらでの役）
 *   gu   → female（女性・少女・童・幼子の頭。白粉の肌と引眉は実行時に塗る）
 *   ryo  → young（若い男：光源氏・惟光など）
 *   chin → adult（髭のある壮年：帝・上達部）。口ひげ・あごひげの beard も
 *   zo   → elder（老いた顔：僧都・聖。剃髪なので髪・髭は使わない）
 * 縮め方
 *   - 法線は持たない（読み込んだ側で computeVertexNormals する）。
 *   - 男の頭 3 つは同じ網目（頂点の並び）なので、三角形の並び（index）を 1 つだけ持つ（ryo のもの）。
 *   - 髪の網目は持たない（髪は頭皮の形から手続きで作る）。眉は男の分だけ。
 *   - 手は鴻門の会の KM_HAND_ASSETS をそのまま（low / high、11 の形）。
 * 平安の女性・子どもの頭（lady / woman / ama / girl。tools/build-heian-heads.py が Blender で作って同じファイルへ書き込む）は、
 * いまのファイルにあればそのまま引き継ぐ（heads の from === 'heian'、indices の hf_*、uvs、tex、heian）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const cands = [process.argv[2], path.resolve(root, '../sakadosoutan-boop/-koumonnokai-'), '/home/user/sakadosoutan-boop/-koumonnokai-'].filter(Boolean);
const src = cands.find((p) => fs.existsSync(path.join(p, 'src/js/koumon-head-assets.js')));
if (!src) { console.error('✖ 鴻門の会のフォルダが見つかりません: ' + cands.join(' / ')); process.exit(1); }

function load(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(src, 'src/js', file), 'utf8'), ctx, { filename: file });
  return ctx.window[name];
}
const H = load('koumon-head-assets.js', 'KM_HEAD_ASSETS');
const HANDS = load('koumon-hand-assets.js', 'KM_HAND_ASSETS');
if (!H || !H.cast || !HANDS) { console.error('✖ 頭部・手のデータを読めません'); process.exit(1); }

const out = { version: 1, source: H.source + ' / via -koumonnokai- (MIT)', license: 'CC0-1.0 (meshes)', quantization: H.quantization,
  indexEncoding: H.indexEncoding, indices: {}, heads: {}, hands: HANDS };
function idx(key) { if (!out.indices[key]) out.indices[key] = H.indices[key]; return key; }
function part(d, iKey) {
  const o = { v: d.v, t: d.t, p: d.p, i: idx(iKey || d.i), encoding: { p: d.encoding && d.encoding.p } };
  if (d.c) { o.c = d.c; o.encoding.c = d.encoding && d.encoding.c; }
  return o;
}
const MALE_SKIN = { high: H.cast.ryo.lod.high.skin.i, low: H.cast.ryo.lod.low.skin.i };
const PICK = {
  female: { from: 'gu', parts: ['skin'] },
  young: { from: 'ryo', parts: ['skin', 'brow'], male: true },
  adult: { from: 'chin', parts: ['skin', 'brow', 'beard'], male: true },
  elder: { from: 'zo', parts: ['skin'], male: true }
};
for (const role in PICK) {
  const P = PICK[role], c = H.cast[P.from], head = { from: P.from, skin: c.skin, age: c.age, gender: c.gender || 'male', anchors: c.anchors, lod: {} };
  for (const q of ['high', 'low']) {
    head.lod[q] = {};
    for (const k of P.parts) {
      const d = c.lod[q][k]; if (!d) continue;
      head.lod[q][k] = part(d, P.male && k === 'skin' ? MALE_SKIN[q] : null);
    }
  }
  out.heads[role] = head;
}
/* 平安の頭を引き継ぐ */
const file0 = path.join(root, 'src/js/stage3d-hd-assets.js');
if (fs.existsSync(file0)) {
  const ctx2 = { window: {} }; vm.createContext(ctx2);
  try { vm.runInContext(fs.readFileSync(file0, 'utf8'), ctx2); } catch (e) { ctx2.window = {}; }
  const old = ctx2.window.GJ3_HD_ASSETS;
  if (old && old.heads) {
    for (const k in old.heads) if (old.heads[k].from === 'heian') out.heads[k] = old.heads[k];
    for (const k in old.indices || {}) if (k.startsWith('hf_')) out.indices[k] = old.indices[k];
    if (old.uvs) out.uvs = old.uvs; if (old.tex) out.tex = old.tex; if (old.heian) out.heian = old.heian;
  }
}
const body = '/* 自動生成: tools/extract-hd-assets.cjs（手で直さない）。\n * 頭部・手の網目は Blender Studio「Human Base Meshes v1.2.0」（CC0）由来。姉妹作「鴻門の会」（MIT）の調整を経たもの。\n * 平安の女性・子どもの頭（heads.lady/woman/ama/girl）は tools/build-heian-heads.py が同じ素材から作って書き足す。\n * 読み込みは stage3d-hd.js が表紙のあとに裏で行う。 */\nwindow.GJ3_HD_ASSETS=' + JSON.stringify(out) + ';\n';
const file = path.join(root, 'src/js/stage3d-hd-assets.js');
fs.writeFileSync(file, body);
console.log('✔ ' + path.relative(root, file) + '  ' + (Buffer.byteLength(body) / 1048576).toFixed(2) + ' MB  （頭: ' + Object.keys(out.heads).join(', ') + '、index ' + Object.keys(out.indices).length + ' 本）');
