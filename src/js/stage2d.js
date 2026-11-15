/* 絵巻モード（GENJI.Stage2D）—— WebGL が無くても動く、軽い代役の舞台。
 * 舞台ごとの色面の背景（SVG）に、人物を「襲の色の人形」（seal の一字つき）で立ち位置に並べる。
 * API は docs/CONTRACT.md の「舞台 API」と同じ形（3D と差し替えられる）。
 * 画面は 160×100 の絵巻の一コマ（.gj-s2-box）。操作のボタンはコマの下（文字の窓と重ならない位置）に出す。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  var NS = 'http://www.w3.org/2000/svg';
  var W = 160, H = 100;

  /* ---------- 立ち位置（吹抜屋台の床の上。x,y は絵の座標） ---------- */
  var SLOT = {
    kami: [80, 36], kamiL: [54, 38], kamiR: [106, 38],
    naka: [78, 54], nakaL: [50, 56], nakaR: [106, 56],
    shimo: [74, 73], shimoL: [46, 75], shimoR: [102, 75],
    sunoko: [128, 82], niwa: [146, 92], misu: [32, 34], to: [136, 52]
  };
  var STAGE_SLOT = {
    kokyu: { seiryoden: [40, 76], kokiden: [42, 44], kiritsubo: [128, 26], michi1: [108, 36], michi2: [88, 50], michi3: [64, 64] },
    watadono: { oku: [112, 30], temae: [48, 78] },
    kitayama: { takami: [112, 34], sakamichi: [72, 66], iwaya: [40, 40] },
    soubou: { kaki: [80, 93], kakiL: [50, 93], kakiR: [110, 93], jibutsu: [40, 38] }
  };
  var AUTO = ['naka', 'nakaL', 'nakaR', 'kami', 'shimo', 'kamiL', 'kamiR', 'shimoL', 'shimoR', 'sunoko', 'to', 'misu', 'niwa'];
  var KEIGO = { sonkei: ['尊敬', '#6a3d8f'], kenjo: ['謙譲', '#a23a4a'], teinei: ['丁寧', '#3d7a5a'] };
  var LIGHT = { dawn: ['#f3c9c2', .16], day: ['#fff', 0], dusk: ['#d9783a', .24], night: ['#141a3a', .5], moon: ['#1c2550', .4] };
  var SKY = { dawn: ['#f6d8cf', '#f7ecd6'], day: ['#dfe9ea', '#f5efdc'], dusk: ['#e9a56c', '#f2dcb4'], night: ['#1a2040', '#3a3f5e'], moon: ['#222a52', '#59608a'] };

  var S = { el: null, wrap: null, svg: null, layer: {}, ctl: null, scene: null, stage: null, cast: {}, order: [], act: null, fxT: null };

  function esc(s) { return G.esc ? G.esc(s) : String(s == null ? '' : s); }
  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function charOf(id) { return (G.chars && G.chars[id]) || { name: id, seal: String(id || '?').charAt(0) }; }
  function slotXY(stage, at) {
    var st = STAGE_SLOT[stage] || {};
    return st[at] || SLOT[at] || null;
  }

  /* ---------- 人形（襲の色の重なり＋印の一字）。原点は裾の中央 ---------- */
  function mound(w, h, fill, extra) {
    return '<path d="M' + (-w) + ' 0 Q' + (-w * .92) + ' ' + (-h * .78) + ' 0 ' + (-h) + ' Q' + (w * .92) + ' ' + (-h * .78) + ' ' + w + ' 0 Z" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function dollInner(id, pose) {
    var c = charOf(id), look = c.look || { kind: 'juni', colors: ['#b9a7c9', '#e6dcee', '#f6f2f8'] };
    var col = look.colors && look.colors.length ? look.colors : ['#b9a7c9'];
    var kind = look.kind || 'juni', k = '', i;
    var female = /juni|kouchiki|shojo|ama/.test(kind), small = { shojo: .8, warawa: .68, chigo: .5 }[kind] || 1;
    var standing = pose === 'stand' || pose === 'run' || pose === 'peek';
    var hy = female ? -11 : -13;            // 頭の高さ
    if (female) {
      // 女房装束：裾に襲の色がのぞく。外の色から重ねる
      for (i = col.length - 1; i >= 1; i--) k += mound(7.2 + i * 1.5, 8.6 - i * .5, col[i]);
      k += mound(7.2, 9.4, col[0], ' stroke="rgba(40,20,40,.35)" stroke-width=".25"');
      if (kind === 'ama') k += '<path d="M-2.6 ' + (hy - .6) + ' Q0 ' + (hy - 4) + ' 2.6 ' + (hy - .6) + ' L3 ' + (hy + 3) + ' L-3 ' + (hy + 3) + ' Z" fill="#4a4648"/>';
      else k += '<path d="M-2.7 ' + (hy - .5) + ' Q0 ' + (hy - 4.2) + ' 2.7 ' + (hy - .5) + ' Q4.6 ' + (hy + 6) + ' ' + (kind === 'shojo' ? '4 ' + (hy + 6.5) : '7.5 -0.6') + ' L' + (kind === 'shojo' ? '-4 ' + (hy + 6.5) : '1.5 -1.2') + ' Q-3.6 ' + (hy + 5) + ' -2.7 ' + (hy - .5) + ' Z" fill="#17131a"/>';
    } else {
      // 男の装束・僧・童：縦に長い衣。下に袴（指貫）の色
      var bw = kind === 'sou' ? 6 : 5.6;
      k += '<path d="M' + (-bw) + ' 0 L' + (-bw * .62) + ' -11 L' + (bw * .62) + ' -11 L' + bw + ' 0 Z" fill="' + (col[1] || col[0]) + '"/>';
      k += '<path d="M' + (-bw * 1.25) + ' -3 L' + (-bw * .6) + ' -11.4 L' + (bw * .6) + ' -11.4 L' + (bw * 1.25) + ' -3 Q0 -1.4 ' + (-bw * 1.25) + ' -3 Z" fill="' + col[0] + '" stroke="rgba(30,20,20,.35)" stroke-width=".25"/>';
      if (col[2]) k += '<path d="M-1.6 -11.3 L0 -8.6 L1.6 -11.3 Z" fill="' + col[2] + '"/>';
      if (kind === 'sou') k += '<path d="M' + (-bw * .6) + ' -11 L' + (bw * 1.1) + ' -3.4 L' + (bw * .5) + ' -2.6 L' + (-bw * .8) + ' -9 Z" fill="' + (col[1] || '#a58c5c') + '" opacity=".85"/>';
    }
    // 顔（引目のみ。精密な顔は作らない）
    k += '<circle cx="0" cy="' + hy + '" r="2.5" fill="#f6ecdc" stroke="rgba(60,40,30,.4)" stroke-width=".2"/>';
    if (kind !== 'sou') k += '<path d="M-2.5 ' + (hy - .3) + ' Q0 ' + (hy - 3.6) + ' 2.5 ' + (hy - .3) + ' Q0 ' + (hy - 1.5) + ' -2.5 ' + (hy - .3) + ' Z" fill="#17131a"/>';
    k += '<path d="M-1.5 ' + (hy + .4) + ' h1.1 M.4 ' + (hy + .4) + ' h1.1" stroke="#2a2024" stroke-width=".28" stroke-linecap="round"/>';
    if (kind === 'noshi' || kind === 'kariginu') k += '<path d="M-1.3 ' + (hy - 2.2) + ' Q-1.5 ' + (hy - 6) + ' .4 ' + (hy - 6.4) + ' Q1.9 ' + (hy - 5.6) + ' 1.4 ' + (hy - 2.2) + ' Z" fill="#141216"/>';
    if (kind === 'sokutai') k += '<path d="M-1.6 ' + (hy - 2) + ' h3.2 v-1.6 h-3.2 Z M.4 ' + (hy - 3.4) + ' Q.6 ' + (hy - 6.8) + ' 3.4 ' + (hy - 5.2) + ' L2.9 ' + (hy - 4.6) + ' Q1.4 ' + (hy - 5.4) + ' 1.3 ' + (hy - 3.4) + ' Z" fill="#141216"/>';
    if (kind === 'warawa' || kind === 'chigo') k += '<circle cx="-2.4" cy="' + (hy + .2) + '" r=".9" fill="#17131a"/><circle cx="2.4" cy="' + (hy + .2) + '" r=".9" fill="#17131a"/>';
    // 姿勢ごとの小道具
    if (pose === 'fan') k += '<path d="M-3.6 ' + (hy + 2.2) + ' L0 ' + (hy - 1.6) + ' L3.6 ' + (hy + 2.2) + ' Q0 ' + (hy + 3.4) + ' -3.6 ' + (hy + 2.2) + ' Z" fill="#e2c26a" stroke="#8a6a24" stroke-width=".25"/>';
    if (pose === 'weep') k += '<ellipse cx="-.6" cy="' + (hy + .9) + '" rx="3.4" ry="2" fill="' + col[0] + '" stroke="rgba(30,20,30,.4)" stroke-width=".2"/>';
    if (pose === 'pray') k += '<path d="M-.7 ' + (hy + 5) + ' L0 ' + (hy + 3.2) + ' L.7 ' + (hy + 5) + ' Z" fill="#f6ecdc" stroke="#6a5540" stroke-width=".2"/>';
    if (pose === 'write') k += '<rect x="2.6" y="-3.2" width="5" height="2.2" fill="#fbf6e8" stroke="#8a7a5a" stroke-width=".2" transform="rotate(-8 5 -2)"/>';
    if (pose === 'hold') k += '<ellipse cx="2.4" cy="-5.4" rx="2.3" ry="1.7" fill="#f6f0f8" stroke="#b9a05a" stroke-width=".25"/>';
    // 印（seal）
    k += '<circle cx="0" cy="-4.4" r="2.9" fill="#fbf5e6" stroke="' + col[0] + '" stroke-width=".5"/><text x="0" y="-3.1" text-anchor="middle" font-size="3.6" fill="#3a2a3c">' + esc(c.seal || '?') + '</text>';
    var tf = 'scale(' + small + ')';
    if (standing && female) tf += ' scale(.86,1.2)';
    if (standing && !female) tf += ' scale(.95,1.12)';
    if (pose === 'bow') tf += ' translate(0,-1) rotate(58) scale(.95)';
    if (pose === 'lie') tf += ' translate(-4,-2.4) rotate(84)';
    if (pose === 'peek') tf += ' rotate(-13)';
    if (pose === 'run') tf += ' rotate(11)';
    if (pose === 'turn') tf += ' scale(-1,1) rotate(-7)';
    return '<g class="gj-s2-body' + (pose === 'run' ? ' gj-s2-run' : '') + '" transform="' + tf + '">' + k + '</g>';
  }
  /** 人物一覧などで使う、単体の人形の SVG 文字列。 */
  function dollSVG(id, pose) {
    return '<svg class="gj-doll" viewBox="-12 -19 24 20" aria-hidden="true">' + dollInner(id, pose || 'sit') + '</svg>';
  }

  /* ---------- 背景（舞台ごとの色面） ---------- */
  function room(o) {
    o = o || {};
    var k = '';
    // 庭と簀子、吹抜屋台の床（斜めの平行四辺形）、柱と長押
    k += '<rect x="0" y="0" width="160" height="100" fill="' + (o.ground || '#c9c79a') + '"/>';
    k += '<polygon points="34,14 160,14 160,100 118,100 142,16" fill="' + (o.garden || '#a9b98a') + '" opacity=".7"/>';
    k += '<polygon points="30,16 142,16 120,98 2,98" fill="' + (o.floor || '#c8a877') + '"/>';
    k += '<polygon points="46,24 122,24 116,46 38,46" fill="' + (o.tatami || '#b7bf8a') + '" stroke="#5d6a3c" stroke-width=".4"/>';
    for (var i = 0; i < 6; i++) k += '<line x1="' + (30 - i * 5.6) + '" y1="' + (16 + i * 16.4) + '" x2="' + (142 - i * 4.4) + '" y2="' + (16 + i * 16.4) + '" stroke="rgba(70,45,20,.22)" stroke-width=".3"/>';
    k += '<polygon points="142,16 148,16 126,98 120,98" fill="' + (o.sunoko || '#d9c092') + '" stroke="rgba(70,45,20,.4)" stroke-width=".3"/>';
    k += '<polygon points="30,16 142,16 142,12 30,12" fill="#5a3a22"/>';
    [[30, 16], [86, 16], [142, 16]].forEach(function (p) { k += '<rect x="' + (p[0] - 1) + '" y="4" width="2" height="13" fill="#4a2e1a"/>'; });
    // 御簾（左奥）
    k += '<g opacity=".92"><rect x="14" y="20" width="26" height="24" fill="#c9b56a"/>';
    for (i = 0; i < 9; i++) k += '<line x1="14" y1="' + (22 + i * 2.6) + '" x2="40" y2="' + (22 + i * 2.6) + '" stroke="#8a7430" stroke-width=".35"/>';
    k += '<rect x="14" y="20" width="26" height="2.4" fill="' + (o.misu || '#7d2f3a') + '"/><rect x="26" y="20" width="1.6" height="24" fill="' + (o.misu || '#7d2f3a') + '"/></g>';
    // 几帳
    k += '<g><rect x="118" y="30" width="15" height="13" fill="' + (o.kicho || '#e9dff0') + '" stroke="#7a5a8a" stroke-width=".3"/><line x1="116" y1="30" x2="135" y2="30" stroke="#2a1c12" stroke-width=".8"/><line x1="125.5" y1="30" x2="125.5" y2="46" stroke="#2a1c12" stroke-width=".7"/></g>';
    return k;
  }
  function tree(x, y, bloom) {
    var k = '<path d="M' + x + ' ' + y + ' q-1 -10 1 -18 q2 8 1 18 Z" fill="#5a4030"/>';
    [[-6, -18, 6], [5, -21, 7], [0, -27, 6], [-9, -25, 4.5], [9, -14, 4.5]].forEach(function (p) { k += '<circle cx="' + (x + p[0]) + '" cy="' + (y + p[1]) + '" r="' + p[2] + '" fill="' + bloom + '" opacity=".86"/>'; });
    return k;
  }
  function hall(x, y, w, h, name, roof) {
    return '<g><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#e9dcc0" stroke="#5a3a22" stroke-width=".5"/>' +
      '<polygon points="' + (x - 3) + ',' + y + ' ' + (x + w + 3) + ',' + y + ' ' + (x + w - 3) + ',' + (y - 6) + ' ' + (x + 3) + ',' + (y - 6) + '" fill="' + (roof || '#6b5a4a') + '"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 1.6) + '" text-anchor="middle" font-size="4.2" fill="#3a2a22">' + name + '</text></g>';
  }
  var BACK = {
    kiritsubo: function () { return room({ kicho: '#e7d6ee', misu: '#6a4a86' }) + tree(146, 70, '#b79ad0') + '<text x="150" y="78" font-size="3.2" fill="#4a3a52" text-anchor="middle">桐</text>'; },
    seiryoden: function () {
      return room({ floor: '#cfae7a', tatami: '#c0c890', kicho: '#f4efe2', misu: '#b53a3a' }) +
        '<polygon points="64,26 100,26 98,40 60,40" fill="#d8dca8" stroke="#b53a3a" stroke-width="1"/><polygon points="64,26 100,26 100,24.6 64,24.6" fill="#e2c26a"/>';
    },
    kokiden: function () { return room({ floor: '#c9a070', kicho: '#d9534f', misu: '#a3202c', tatami: '#bcc088' }) + '<rect x="96" y="20" width="14" height="12" fill="#a3202c" opacity=".8"/>'; },
    sato: function () {
      var k = room({ floor: '#b89a70', garden: '#8f9a6a', ground: '#a9a67c', tatami: '#aab080', kicho: '#d8d4dc', misu: '#6b6470' });
      for (var i = 0; i < 12; i++) k += '<path d="M' + (136 + (i * 7) % 22) + ' ' + (96 - (i * 11) % 60) + ' q-2 -6 1 -11 M' + (137 + (i * 7) % 22) + ' ' + (96 - (i * 11) % 60) + ' q3 -5 2 -10" stroke="#6f7a44" stroke-width=".5" fill="none"/>';
      return k;
    },
    kokyu: function () {
      var k = '<rect width="160" height="100" fill="#d9cfa6"/>';
      k += '<path d="M128 30 L108 36 L88 50 L64 64 L46 74" stroke="#b9945e" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="M128 30 L108 36 L88 50 L64 64 L46 74" stroke="#e6d2a2" stroke-width="3.4" fill="none" stroke-dasharray="1.6 1" stroke-linejoin="round"/>';
      k += hall(18, 66, 44, 20, '清涼殿', '#5a4a3a') + hall(22, 34, 38, 16, '弘徽殿', '#7d2f3a') + hall(112, 14, 36, 14, '淑景舎（桐壺）', '#6a4a86');
      k += hall(78, 16, 22, 10, '', '#6b5a4a') + hall(96, 58, 26, 12, '', '#6b5a4a') + hall(126, 44, 22, 12, '', '#6b5a4a');
      return k + tree(152, 36, '#b79ad0').replace(/r="(\d+(\.\d+)?)"/g, function (m, r) { return 'r="' + (r * .5) + '"'; });
    },
    watadono: function () {
      var k = '<rect width="160" height="100" fill="#b9bf98"/>';
      k += '<polygon points="96,10 132,10 76,98 16,98" fill="#c8a877" stroke="#5a3a22" stroke-width=".6"/>';
      for (var i = 0; i < 7; i++) {
        var t = i / 6, x1 = 96 - 80 * t, x2 = 132 - 56 * t, y = 10 + 88 * t;
        k += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="rgba(70,45,20,.3)" stroke-width=".3"/>';
        if (i < 6) k += '<rect x="' + (x1 - 5 - t * 3) + '" y="' + (y + 2) + '" width="' + (4 + t * 3) + '" height="' + (9 + t * 3) + '" fill="#7a5a3a" opacity=".85"/><rect x="' + (x2 + 1) + '" y="' + (y + 2) + '" width="' + (4 + t * 3) + '" height="' + (9 + t * 3) + '" fill="#7a5a3a" opacity=".85"/>';
      }
      return k;
    },
    kitayama: function () {
      var k = '<rect width="160" height="100" fill="#dfe6d8"/>';
      k += '<path d="M0 60 Q30 14 62 46 Q84 8 118 40 Q140 22 160 44 V100 H0 Z" fill="#8fa98a"/><path d="M0 76 Q40 44 80 70 Q118 46 160 66 V100 H0 Z" fill="#6f8f6c"/>';
      k += '<path d="M40 100 Q66 76 72 66 Q84 50 112 36" stroke="#d9c9a0" stroke-width="2.4" fill="none" stroke-dasharray="3 1.4"/>';
      [[30, 46], [52, 40], [98, 30], [126, 40], [70, 58], [20, 68], [140, 58], [112, 60], [88, 44]].forEach(function (p) { k += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.2" fill="#f3d3dc" opacity=".9"/><circle cx="' + (p[0] + 3) + '" cy="' + (p[1] + 2) + '" r="3" fill="#f8e3e8" opacity=".9"/>'; });
      k += '<rect x="98" y="62" width="22" height="9" fill="#e9dcc0" stroke="#5a3a22" stroke-width=".4"/><polygon points="95,62 123,62 118,56 100,56" fill="#6b5a4a"/><text x="109" y="68.6" text-anchor="middle" font-size="3.4" fill="#3a2a22">僧坊</text>';
      k += '<path d="M30 44 q10 -8 20 0 v6 h-20 Z" fill="#5d6a5a"/><text x="40" y="49" text-anchor="middle" font-size="3" fill="#eee">岩屋</text>';
      return k + '<rect y="50" width="160" height="12" fill="#fff" opacity=".28"/>';
    },
    soubou: function () {
      var k = room({ floor: '#c2a274', tatami: '#b4b888', kicho: '#c8c6c0', misu: '#5b4a3a', garden: '#9fb088' });
      k += '<g><rect x="33" y="24" width="12" height="9" fill="#3d2a1c"/><rect x="35.5" y="26" width="7" height="6" fill="#e2c26a"/><text x="39" y="31" text-anchor="middle" font-size="3.4" fill="#5a3a12">仏</text></g>';
      k += tree(150, 60, '#f3d3dc');
      return k;
    }
  };
  function fence() {
    // 小柴垣（僧坊の手前）
    var k = '<g class="gj-s2-fence"><rect x="0" y="84" width="160" height="16" fill="#7c6a48" opacity=".5"/>';
    for (var i = 0; i < 54; i++) k += '<line x1="' + (i * 3 + 1) + '" y1="' + (83 + (i % 3)) + '" x2="' + (i * 3 + (i % 2 ? 2 : 0)) + '" y2="100" stroke="#5d4a2c" stroke-width="1"/>';
    return k + '<line x1="0" y1="88" x2="160" y2="88" stroke="#3d2f1a" stroke-width=".8"/><line x1="0" y1="95" x2="160" y2="95" stroke="#3d2f1a" stroke-width=".8"/></g>';
  }
  function seasonDeco(season, stage) {
    var k = '', i, col = { spring: '#f6cfd9', autumn: '#c9582e', winter: '#ffffff' }[season];
    if (!col || stage === 'kokyu' || stage === 'watadono') return '';
    for (i = 0; i < 14; i++) k += '<circle cx="' + (128 + (i * 13) % 30) + '" cy="' + (20 + (i * 29) % 76) + '" r="' + (season === 'winter' ? 1.1 : .9) + '" fill="' + col + '" opacity=".85"/>';
    return k;
  }

  /* ---------- 組み立て ---------- */
  function g(cls) { var e = document.createElementNS(NS, 'g'); if (cls) e.setAttribute('class', cls); return e; }
  function supported() { return true; }
  function mount(el, opts) {
    if (S.el) unmount();
    S.el = el;
    var wrap = document.createElement('div');
    wrap.className = 'gj-s2';
    wrap.innerHTML = '<div class="gj-s2-sky"></div><div class="gj-s2-wrap"><div class="gj-s2-box"><svg class="gj-s2-svg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="絵巻の舞台"></svg><div class="gj-s2-fx"></div><div class="gj-s2-over"></div><div class="gj-s2-label"></div></div><div class="gj-s2-ctl"></div></div>';
    el.appendChild(wrap);
    S.wrap = wrap;
    S.box = wrap.querySelector('.gj-s2-box');
    S.svg = wrap.querySelector('svg');
    S.ctl = wrap.querySelector('.gj-s2-ctl');
    S.over = wrap.querySelector('.gj-s2-over');
    S.fxEl = wrap.querySelector('.gj-s2-fx');
    S.label = wrap.querySelector('.gj-s2-label');
    S.svg.innerHTML = '<defs>' + Object.keys(KEIGO).map(function (k) {
      return '<marker id="gj-s2-ah-' + k + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="' + KEIGO[k][1] + '"/></marker>';
    }).join('') + '</defs>';
    S.cam = g('gj-s2-cam');
    S.svg.appendChild(S.cam);
    ['back', 'cast', 'front', 'tint', 'arrows'].forEach(function (n) { S.layer[n] = g('gj-s2-' + n); S.cam.appendChild(S.layer[n]); });
    S.cast = {}; S.order = [];
    S.quality = (opts && opts.quality) || 'low';
    return true;
  }
  function unmount() {
    stopActivity();
    clearTimeout(S.fxT);
    if (S.wrap && S.wrap.parentNode) S.wrap.parentNode.removeChild(S.wrap);
    S.el = S.wrap = S.svg = S.ctl = S.over = S.fxEl = S.label = S.cam = null; S.layer = {}; S.cast = {}; S.order = []; S.scene = null;
  }
  function resize() {}
  function setQuality(q) { S.quality = q; }

  function place(id) {
    var c = S.cast[id]; if (!c) return;
    var s = .78 + c.y / 100 * .62;
    c.el.setAttribute('style', 'transform:translate(' + c.x + 'px,' + c.y + 'px) scale(' + s.toFixed(3) + ')');
    c.el.setAttribute('data-y', c.y);
  }
  function addDoll(id, at, pose) {
    var xy = (typeof at === 'string' ? slotXY(S.stage, at) : at) || SLOT.naka;
    var el = g('gj-s2-doll');
    el.setAttribute('data-id', id);
    el.innerHTML = '<ellipse cx="0" cy=".4" rx="7.5" ry="1.6" fill="rgba(30,20,10,.22)"/>' + dollInner(id, pose || 'sit');
    S.cast[id] = { el: el, x: xy[0], y: xy[1], at: at, pose: pose || 'sit' };
    S.order.push(id);
    place(id);
    return el;
  }
  function sortDolls() {
    S.order.slice().sort(function (a, b) { return S.cast[a].y - S.cast[b].y; }).forEach(function (id) { S.layer.cast.appendChild(S.cast[id].el); });
  }
  function setScene(n) {
    if (!S.svg) return Promise.resolve();
    n = n || {};
    S.scene = n; S.stage = n.stage;
    var light = LIGHT[n.light] ? n.light : 'day';
    var sky = SKY[light];
    S.wrap.querySelector('.gj-s2-sky').style.background = 'linear-gradient(180deg,' + sky[0] + ',' + sky[1] + ')';
    S.wrap.setAttribute('data-light', light);
    S.wrap.setAttribute('data-stage', n.stage || '');
    S.layer.back.innerHTML = (BACK[n.stage] || BACK.kiritsubo)() + seasonDeco(n.season, n.stage);
    S.layer.front.innerHTML = n.stage === 'soubou' ? fence() : '';
    S.layer.tint.innerHTML = '<rect width="160" height="100" fill="' + LIGHT[light][0] + '" opacity="' + LIGHT[light][1] + '" pointer-events="none"/>' +
      (light === 'moon' ? '<circle cx="138" cy="14" r="6" fill="#f6efc8" opacity=".95"/>' : '') +
      (light === 'night' ? '<circle cx="24" cy="30" r="9" fill="#f2c56a" opacity=".22"/>' : '');
    S.layer.arrows.innerHTML = '';
    S.layer.cast.innerHTML = '';
    S.cast = {}; S.order = [];
    var used = {};
    (n.cast || []).forEach(function (c) {
      var id = typeof c === 'string' ? c : c.id, at = typeof c === 'object' ? c.at : null;
      if (!id || S.cast[id]) return;
      if (!at || !slotXY(n.stage, at)) { at = AUTO.filter(function (a) { return !used[a]; })[0] || 'naka'; }
      var xy = slotXY(n.stage, at).slice();
      if (used[at]) { xy[0] += 7 * used[at]; xy[1] += 2 * used[at]; }   // 同じ場所に重なるときは少しずらす
      used[at] = (used[at] || 0) + 1;
      addDoll(id, xy, typeof c === 'object' ? c.pose : null);
      S.cast[id].at = at;
    });
    sortDolls();
    var spec = G.stageSpec && G.stageSpec.stages && G.stageSpec.stages[n.stage];
    S.label.textContent = spec ? spec.name : '';
    focus('wide'); speak(null);
    return Promise.resolve();
  }
  function focus(at) {
    if (!S.cam) return;
    var xy = null;
    if (at && at !== 'wide') xy = S.cast[at] ? [S.cast[at].x, S.cast[at].y - 8] : slotXY(S.stage, at);
    if (!xy) { S.cam.setAttribute('style', 'transform:none'); return; }
    var z = 1.55, tx = W / 2 - xy[0] * z, ty = H / 2 - xy[1] * z;
    tx = Math.min(0, Math.max(W - W * z, tx)); ty = Math.min(0, Math.max(H - H * z, ty));
    S.cam.setAttribute('style', 'transform:translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + z + ')');
  }
  function speak(id) {
    if (!S.svg) return;
    S.order.forEach(function (k) {
      var cl = S.cast[k].el.classList;
      cl.toggle('gj-on', !!id && k === id);
      cl.toggle('gj-off', !!id && !!S.cast[id] && k !== id);
    });
  }
  function pose(id, p) {
    var c = S.cast[id]; if (!c) return;
    c.pose = p;
    c.el.innerHTML = '<ellipse cx="0" cy=".4" rx="7.5" ry="1.6" fill="rgba(30,20,10,.22)"/>' + dollInner(id, p);
  }
  function fx(name) {
    if (!S.box) return;
    var list = (G.stageSpec && G.stageSpec.fx) || [];
    if (list.length && list.indexOf(name) === -1) return;
    S.box.classList.remove('gj-fx-shake', 'gj-fx-flash', 'gj-fx-dim');
    S.fxEl.innerHTML = '';
    clearTimeout(S.fxT);
    if (name === 'shake' || name === 'flash' || name === 'dim') {
      void S.box.offsetWidth;
      S.box.classList.add('gj-fx-' + name);
    } else if (name) {
      var k = '', n = reduced() ? 5 : 16;
      for (var i = 0; i < n; i++) k += '<i style="left:' + ((i * 37) % 100) + '%;top:' + ((i * 23) % 70) + '%;animation-delay:' + (-(i * .37) % 3).toFixed(2) + 's"></i>';
      S.fxEl.className = 'gj-s2-fx gj-fx-' + name;
      S.fxEl.innerHTML = k;
    }
    S.fxT = setTimeout(function () { if (S.box) { S.box.classList.remove('gj-fx-shake', 'gj-fx-flash', 'gj-fx-dim'); S.fxEl.innerHTML = ''; } }, 4200);
  }
  function arrows(list) {
    if (!S.layer.arrows) return;
    var k = '';
    (list || []).forEach(function (a, i) {
      var kd = KEIGO[a.kind]; if (!kd) return;
      var f = S.cast[a.from], t = S.cast[a.to];
      var p1 = f ? [f.x, f.y - 9] : [W / 2 - 24 + i * 16, H - 2];        // 語り手などは画面の手前から
      var p2 = t ? [t.x, t.y - 16] : [W / 2 + 30, 10];
      if (f && t && f === t) return;
      var mx = (p1[0] + p2[0]) / 2, my = Math.min(p1[1], p2[1]) - 12 - i * 3;
      k += '<path class="gj-s2-arrow" d="M' + p1[0] + ' ' + p1[1] + ' Q' + mx + ' ' + my + ' ' + p2[0] + ' ' + p2[1] + '" fill="none" stroke="' + kd[1] + '" stroke-width="1.3" stroke-linecap="round" marker-end="url(#gj-s2-ah-' + a.kind + ')"/>';
      var lx = (p1[0] + 2 * mx + p2[0]) / 4, ly = (p1[1] + 2 * my + p2[1]) / 4;
      k += '<rect x="' + (lx - 7) + '" y="' + (ly - 3.6) + '" width="14" height="6" rx="1.4" fill="#fbf5e6" stroke="' + kd[1] + '" stroke-width=".4"/><text x="' + lx + '" y="' + (ly + 1) + '" text-anchor="middle" font-size="3.6" fill="' + kd[1] + '">' + kd[0] + '</text>';
    });
    S.layer.arrows.innerHTML = k;
  }

  /* ---------- 遊び（簡易版）：必ず完走できる ---------- */
  function stopActivity() {
    if (!S.act) return;
    S.act.dead = true; S.act = null;
    if (S.ctl) S.ctl.innerHTML = '';
    if (S.over) S.over.innerHTML = '';
    if (S.wrap) S.wrap.classList.remove('gj-s2-playing');
  }
  function say(cb, m) {
    try { return Promise.resolve(cb && cb.say ? cb.say(m) : null); } catch (e) { return Promise.resolve(); }
  }
  function stageName(id) {
    var st = G.stageSpec && G.stageSpec.stages && G.stageSpec.stages[id];
    return st ? st.name : (charOf(id).name !== id ? charOf(id).name : id);
  }
  /** 渡る：道のりを「進む」で進み、events を順に出す。 */
  function wataru(cfg, cb, act) {
    var events = (cfg.events || []).slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var who = (cb && cb.pov) || 'you', i = 0;
    var stage = BACK[cfg.stage] ? cfg.stage : 'watadono';
    var a = slotXY(stage, cfg.from) || (stage === 'kokyu' ? STAGE_SLOT.kokyu.kiritsubo : stage === 'watadono' ? STAGE_SLOT.watadono.oku : [130, 30]);
    var b = slotXY(stage, cfg.to) || (stage === 'kokyu' ? STAGE_SLOT.kokyu.seiryoden : stage === 'watadono' ? STAGE_SLOT.watadono.temae : [40, 80]);
    setScene({ stage: stage, light: (S.scene && S.scene.light) || 'day', season: S.scene && S.scene.season, cast: [] });
    addDoll(who, a.slice(), 'stand');
    S.wrap.classList.add('gj-s2-playing');
    function move(t) {
      var c = S.cast[who]; if (!c) return;
      c.x = a[0] + (b[0] - a[0]) * t; c.y = a[1] + (b[1] - a[1]) * t; place(who);
      var bar = S.ctl.querySelector('.gj-s2-way i'); if (bar) bar.style.width = Math.round(t * 100) + '%';
    }
    function ui(on) {
      S.ctl.innerHTML = '<div class="gj-s2-way" aria-hidden="true"><span>' + esc(stageName(cfg.from || '')) + '</span><b><i></i></b><span>' + esc(stageName(cfg.to || '')) + '</span></div>' +
        (on ? '<button type="button" class="gj-s2-btn" data-s2="step">進む　▶</button>' : '');
      var btn = S.ctl.querySelector('[data-s2="step"]');
      if (btn) btn.onclick = step;
      move(i === 0 ? 0 : i > events.length ? 1 : (events[i - 1].at || 0));
    }
    function step() {
      if (act.dead) return;
      var e = events[i++];
      ui(false);
      if (!e) {
        move(1);
        return say(cb, cfg.outro ? { x: cfg.outro } : null).then(function () { finish(act, cb, { ok: true, kind: 'wataru' }); });
      }
      move(e.at || 0);
      if (e.fx && cb && cb.meter) cb.meter(e.fx);
      if (e.kind === 'block' || e.kind === 'dirt') fx('shake');
      say(cb, { w: e.w, x: e.x }).then(function () { if (!act.dead) ui(true); });
    }
    (cfg.intro ? say(cb, { x: cfg.intro }) : Promise.resolve()).then(function () { if (!act.dead) ui(true); });
  }
  /** 垣間見：垣の隙間をタップして、targets を順に見つける。 */
  function kaimami(cfg, cb, act) {
    var targets = cfg.targets || [], found = 0, busy = false;
    S.wrap.classList.add('gj-s2-playing');
    if (cfg.stage && BACK[cfg.stage] && S.stage !== cfg.stage) setScene({ stage: cfg.stage, light: (S.scene && S.scene.light) || 'day', cast: targets.map(function (t) { return t.id; }) });
    targets.forEach(function (t, k) { if (!S.cast[t.id]) { addDoll(t.id, AUTO[k % AUTO.length], 'sit'); } });
    sortDolls();
    function draw() {
      var k = '<div class="gj-s2-kaki" aria-hidden="true"></div>';
      targets.forEach(function (t, j) {
        var left = (j + .5) / targets.length * 100;
        k += j < found
          ? '<span class="gj-s2-gap open" style="left:' + left + '%"><b>' + esc(t.label || charOf(t.id).name) + '</b></span>'
          : '<button type="button" class="gj-s2-gap" data-s2="gap" style="left:' + left + '%" aria-label="垣の隙間からのぞく">隙間</button>';
      });
      S.over.innerHTML = k;
      Array.prototype.forEach.call(S.over.querySelectorAll('[data-s2="gap"]'), function (b) { b.onclick = peek; });
      S.ctl.innerHTML = '<p class="gj-s2-note">垣の隙間をタップしてのぞく（' + found + '／' + targets.length + '）</p>';
      // まだ見つけていない人物は薄く
      targets.forEach(function (t, j) { if (S.cast[t.id]) S.cast[t.id].el.classList.toggle('gj-veil', j >= found); });
    }
    function peek() {
      if (act.dead || busy) return;
      var t = targets[found]; if (!t) return;
      busy = true; found++;
      draw();
      focus(t.id); speak(t.id);
      if (t.gen && cb && cb.gen) cb.gen(t.gen);
      say(cb, { x: t.x, src: 'gen' })
        .then(function () { return t.yaku ? say(cb, { x: t.yaku }) : null; })
        .then(function () {
          if (act.dead) return;
          busy = false; focus('wide'); speak(null);
          if (found >= targets.length) return say(cb, cfg.outro ? { x: cfg.outro } : null).then(function () { finish(act, cb, { ok: true, kind: 'kaimami', found: found }); });
        });
    }
    (cfg.intro ? say(cb, { x: cfg.intro }) : Promise.resolve()).then(function () {
      if (act.dead) return;
      if (!targets.length) return finish(act, cb, { ok: true, kind: 'kaimami', found: 0 });
      draw();
    });
  }
  function finish(act, cb, result) {
    if (act.dead) return;
    stopActivity();
    Object.keys(S.cast).forEach(function (id) { S.cast[id].el.classList.remove('gj-veil'); });
    if (cb && cb.done) cb.done(result);
  }
  function activity(kind, cfg, cb) {
    stopActivity();
    var act = S.act = { dead: false };
    cfg = cfg || {};
    if (kind === 'wataru') wataru(cfg, cb, act);
    else if (kind === 'kaimami') kaimami(cfg, cb, act);
    else { setTimeout(function () { finish(act, cb, { ok: true, skipped: true }); }, 0); }
    return { stop: function () { if (S.act === act) stopActivity(); else act.dead = true; } };
  }

  G.Stage2D = {
    is3D: false, supported: supported, mount: mount, unmount: unmount, resize: resize, setQuality: setQuality,
    setScene: setScene, focus: focus, speak: speak, pose: pose, fx: fx, arrows: arrows, activity: activity,
    dollSVG: dollSVG, _state: S
  };
})(typeof window !== 'undefined' ? window : globalThis);
