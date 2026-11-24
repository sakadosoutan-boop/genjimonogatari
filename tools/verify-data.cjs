#!/usr/bin/env node
/* 帖データの静的検証。docs/CONTRACT.md の取り決めに沿っているかを調べる。
 * 実行: node tools/verify-data.cjs [帖id ...]   （省くと登録された全部） */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');

function load() {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const files = ['src/js/core.js', 'src/data/chars.js', 'src/data/stage-spec.js'];
  const dataDir = path.join(root, 'src/data');
  fs.readdirSync(dataDir).filter((f) => f.endsWith('.js') && !['chars.js', 'stage-spec.js'].includes(f))
    .sort((a, b) => (a === 'bunpo.js' ? -1 : b === 'bunpo.js' ? 1 : a.localeCompare(b)))
    .forEach((f) => files.push('src/data/' + f));
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
  return ctx.GENJI;
}

function verify(G, only) {
  const errors = [], warns = [];
  const S = G.stageSpec, chars = G.chars;
  const isChar = (id) => Object.prototype.hasOwnProperty.call(chars, id);
  const stats = {};
  const ids = (only && only.length ? only : G.chapterOrder);
  if (!ids.length) errors.push('帖が一つも登録されていません');

  Object.keys(G.bunpo).forEach((id) => {
    const b = G.bunpo[id];
    if (!b.title || !b.x) errors.push(`図鑑 ${id}: title / x がありません`);
    if (!['keigo', 'jodoshi', 'joshi', 'kogo', 'shikitari', 'waka'].includes(b.cat)) errors.push(`図鑑 ${id}: cat が不正（${b.cat}）`);
  });

  ids.forEach((cid) => {
    const ch = G.chapters[cid];
    const E = (m) => errors.push(`[${cid}] ${m}`), W = (m) => warns.push(`[${cid}] ${m}`);
    if (!ch) { errors.push(`帖 ${cid} がありません`); return; }
    ['title', 'sub', 'pov', 'povNote', 'intro'].forEach((k) => { if (!ch[k]) E(`${k} がありません`); });
    if (ch.pov && !isChar(ch.pov)) E(`pov の人物 ${ch.pov} がありません`);
    const meters = {}; (ch.meters || []).forEach((m) => { meters[m.id] = m; if (!m.name) E(`meter ${m.id}: name がありません`); });
    const gens = {}; (ch.genbun || []).forEach((g) => {
      if (gens[g.id]) E(`原文の段 ${g.id} が重複`);
      gens[g.id] = g;
      ['title', 'text', 'yaku'].forEach((k) => { if (!g[k]) E(`原文 ${g.id}: ${k} がありません`); });
      (g.keigo || []).forEach((k) => {
        if (!S.keigoKinds.includes(k.kind)) E(`原文 ${g.id}: 敬語の kind が不正（${k.kind}）`);
        [k.from, k.to].forEach((p) => { if (p && !isChar(p)) E(`原文 ${g.id}: 敬語の人物 ${p} がありません`); });
      });
      (g.hinshi || []).forEach((t) => { if (!t.s || !t.h) E(`原文 ${g.id}: hinshi は {s,h} で書く`); });
      if (g.hinshi && g.hinshi.length) {
        const joined = g.hinshi.map((t) => t.s).join('');
        const plain = G.plain(g.text).replace(/[\s　]/g, '');
        if (!plain.includes(joined.replace(/[\s　]/g, ''))) W(`原文 ${g.id}: hinshi をつなげた文が text の中に見つかりません`);
      }
      (g.bunpo || []).forEach((b) => { if (!G.bunpo[b]) E(`原文 ${g.id}: 図鑑 ${b} がありません`); });
    });
    const endings = ch.endings || {};
    if (!(ch.acts || []).length) E('acts がありません');

    const nodeIds = {}, all = [];
    (ch.acts || []).forEach((act) => {
      if (!act.id || !act.title) E('act に id / title がありません');
      if (!(act.nodes || []).length) E(`act ${act.id}: nodes が空`);
      if (!act.nodes[0] || act.nodes[0].t !== 'scene') E(`act ${act.id}: 最初のノードは scene にする`);
      (act.nodes || []).forEach((n, i) => {
        all.push({ n, where: `${act.id}#${i}${n.id ? '(' + n.id + ')' : ''}` });
        if (n.id) { if (nodeIds[n.id]) E(`ノード id ${n.id} が重複`); nodeIds[n.id] = true; }
      });
    });
    const usedGen = {}; const count = { say: 0, ask: 0, gen: 0, game: 0, scene: 0 };
    const askKinds = {};
    const target = (id, where) => { if (id && !nodeIds[id]) E(`${where}: 分岐先 ${id} がありません`); };
    const fxOk = (fx, where) => Object.keys(fx || {}).forEach((k) => { if (!meters[k]) E(`${where}: meter ${k} がありません`); });
    const slotOk = (stage, at, where) => {
      if (!at || at === 'wide' || isChar(at)) return;
      const st = S.stages[stage];
      if (!(S.commonSlots.includes(at) || (st && st.slots.includes(at)))) E(`${where}: 立ち位置 ${at} は舞台 ${stage} にありません`);
    };
    let stage = null, cast = [];
    all.forEach(({ n, where }) => {
      const t = n.t === undefined ? 'say' : n.t;
      if (n.next !== undefined) {
        if (typeof n.next !== 'string' || !n.next) E(`${where}: next は空でないノード id を指定する`);
        else target(n.next, where);
      }
      count[t] = (count[t] || 0) + 1;
      if (t === 'scene') {
        if (!S.stages[n.stage]) E(`${where}: 舞台 ${n.stage} がありません`);
        if (!S.lights.includes(n.light)) E(`${where}: light が不正（${n.light}）`);
        if (n.season && !S.seasons.includes(n.season)) E(`${where}: season が不正`);
        if (n.fade && !S.fades.includes(n.fade)) E(`${where}: fade が不正`);
        stage = n.stage; cast = [];
        (n.cast || []).forEach((c) => {
          const id = typeof c === 'string' ? c : c.id;
          if (!isChar(id)) E(`${where}: 人物 ${id} がありません`);
          cast.push(id);
          if (typeof c === 'object') { slotOk(stage, c.at, where); if (c.pose && !S.poses.includes(c.pose)) E(`${where}: 姿勢 ${c.pose} が不正`); }
        });
        /* 触れ合う姿勢：抱かれた幼子は抱く人と同じ立ち位置に。撫でる人には相手がいる（docs/CONTRACT.md「姿勢」） */
        const cs = (n.cast || []).map((c) => (typeof c === 'string' ? { id: c } : c));
        cs.filter((c) => G.chars[c.id] && G.chars[c.id].look && G.chars[c.id].look.kind === 'chigo').forEach((c) => {
          const hd = cs.filter((h) => h.pose === 'hold');
          if (hd.length && !hd.some((h) => h.at === c.at)) W(`${where}: 幼子 ${c.id} は hold の人（${hd.map((h) => h.id).join('・')}）と同じ立ち位置に置くと腕の中に抱かれる`);
        });
        if (cs.some((c) => c.pose === 'stroke') && cs.length < 2) E(`${where}: stroke（撫でる）の相手がいません`);
      } else if (t === 'say') {
        if (!n.x) E(`${where}: x がありません`);
        if (n.w && !isChar(n.w)) E(`${where}: 話し手 ${n.w} がありません`);
        if (n.b && !S.bubbles.includes(n.b)) E(`${where}: 吹き出し ${n.b} が不正`);
        if (n.fx && !S.fx.includes(n.fx)) E(`${where}: fx ${n.fx} が不正`);
        if (n.sfx && !S.sfx.includes(n.sfx)) E(`${where}: sfx ${n.sfx} が不正`);
        if (n.at) { slotOk(stage, n.at, where); if (isChar(n.at) && !cast.includes(n.at)) W(`${where}: at の人物 ${n.at} はこの場面の cast にいません`); }
        Object.keys(n.pose || {}).forEach((p) => { if (!isChar(p)) E(`${where}: pose の人物 ${p} がありません`); if (!S.poses.includes(n.pose[p])) E(`${where}: 姿勢 ${n.pose[p]} が不正`); if (!cast.includes(p)) W(`${where}: pose の人物 ${p} は cast にいません`); });
        Object.keys(n.pose || {}).forEach((p) => { if (n.pose[p] === 'stroke' && cast.length < 2) E(`${where}: stroke（撫でる）の相手がいません`); });
        if (G.plain(n.x).length > 130) W(`${where}: 一度に出す文が長い（${G.plain(n.x).length} 字）。スマホでは 130 字までが読みやすい`);
      } else if (t === 'gen') {
        if (!gens[n.g]) E(`${where}: 原文の段 ${n.g} がありません`); usedGen[n.g] = true;
      } else if (t === 'ask') {
        if (!S.askKinds.includes(n.k)) E(`${where}: ask の k が不正（${n.k}）`);
        askKinds[n.k] = (askKinds[n.k] || 0) + 1;
        if (!n.q) E(`${where}: q がありません`);
        if (!Array.isArray(n.o) || n.o.length < 2) E(`${where}: 選択肢が足りません`);
        const oks = (n.o || []).filter((o) => o.ok).length;
        if (['read', 'subject', 'keigo', 'waka'].includes(n.k)) {
          if (oks !== 1) E(`${where}: ${n.k} は正解（ok）がちょうど 1 つ（今 ${oks}）`);
          if (!n.exp) E(`${where}: 解説（exp）がありません`);
          if (!n.hint) W(`${where}: ヒント（hint）がありません`);
        }
        if (n.k === 'kokoro' && oks < 1) E(`${where}: kokoro は ok が 1 つ以上`);
        (n.o || []).forEach((o) => {
          if (n.k === 'subject') { if (!o.c || !isChar(o.c)) E(`${where}: subject の選択肢は c に人物 id`); }
          else if (!o.x) E(`${where}: 選択肢に x がありません`);
          target(o.go, where); fxOk(o.fx, where);
          if (o.rw && !isChar(o.rw)) E(`${where}: rw の人物 ${o.rw} がありません`);
        });
        if (n.bunpo && !G.bunpo[n.bunpo]) E(`${where}: 図鑑 ${n.bunpo} がありません`);
        (n.arrows || []).forEach((a) => {
          if (!S.keigoKinds.includes(a.kind)) E(`${where}: arrows の kind が不正`);
          [a.from, a.to].forEach((p) => { if (!isChar(p)) E(`${where}: arrows の人物 ${p} がありません`); });
        });
        if (n.w && !isChar(n.w)) E(`${where}: w の人物 ${n.w} がありません`);
      } else if (t === 'if') {
        if (!n.f && !n.m) E(`${where}: if には f か m`); fxOk(n.m, where); target(n.go, where); target(n.el, where);
        if (!n.go) E(`${where}: if に go がありません`);
      } else if (t === 'set') { fxOk(n.fx, where);
      } else if (t === 'game') {
        if (!S.games.includes(n.g)) E(`${where}: 遊び ${n.g} がありません`);
        if (!n.cfg) E(`${where}: cfg がありません`);
        const c = n.cfg || {};
        if (n.g === 'wataru') { if (!S.stages[c.stage]) E(`${where}: wataru の stage`); (c.events || []).forEach((e) => { if (!(e.at >= 0 && e.at <= 1) || !e.x) E(`${where}: wataru の events は {at:0〜1, x}`); fxOk(e.fx, where); if (e.w && !isChar(e.w)) E(`${where}: events の w`); }); if (!(c.events || []).length) E(`${where}: wataru に events がありません`); }
        if (n.g === 'kaimami') { if (!(c.targets || []).length) E(`${where}: kaimami に targets がありません`); (c.targets || []).forEach((x) => { if (!isChar(x.id) || !x.x) E(`${where}: kaimami の targets は {id, x}`); if (x.gen && !gens[x.gen]) E(`${where}: targets の gen ${x.gen}`); if (!cast.includes(x.id)) W(`${where}: kaimami の ${x.id} は直前の scene の cast にいません`); }); }
        if (n.g === 'narabe') { const s = (c.items || []).map((i) => i.id).sort().join(); if (!c.q || !s || s !== (c.order || []).slice().sort().join()) E(`${where}: narabe の items と order が合いません`); if (!c.exp) E(`${where}: narabe に exp`); }
        if (n.g === 'musubi') { const L = (c.left || []).map((i) => i.id), R = (c.right || []).map((i) => i.id); if (!c.q || !L.length || L.some((l) => !R.includes((c.pairs || {})[l]))) E(`${where}: musubi の pairs が合いません`); if (!c.exp) E(`${where}: musubi に exp`); }
        target(n.go, where); target(n.el, where);
      } else if (t === 'go') { if (!n.to) E(`${where}: go に to がありません`); target(n.to, where);
      } else if (t === 'end') { if (!endings[n.e]) E(`${where}: 結末 ${n.e} がありません`);
      } else E(`${where}: ノードの種類 ${t} は不明`);
    });
    (ch.acts || []).forEach((act) => {
      const last = act.nodes[act.nodes.length - 1] || {};
      if (act === ch.acts[ch.acts.length - 1] && last.t !== 'end') E(`最後の act は end で終わる`);
    });
    Object.keys(gens).forEach((g) => { if (!usedGen[g]) W(`原文の段 ${g} が物語のどこにも出てきません`); });
    if (!Object.keys(endings).some((e) => endings[e].kind === 'true')) E('kind: true の結末がありません');
    Object.keys(ch.cutin || {}).forEach((c) => { if (!isChar(c)) E(`cutin の人物 ${c} がありません`); });
    stats[cid] = Object.assign({ acts: ch.acts.length, genbun: Object.keys(gens).length }, count, { askKinds });
  });
  return { errors, warns, stats };
}

if (require.main === module) {
  const G = load();
  const r = verify(G, process.argv.slice(2));
  r.warns.forEach((w) => console.log('⚠ ' + w));
  r.errors.forEach((e) => console.log('✖ ' + e));
  console.log(JSON.stringify(r.stats));
  console.log(r.errors.length ? `✖ ${r.errors.length} 件の誤り` : `✔ データ検証 OK（注意 ${r.warns.length} 件・図鑑 ${Object.keys(G.bunpo).length} 項目）`);
  process.exit(r.errors.length ? 1 : 0);
}
module.exports = { load, verify };
