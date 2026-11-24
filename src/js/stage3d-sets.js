/* 3D 舞台の大道具 —— stage-spec.js の 8 つの舞台と、渡殿を渡る遊びの道。
 * 吹抜屋台：屋根と天井を外し、斜め上から室内を見下ろす。手前側の長押・壁は描かない（奥と左だけ）。
 * 座標：+X が見る人の右、+Z が手前、床が y=0、地面は y=-FH。1 間＝KEN。
 * 公開: GENJI.S3S = { build(stage, env, opt), walk(env, cfg), PLAN } */
(function (root) {
  'use strict';
  var G = root.GENJI, T = root.THREE, K = G && G.S3K;
  if (!T || !K || !K.ok) return;
  var S = G.S3S = {};
  var PI = Math.PI, KEN = 2.2, FH = 0.7, PH = 2.35, WA = K.WA;

  function M() {
    return M.c || (M.c = {
      ita: K.mat('#ffffff', { map: K.tex.ita(), rough: 0.55, bump: K.tex.ita(), bumpScale: 0.006 }), itaD: K.mat('#d8cdbd', { map: K.tex.ita(), rough: 0.7, bump: K.tex.ita(), bumpScale: 0.008 }),
      wood: K.mat('#d6b48a', { map: K.tex.hashira(), rough: 0.6 }), slab: K.mat('#a07a52', { map: K.tex.hashira(), rough: 0.8 }),
      hashira: K.mat('#b08458', { map: K.tex.hashira(), rough: 0.55, bump: K.tex.hashira(), bumpScale: 0.004 }), nageshi: K.mat('#9a704a', { map: K.tex.hashira(), rough: 0.6 }), kuro: K.mat(WA.kuro, { rough: 0.28 }), shita: K.mat('#3b2d24'),
      tatami: K.mat('#ffffff', { map: K.tex.tatami(), rough: 0.88, bump: K.tex.tatami(), bumpScale: 0.003 }), ungen: K.mat('#ffffff', { map: K.tex.ungen() }), kourai: K.mat('#ffffff', { map: K.tex.kourai() }),
      misu: K.mat('#ffffff', { map: K.tex.misu(), transparent: true, side: T.DoubleSide, depthWrite: false }),
      mokou: K.mat('#3d5a45'), shu: K.mat(WA.shu), kin: K.mat(WA.kin), kabe: K.mat(WA.kabe),
      yamatoe: K.mat('#ffffff', { map: K.tex.yamatoe(), side: T.DoubleSide, rough: 0.5, metal: 0.12 }), koshi: K.mat('#ffffff', { map: K.tex.koshi(), side: T.DoubleSide }),
      hiwada: K.mat('#ffffff', { map: K.tex.hiwada(), rough: 0.9, bump: K.tex.hiwada(), bumpScale: 0.02 }), kinun: K.mat('#ffffff', { map: K.tex.kinun(), basic: true, transparent: true, depthWrite: false, fog: false }),
      kasumi: K.mat('#ffffff', { map: K.tex.kasumi(), basic: true, transparent: true, depthWrite: false, opacity: 0.8, fog: false }),
      miki: K.mat(WA.miki), iwa: K.mat(WA.iwa), yuki: K.mat(WA.yuki), mizu: K.mat(WA.mizu), shiba: K.mat('#7a6146'), take: K.mat(WA.take),
      flame: K.mat('#ffd9a0', { basic: true, map: K.tex.glow(), transparent: true, depthWrite: false, add: true, fog: false })
    });
  }
  S._reset = function () { M.c = null; if (CBOX) { CBOX.dispose(); CBOX = null; } };

  /* ---------- 小さな部品 ---------- */
  function floorTop(g, x0, z0, x1, z1, y, mat) { var w = x1 - x0, d = z1 - z0; return K.pl(g, w, d, mat || M().ita, (x0 + x1) / 2, y, (z0 + z1) / 2, w / 2.4, d / 2.4); }
  function slab(g, x0, z0, x1, z1, top, th) { K.bx(g, x1 - x0, th, z1 - z0, M().slab, (x0 + x1) / 2, top - th / 2 - 0.004, (z0 + z1) / 2); }
  /* 寄りのカメラが避ける物（柱・几帳・屏風）。舞台を作るたびに集め直す。{ x, z, r, top } */
  var OCC = [];
  function occ(x, z, r, top, bot) { OCC.push({ x: x, z: z, r: r, top: top, bot: bot || -9 }); }
  function pillar(g, x, z, h, r, y) { occ(x, z, (r || 0.1) + 0.06, (y || 0) + (h || PH)); return K.cy(g, r || 0.1, h || PH, M().hashira, x, y || 0, z, K.HQ ? 16 : 8); }
  /* 面取りした角材（長押・高欄の横木）。断面は角を落とした四角、長さ方向が x */
  var CBOX = null;
  function cbox() {
    if (CBOX) return CBOX;
    var c = 0.14, sh = new T.Shape();
    sh.moveTo(-0.5 + c, -0.5); sh.lineTo(0.5 - c, -0.5); sh.lineTo(0.5, -0.5 + c); sh.lineTo(0.5, 0.5 - c); sh.lineTo(0.5 - c, 0.5); sh.lineTo(-0.5 + c, 0.5); sh.lineTo(-0.5, 0.5 - c); sh.lineTo(-0.5, -0.5 + c); sh.closePath();
    var g = new T.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5); g.rotateY(PI / 2); g.computeVertexNormals();
    var uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
    g._gjShared = true; return (CBOX = g);
  }
  function beam(g, x0, z0, x1, z1, y, t, mat) {
    var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz);
    if (!K.HQ) return K.bx(g, L, t || 0.14, t || 0.14, mat || M().nageshi, (x0 + x1) / 2, y, (z0 + z1) / 2, -Math.atan2(dz, dx));
    var m = new T.Mesh(cbox(), mat || M().nageshi); m.scale.set(L, t || 0.14, t || 0.14); m.rotation.y = -Math.atan2(dz, dx);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }
  /* 置き畳（平安の畳は敷きつめず、座る所にだけ置く）。heri: 'kourai' | 'ungen' */
  function tatami(g, x, z, ry, heri, w, d, y) {
    w = w || 1.9; d = d || 0.95; y = y || 0;
    var t = K.grp(g, x, y, z, ry);
    K.bx(t, w, 0.06, d, K.mat('#a39a62'), 0, 0.03, 0);
    K.pl(t, w, d - 0.14, M().tatami, 0, 0.062, 0, w * 3, d * 6);
    var hm = heri === 'ungen' ? M().ungen : M().kourai;
    K.pl(t, w, 0.08, hm, 0, 0.063, d / 2 - 0.04, w * 2.2, 1); K.pl(t, w, 0.08, hm, 0, 0.063, -d / 2 + 0.04, w * 2.2, 1);
    return t;
  }
  /* 茵（しとね）：畳の上に置く、錦の縁の敷物 */
  function shitone(g, x, z, col, y) {
    K.bx(g, 0.92, 0.035, 0.92, K.mat(col || '#7d4f9e'), x, (y || 0.06) + 0.018, z);
    K.bx(g, 0.7, 0.04, 0.7, K.mat('#efe6d0'), x, (y || 0.06) + 0.02, z);
  }
  /* 御簾：top から bottom まで垂らす。巻き上げた分は下端に巻き、上に帽額（もこう） */
  function misu(g, env, x, z, w, ry, bottom, top) {
    top = top || 2.05; bottom = bottom == null ? 0.05 : bottom;
    var m = K.grp(g, x, top, z, ry); m.userData.dyn = true;
    var h = top - bottom;
    /* 寄りのカメラが避ける帯（巻き上げた御簾も、垂らした御簾も） */
    var ox = Math.cos(ry || 0), oz = -Math.sin(ry || 0), nb = Math.max(2, Math.round(w / 0.4));
    for (var oi = 0; oi <= nb; oi++) { var f = oi / nb - 0.5; occ(x + ox * f * w, z + oz * f * w, 0.22, top + 0.05, bottom - 0.15); }
    var p = new T.Mesh(K.G.vplane(), M().misu); p.scale.set(w, h, 1); p.position.y = -h / 2; p.renderOrder = 3; m.add(p);
    var uv = null;
    K.bx(m, w, 0.16, 0.02, M().mokou, 0, -0.08, 0.012, 0, false);
    if (bottom > 0.25) { var r = K.cy(m, Math.min(0.09, 0.03 + bottom * 0.03), w, K.mat('#c2ae66'), 0, 0, 0, 8, false); r.rotation.z = PI / 2; r.position.set(0, -h, 0); }
    [-0.3, 0.3].forEach(function (f) { K.bx(m, 0.03, Math.min(0.5, h), 0.025, M().shu, f * w, -Math.min(0.5, h) / 2, 0.02, 0, false); });
    env.sway.push({ o: m, ax: 'x', amp: 0.006, ph: x + z });
    return m;
  }
  /* 几帳：土居・足・手（横木）に帷（かたびら）を垂らす */
  function kicho(g, env, x, z, ry, style, y) {
    var st = { fuyu: ['#f6f1e6', '#b79ad0', '#b5432e'], beni: ['#f8ece2', '#c8483c', '#c9a44a'], ao: ['#f1f3ea', '#7fa58a', '#5a3d6e'], nibi: ['#e6e3dc', '#8c8a86', '#4a4640'] }[style || 'fuyu'];
    var k = K.grp(g, x, y || 0, z, ry), w = 1.3, h = 1.25;
    occ(x - Math.cos(ry || 0) * 0.33, z + Math.sin(ry || 0) * 0.33, 0.36, (y || 0) + h); occ(x + Math.cos(ry || 0) * 0.33, z - Math.sin(ry || 0) * 0.33, 0.36, (y || 0) + h);
    K.bx(k, 0.5, 0.07, 0.22, M().kuro, 0, 0.035, 0);
    K.bx(k, 0.035, h, 0.035, M().kuro, -0.1, h / 2, 0); K.bx(k, 0.035, h, 0.035, M().kuro, 0.1, h / 2, 0);
    K.bx(k, w + 0.1, 0.035, 0.035, M().kuro, 0, h, 0);
    var cl = K.grp(k, 0, h, 0); cl.userData.dyn = true;
    var mat = K.mat('#ffffff', { map: K.tex.katabira(style || 'fuyu', st[0], st[1], st[2]), side: T.DoubleSide });
    for (var i = 0; i < 4; i++) { var p = new T.Mesh(K.G.vplane(), mat); p.scale.set(w / 4 - 0.01, h - 0.08, 1); p.position.set(-w / 2 + (i + 0.5) * w / 4, -(h - 0.08) / 2 - 0.01, 0.02); p.castShadow = true; cl.add(p); }
    env.sway.push({ o: cl, ax: 'x', amp: 0.012, ph: x * 2 + z });
    return k;
  }
  /* 屏風 */
  function byobu(g, x, z, ry, n, h) {
    var b = K.grp(g, x, 0, z, ry), pw = 0.62, i; n = n || 4; h = h || 1.5;
    for (i = 0; i < n; i++) { var ox = (i - (n - 1) / 2) * pw * 0.92; occ(x + Math.cos(ry || 0) * ox, z - Math.sin(ry || 0) * ox, 0.33, h); }
    for (i = 0; i < n; i++) {
      var a = (i % 2 ? -1 : 1) * 0.42, p = K.vp(b, pw, h, M().yamatoe, (i - (n - 1) / 2) * pw * Math.cos(0.42), 0, (i % 2 ? 0 : 0) , a, 0.5, 1);
      p.castShadow = true; p.position.z = 0;
    }
    return b;
  }
  /* 高欄 */
  function kouran(g, x0, z0, x1, z1, y) {
    var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.round(L / 1.5)), i;
    y = y || 0;
    for (i = 0; i <= n; i++) K.bx(g, 0.07, 0.72, 0.07, M().nageshi, x0 + dx * i / n, y + 0.36, z0 + dz * i / n);
    beam(g, x0, z0, x1, z1, y + 0.7, 0.07); beam(g, x0, z0, x1, z1, y + 0.42, 0.05); beam(g, x0, z0, x1, z1, y + 0.06, 0.08);
  }
  /* 灯台（夜・夕は灯をともす） */
  function toudai(g, env, x, z, y) {
    y = y || 0;
    K.cy(g, 0.11, 0.03, M().kuro, x, y, z, 10); K.cy(g, 0.014, 0.85, M().kuro, x, y, z, 6); K.cy(g, 0.08, 0.02, M().kuro, x, y + 0.85, z, 10);
    if (env.dark) {
      var f = new T.Sprite(new T.SpriteMaterial({ map: K.tex.glow(), color: 0xffc070, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      f.position.set(x, y + 0.95, z); f.scale.set(0.7, 0.7, 1); g.add(f);
      env.lamps.push({ x: x, y: y + 1.0, z: z, s: f });
    }
  }
  /* 金雲（すやり霞）：水平に寝かせた帯。斜め上から見ると絵巻の雲になる */
  function kinun(g, x, y, z, w, d, ry) {
    var p = K.pl(g, w, d, M().kinun, x, y, z); if (ry) p.rotation.y = ry; p.renderOrder = 6; p.receiveShadow = false; return p;
  }
  function kasumi(g, env, x, y, z, w, d) {
    var p = K.pl(null, w, d, M().kasumi, x, y, z); p.renderOrder = 7; p.receiveShadow = false; p.userData.dyn = true; g.add(p);
    env.drift.push({ o: p, x: x, sp: 0.12 + (x * 7 % 5) * 0.02 }); return p;
  }

  /* ---------- 草木 ---------- */
  var LEAF = {
    kiri:   { spring: ['#b3c78f', '#c5d3a0'], summer: ['#6f9a5e', '#84ab6c'], autumn: ['#c9a24a', '#b98a3c'], winter: null },
    sakura: { spring: ['#f3c9d2', '#f8e1e4'], summer: ['#6f9a5e', '#7fa868'], autumn: ['#c0703a', '#d19a4a'], winter: null },
    momiji: { spring: ['#a8c682', '#b9d090'], summer: ['#5f8f5a', '#6f9e62'], autumn: ['#c2452d', '#d98a3a'], winter: null },
    ume:    { spring: ['#e9a0a8', '#f4d0d0'], summer: ['#6f9a5e', '#7fa868'], autumn: ['#b99a52', '#a88844'], winter: null },
    nashi:  { spring: ['#f4f2e8', '#e6ecd8'], summer: ['#6f9a5e', '#84ab6c'], autumn: ['#c9a24a', '#b9763c'], winter: null },
    matsu:  { spring: ['#3f5a3c', '#4a6846'], summer: ['#3f5a3c', '#4a6846'], autumn: ['#3f5a3c', '#4a6846'], winter: ['#3f5a3c', '#4a6846'] }
  };
  function tree(g, env, kind, x, y, z, s, seed) {
    var r = K.rng(seed || (x * 31 + z * 17 + 7)), t = K.grp(g, x, y, z), c = (LEAF[kind] || LEAF.sakura)[env.season], snow = env.season === 'winter';
    s = s || 1;
    var H = (kind === 'matsu' ? 2.6 : 3.0) * s, tr = K.cy(t, 0.16 * s, H, M().miki, 0, 0, 0, 6); tr.rotation.z = (r() - 0.5) * 0.16;
    var can = K.grp(t, 0, 0, 0); can.userData.dyn = true;
    var nb = env.low ? 4 : 6, i;
    for (i = 0; i < nb; i++) {
      var a = i / nb * PI * 2 + r(), len = (1.1 + r() * 0.9) * s, up = H * (0.62 + r() * 0.34), bx = Math.cos(a) * len, bz = Math.sin(a) * len;
      var br = K.bx(can, len * 1.05, 0.07 * s, 0.07 * s, M().miki, bx / 2, up + 0.1 * s, bz / 2); br.rotation.set(0, -a, 0.35);
      var by = up + len * 0.38;
      if (c) {
        var m = new T.Mesh(K.G.ico(1), K.mat(c[i % 2])); m.castShadow = true;
        if (kind === 'matsu') m.scale.set(1.0 * s, 0.32 * s, 0.9 * s); else m.scale.set((0.85 + r() * 0.4) * s, (0.55 + r() * 0.25) * s, (0.8 + r() * 0.4) * s);
        m.position.set(bx, by, bz); can.add(m);
        if (kind === 'kiri' && env.season === 'summer') {          // 桐の花：初夏、枝先に紫の花房が立つ
          for (var j = 0; j < 3; j++) { var f = new T.Mesh(K.G.cone(6), K.mat(j % 2 ? WA.kiri : '#b9a2d6')); f.scale.set(0.16 * s, 0.5 * s, 0.16 * s); f.position.set(bx + (r() - 0.5) * 0.9 * s, by + 0.62 * s, bz + (r() - 0.5) * 0.9 * s); can.add(f); }
        }
      }
      if (snow) { var sn = new T.Mesh(K.G.ico(0), M().yuki); sn.scale.set(0.5 * s, 0.14 * s, 0.4 * s); sn.position.set(bx * 0.9, by + (c ? 0.3 * s : -0.1), bz * 0.9); can.add(sn); }
    }
    if (c && kind !== 'matsu') { var top = new T.Mesh(K.G.ico(1), K.mat(c[1])); top.scale.set(1.1 * s, 0.8 * s, 1.1 * s); top.position.set(0, H + 0.5 * s, 0); top.castShadow = true; can.add(top); }
    K.bake(can);
    env.sway.push({ o: can, ax: 'z', amp: 0.006, ph: x + z * 0.7, piv: 1 });
    return t;
  }
  function bamboo(g, env, x, y, z, n) {                              // 呉竹・河竹
    var r = K.rng(x * 13 + z), i, t = K.grp(g, x, y, z);
    K.bx(t, 1.3, 0.35, 1.3, M().nageshi, 0, 0.17, 0);
    for (i = 0; i < (n || 7); i++) {
      var px = (r() - 0.5) * 0.9, pz = (r() - 0.5) * 0.9, h = 2.2 + r() * 1.2;
      K.cy(t, 0.03, h, M().take, px, 0, pz, 5);
      var m = new T.Mesh(K.G.ico(0), K.mat(env.season === 'winter' ? '#8fa88a' : '#7fa56c')); m.scale.set(0.45, 0.25, 0.45); m.position.set(px, h, pz); t.add(m);
    }
  }
  /* 草むら（八重葎・すすき・前栽） */
  function grass(g, env, x0, z0, x1, z1, y, n, tall, cols) {
    var r = K.rng(x0 * 7 + z0 * 3 + n), i;
    cols = cols || (env.season === 'autumn' ? ['#b59a62', '#a3a060', '#c9b072'] : env.season === 'winter' ? ['#b8b29a', '#c9c4b0'] : ['#7d9a5a', '#8fa868', '#6f8f5a']);
    if (env.low) n = Math.ceil(n * 0.45);
    for (i = 0; i < n; i++) {
      var m = new T.Mesh(K.G.cone(5), K.mat(cols[i % cols.length])), h = (tall || 0.5) * (0.6 + r() * 0.8);
      m.scale.set(0.12 + r() * 0.12, h, 0.12 + r() * 0.12); m.position.set(K.lerp(x0, x1, r()), y + h / 2, K.lerp(z0, z1, r())); m.rotation.z = (r() - 0.5) * 0.5; g.add(m);
    }
  }
  function rock(g, x, y, z, s) { var m = new T.Mesh(K.G.ico(0), M().iwa); m.scale.set(s, s * 0.6, s * 0.8); m.position.set(x, y + s * 0.25, z); m.rotation.y = x; m.castShadow = true; g.add(m); }
  function groundCol(env, base) {
    if (env.season === 'winter') return WA.yuki;
    return base || WA.suna;
  }

  /* ---------- 殿（寝殿造りの一室）の骨組み ---------- */
  function den(env, o) {
    o = o || {};
    var g = new T.Group(), m = M(), bx = o.bx || 4, W = bx * KEN, x0 = -W / 2, x1 = W / 2, z0 = -2 * KEN, lx = x0 - KEN, sx = lx - 1.3, fz = KEN, sz = KEN + 1.3, rx = x1 + 1.4, i;
    var fm = o.old ? m.itaD : m.ita;
    /* 地面と床下 */
    K.pl(g, 90, 90, K.mat(groundCol(env, o.ground)), -4, -FH, 0);
    K.bx(g, rx - sx - 0.5, FH - 0.2, sz - z0 - 0.4, m.shita, (rx + sx) / 2, -FH / 2 - 0.1, (sz + z0) / 2, 0, false);
    /* 床：母屋・廂（同じ高さ）と、一段低い簀子 */
    slab(g, lx, z0, rx, fz, 0, 0.16); floorTop(g, lx, z0, rx, fz, 0, fm);
    slab(g, sx, z0, lx, sz, -0.1, 0.1); floorTop(g, sx, z0, lx, sz, -0.1, fm);
    slab(g, lx, fz, rx, sz, -0.1, 0.1); floorTop(g, lx, fz, rx, sz, -0.1, fm);
    /* 下長押（母屋と廂の境） */
    beam(g, x0, 0, x1, 0, 0.03, 0.07, m.wood); beam(g, x0, z0, x0, 0, 0.03, 0.07, m.wood);
    /* 柱：母屋の四周、廂の外まわり */
    for (i = 0; i <= bx; i++) { pillar(g, x0 + i * KEN, z0, PH, 0.11); pillar(g, x0 + i * KEN, 0, PH, 0.11); }
    pillar(g, x0, -KEN, PH, 0.11);
    for (i = -1; i <= bx; i += 1) if (i === -1 || i % 2 === 0) pillar(g, x0 + i * KEN, fz, PH, 0.09);
    pillar(g, lx, z0, PH, 0.09); pillar(g, lx, -KEN, PH, 0.09); pillar(g, lx, 0, PH, 0.09);
    /* 長押：奥と左だけ（手前は吹抜で省く） */
    beam(g, lx, z0, x1, z0, PH - 0.2, 0.16); beam(g, lx, z0, lx, fz, PH - 0.2, 0.14); beam(g, x0, z0, x0, 0, PH - 0.2, 0.14);
    beam(g, lx, z0, x1, z0, PH - 0.02, 0.1, m.hashira);
    /* 奥の壁（1 間ずつ）：襖障子 / 御簾 / 壁 / 蔀 */
    var back = o.back || ['fusuma', 'misu', 'fusuma', 'kabe'];
    for (i = 0; i < bx; i++) {
      var cx = x0 + (i + 0.5) * KEN, t = back[i % back.length];
      if (t === 'fusuma') K.vp(g, KEN - 0.2, 1.9, m.yamatoe, cx, 0.05, z0 + 0.02, 0, 1, 1);
      else if (t === 'misu') misu(g, env, cx, z0 + 0.05, KEN - 0.22, 0, 0.05);
      else if (t === 'shitomi') K.vp(g, KEN - 0.2, 1.9, m.koshi, cx, 0.05, z0 + 0.02, 0, 3, 3);
      else if (t === 'kabe') K.vp(g, KEN - 0.2, 1.9, K.mat(WA.kabe, { side: T.DoubleSide }), cx, 0.05, z0 + 0.02, 0);
    }
    K.vp(g, KEN - 0.2, 1.9, m.koshi, lx + KEN / 2, 0.05, z0 + 0.02, 0, 3, 3);
    /* 左：母屋と左廂の境に御簾（内に人影）。廂の外は巻き上げた御簾 */
    misu(g, env, x0, -1.5 * KEN, KEN - 0.22, PI / 2, 0.05);
    misu(g, env, x0, -0.5 * KEN, KEN - 0.22, PI / 2, o.leftOpen === false ? 0.05 : 1.55);
    misu(g, env, lx, -1.5 * KEN, KEN - 0.22, PI / 2, 1.6); misu(g, env, lx, -0.5 * KEN, KEN - 0.22, PI / 2, 1.6); misu(g, env, lx, 0.5 * KEN, KEN - 0.22, PI / 2, 1.6);
    /* 高欄と階 */
    kouran(g, sx + 0.06, z0, sx + 0.06, -0.3, -0.1); kouran(g, sx + 0.06, 1.5, sx + 0.06, sz - 0.06, -0.1);
    if (!o.noFrontRail) kouran(g, sx + 0.06, sz - 0.06, rx, sz - 0.06, -0.1);
    for (i = 0; i < 3; i++) K.bx(g, 0.36, 0.14, 1.6, m.wood, sx - 0.2 - i * 0.36, -0.2 - i * 0.18, 0.6);
    /* 右は切り取って金雲で霞ませる（吹抜屋台の端） */
    if (!env.noKumo) {
      kinun(g, rx + 2.6, 0.6, -1.5, 9, 4.4, 0.1); kinun(g, rx + 1.4, 1.5, 3.4, 8, 3.4, -0.08);
      kinun(g, -3, 2.9, z0 - 3.2, 13, 5.2, 0.04); kinun(g, sx - 9, 0.4, z0 - 1, 9, 4, 0.2); kinun(g, sx - 7.5, 0.2, sz + 2.5, 10, 4, -0.1);
    }
    var slots = {
      kami: [0.4, -2.9, 0.12], kamiL: [-2.3, -2.9, 0.35], kamiR: [2.9, -2.9, -0.3],
      naka: [0.3, -0.95, PI * 0.86], nakaL: [-2.1, -1.15, 1.25], nakaR: [2.6, -1.15, -1.3],
      shimo: [0.5, 1.1, PI], shimoL: [-2.2, 1.1, 2.6], shimoR: [2.9, 1.1, -2.65],
      sunoko: [sx + 0.7, -0.9, PI / 2, -0.1], niwa: [sx - 2.8, 0.8, PI / 2, -FH], misu: [x0 - 1.1, -1.5 * KEN, PI / 2 + 0.2], to: [rx - 0.5, 1.15, -PI / 2]
    };
    return { g: g, slots: slots, x0: x0, x1: x1, z0: z0, lx: lx, sx: sx, fz: fz, sz: sz, rx: rx,
      cam: { t: [-1.0, 0.5, -0.9], az: 0.42, el: 0.7, rh: 7.3, rv: 4.3 }, figScale: 1.22, focusDist: 5.6, shadowR: 11, amb: { x: sx - 4, z: 0, r: 7, y: 6 } };
  }
  function finish(d, env) { K.bake(d.g); d.sway = env.sway; d.lamps = env.lamps; d.drift = env.drift; return d; }
  function sl(d, name, x, z, ry, y) { d.slots[name] = [x, z, ry || 0, y || 0]; }

  /* ---------- 淑景舎（桐壺）：壺庭に桐の木 ---------- */
  function kiritsubo(env) {
    var d = den(env, { back: ['fusuma', 'misu', 'fusuma', 'kabe'] }), g = d.g;
    tatami(g, 0.4, -2.9, 0, 'kourai'); shitone(g, 0.4, -2.9, '#b79ad0'); d.slots.kami[3] = 0.1;
    tatami(g, -2.2, -1.2, 1.25, 'kourai'); tatami(g, 2.6, -1.2, -1.3, 'kourai');
    kicho(g, env, -1.5, -3.3, 0.25, 'fuyu'); kicho(g, env, 3.9, -1.6, -1.2, 'ao');
    byobu(g, 2.4, -3.9, 0, 4);
    toudai(g, env, 1.5, -2.6);
    K.bx(g, 0.5, 0.3, 0.32, M().kuro, -0.9, 0.15, -3.5); K.bx(g, 0.3, 0.03, 0.2, K.mat('#efe6d0'), -0.9, 0.32, -3.5);   // 文箱
    /* 壺庭：白砂に桐の木と前栽、遣水 */
    tree(g, env, 'kiri', d.sx - 4.6, -FH, -1.6, 1.25, 3); tree(g, env, 'kiri', d.sx - 7.4, -FH, 2.6, 0.9, 9);
    grass(g, env, d.sx - 6, 2.5, d.sx - 1.5, 5, -FH, 16, 0.45);
    rock(g, d.sx - 2.6, -FH, 3.1, 0.5); rock(g, d.sx - 3.4, -FH, 3.5, 0.3);
    if (env.season !== 'winter') K.pl(g, 5.5, 0.9, M().mizu, d.sx - 5, -FH + 0.01, 4.4).rotation.y = 0.25;
    return finish(d, env);
  }
  /* ---------- 清涼殿：帝の御座 ---------- */
  function seiryoden(env) {
    var d = den(env, { back: ['fusuma', 'fusuma', 'misu', 'fusuma'] }), g = d.g, m = M();
    /* 昼の御座：繧繝縁の畳を二枚、その上に茵 */
    tatami(g, 0.4, -2.9, 0, 'ungen', 1.9, 1.05); tatami(g, 0.4, -2.9, 0, 'ungen', 1.7, 0.95, 0.06); shitone(g, 0.4, -2.9, '#b5432e', 0.12); d.slots.kami[3] = 0.16;
    /* 御帳台（夜の御殿の手がかり）：黒塗りの柱に帷。天井は吹抜で省く */
    var cx = -2.6, cz = -3.2;
    K.bx(g, 2.0, 0.22, 1.7, m.kuro, cx, 0.11, cz); K.pl(g, 1.8, 1.5, m.tatami, cx, 0.225, cz, 5, 8);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { K.bx(g, 0.06, 1.75, 0.06, m.kuro, cx + p[0] * 0.95, 0.22 + 0.875, cz + p[1] * 0.8); });
    beam(g, cx - 0.95, cz - 0.8, cx + 0.95, cz - 0.8, 1.97, 0.06, m.kuro); beam(g, cx - 0.95, cz - 0.8, cx - 0.95, cz + 0.8, 1.97, 0.06, m.kuro);
    var km = K.mat('#ffffff', { map: K.tex.katabira('mi', '#f8f4ea', '#e7c9a0', '#b5432e'), side: T.DoubleSide });
    K.vp(g, 1.84, 1.6, km, cx, 0.3, cz - 0.78, 0, 4, 1); K.vp(g, 1.56, 1.6, km, cx - 0.93, 0.3, cz, PI / 2, 3, 1);
    d.slots.kamiL = [cx + 1.6, -2.4, 0.5, 0];
    tatami(g, -1.9, -1.0, 1.25, 'kourai'); tatami(g, 2.6, -1.1, -1.3, 'kourai'); tatami(g, 0.4, 1.1, 0, 'kourai');
    kicho(g, env, 3.6, -3.0, -0.5, 'beni'); byobu(g, 2.2, -4.0, 0, 4, 1.6);
    toudai(g, env, 1.7, -2.5); toudai(g, env, -0.9, -2.5);
    /* 東庭の呉竹・河竹 */
    bamboo(g, env, d.sx - 3, -FH, -2.2, 8); bamboo(g, env, d.sx - 5.5, -FH, 2.4, 6);
    tree(g, env, 'matsu', d.sx - 8, -FH, -3.5, 1.1, 5);
    return finish(d, env);
  }
  /* ---------- 弘徽殿：威のあるしつらい ---------- */
  function kokiden(env) {
    var d = den(env, { back: ['misu', 'fusuma', 'fusuma', 'misu'] }), g = d.g;
    tatami(g, 0.4, -2.9, 0, 'kourai', 1.9, 1.05); shitone(g, 0.4, -2.9, '#a3202c'); d.slots.kami[3] = 0.1;
    tatami(g, -2.2, -1.2, 1.25, 'kourai'); tatami(g, 2.6, -1.2, -1.3, 'kourai'); tatami(g, -2.2, 1.1, 0.4, 'kourai'); tatami(g, 2.9, 1.1, -0.4, 'kourai');
    kicho(g, env, -1.6, -3.4, 0.2, 'beni'); kicho(g, env, 2.5, -3.5, -0.2, 'beni'); kicho(g, env, 3.9, -0.4, -1.3, 'beni');
    byobu(g, 0.4, -4.05, 0, 6, 1.7);
    toudai(g, env, 1.6, -2.5);
    K.bx(g, 0.9, 0.5, 0.4, M().kuro, -3.6, 0.25, -3.8); K.bx(g, 0.92, 0.03, 0.42, M().kin, -3.6, 0.5, -3.8);      // 二階厨子
    tree(g, env, 'momiji', d.sx - 4.2, -FH, -1.8, 1.1, 21); tree(g, env, 'matsu', d.sx - 6.8, -FH, 2.8, 1.0, 22);
    rock(g, d.sx - 2.4, -FH, 2.8, 0.55);
    return finish(d, env);
  }
  /* ---------- 更衣の里邸：荒れかけた庭、野分のあと ---------- */
  function sato(env) {
    var d = den(env, { back: ['kabe', 'fusuma', 'misu', 'shitomi'], old: 1, ground: '#c9bd9c' }), g = d.g;
    tatami(g, 0.4, -2.9, 0, 'kourai'); d.slots.kami[3] = 0.06;
    tatami(g, 0.3, -0.95, 0, 'kourai');
    kicho(g, env, -1.35, -3.55, 0.3, 'nibi'); kicho(g, env, 3.4, -2.4, -0.9, 'nibi');   /* 左の几帳は kamiL（母の座）にかからないよう奥へ */
    toudai(g, env, 1.6, -2.5);
    /* 草も高くなり、野分にいとど荒れたる庭。倒れた透垣 */
    var sx = d.sx;
    grass(g, env, sx - 9, -4, sx - 0.6, 6, -FH, 110, 0.95);
    grass(g, env, sx - 8, -3, sx - 1, 5, -FH, 26, 1.5, ['#d9cfa8', '#c9bd8f']);                 // すすき
    grass(g, env, d.lx, d.sz + 0.3, d.rx, d.sz + 3, -FH, 40, 0.8);
    tree(g, env, 'momiji', sx - 5.2, -FH, -2.2, 1.1, 41); tree(g, env, 'matsu', sx - 8.4, -FH, 3.2, 1.0, 42);
    var f = K.grp(g, sx - 3.4, -FH, 4.6, 0.3); f.rotation.z = 0.5; K.bx(f, 3.2, 0.06, 0.06, M().shiba, 0, 0.9, 0); K.bx(f, 3.2, 0.06, 0.06, M().shiba, 0, 0.3, 0);
    for (var i = 0; i < 12; i++) K.bx(f, 0.05, 1.0, 0.03, M().shiba, -1.5 + i * 0.27, 0.55, 0);
    rock(g, sx - 2.2, -FH, 2.2, 0.5);
    return finish(d, env);
  }

  /* ---------- 北山の僧坊：小柴垣・西面の持仏・簾を少し上げて ---------- */
  var FENCE_Z = 8.4;   /* 垣は部屋から十分に離す（垣間見で、垣の向こうに部屋が遠く見えるように） */
  var FENCE = [[-8, -2.7, 1], [-2.7, -1.9, 0], [-1.9, -0.8, 1], [-0.8, 0.3, 0], [0.3, 1.0, 1], [1.0, 1.9, 0], [1.9, 2.7, 1], [2.7, 3.6, 0], [3.6, 9, 1]];   // [x0,x1,密]
  function soubou(env, opt) {
    opt = opt || {};
    var d = den(env, { back: ['kabe', 'fusuma', 'kabe', 'shitomi'], old: 1, ground: '#c7bf9a', noFrontRail: 1, leftOpen: false }), g = d.g, m = M(), i;
    /* 西面（手前の廂）：持仏を据え、花を奉る棚 */
    var jx = -3.6, jz = 1.0;
    K.bx(g, 0.9, 0.5, 0.7, m.kuro, jx, 0.25, jz); K.bx(g, 0.5, 0.08, 0.5, m.kin, jx, 0.54, jz);
    var bd = new T.Mesh(K.G.sph(10, 8), m.kin); bd.scale.set(0.2, 0.26, 0.17); bd.position.set(jx, 0.82, jz); g.add(bd);
    var hd = new T.Mesh(K.G.sph(10, 8), m.kin); hd.scale.setScalar(0.11); hd.position.set(jx, 1.16, jz); g.add(hd);
    var halo = new T.Mesh(K.G.disc(), K.mat(WA.kinpaku, { side: T.DoubleSide })); halo.scale.setScalar(0.3); halo.rotation.set(0, 0, PI / 2); halo.position.set(jx - 0.14, 1.1, jz); g.add(halo);
    K.bx(g, 0.5, 0.3, 0.36, m.wood, jx + 0.85, 0.15, jz);                                     // 閼伽棚
    [-0.12, 0.12].forEach(function (o) { K.cy(g, 0.035, 0.12, K.mat('#8fa0a8'), jx + 0.85 + o, 0.3, jz, 6); var fl = new T.Mesh(K.G.ico(0), K.mat(WA.sakura)); fl.scale.setScalar(0.08); fl.position.set(jx + 0.85 + o, 0.5, jz); g.add(fl); });
    /* 尼君の座：中の柱に寄り、脇息の上に経 */
    tatami(g, -0.7, 0.75, 0.25, 'kourai');
    K.bx(g, 0.5, 0.04, 0.16, m.kuro, -1.25, 0.36, 1.2, 0.5); K.bx(g, 0.04, 0.3, 0.14, m.kuro, -1.45, 0.2, 1.1, 0.5); K.bx(g, 0.04, 0.3, 0.14, m.kuro, -1.05, 0.2, 1.3, 0.5);
    K.bx(g, 0.3, 0.02, 0.12, K.mat('#efe6d0'), -1.25, 0.39, 1.2, 0.5);
    tatami(g, 1.9, -1.1, -0.4, 'kourai'); kicho(g, env, 3.6, -2.6, -0.9, 'nibi'); kicho(g, env, -2.4, -2.8, 0.3, 'nibi');
    toudai(g, env, 0.9, -2.6);
    /* 手前（西面）の御簾：少し上げて。俯瞰では中が見えるよう、巻き上げた形だけ */
    for (i = -1; i < 4; i++) misu(g, env, d.x0 + (i + 0.5) * KEN, d.fz, KEN - 0.2, 0, opt.kaimami ? (i === 1 || i === 2 || i === 0 ? 1.5 : 0.95) : 1.7);
    /* 庭：山桜、小柴垣 */
    var gy = -FH, r = K.rng(61);
    tree(g, env, 'sakura', d.sx - 3.5, gy, -2.5, 1.2, 62); tree(g, env, 'sakura', 7.6, gy, 4.6, 1.0, 63); if (!opt.kaimami) tree(g, env, 'sakura', -9.5, gy, 5.2, 0.9, 64);
    grass(g, env, -9, 4, 9, FENCE_Z - 0.4, gy, 46, 0.4); rock(g, 2.6, gy, 5.6, 0.45); rock(g, -1.8, gy, 6.4, 0.32);
    FENCE.forEach(function (f) {
      var x, top = f[2] ? 1.95 : 0.95, n = 0;
      for (x = f[0]; x < f[1]; x += f[2] ? 0.075 : 0.13) {
        var h = top * (0.88 + r() * 0.16), s = K.bx(g, 0.035, h, 0.035, n++ % 3 ? m.shiba : K.mat('#8f7556'), x, gy + h / 2, FENCE_Z + (r() - 0.5) * 0.07); s.rotation.z = (r() - 0.5) * 0.12;
      }
      beam(g, f[0], FENCE_Z + 0.05, f[1], FENCE_Z + 0.05, gy + top * 0.3, 0.05, K.mat('#9a8a5a')); if (f[2]) beam(g, f[0], FENCE_Z + 0.05, f[1], FENCE_Z + 0.05, gy + top * 0.62, 0.05, K.mat('#9a8a5a'));
    });
    for (var fz2 = -1.5; fz2 < FENCE_Z; fz2 += 0.1) { var hh = 1.2 * (0.85 + r() * 0.2); K.bx(g, 0.035, hh, 0.035, m.shiba, -8 + (r() - 0.5) * 0.06, gy + hh / 2, fz2); }
    /* 夕暮れの霞 */
    kasumi(g, env, -2, 1.8, FENCE_Z + 3.5, 26, 5); kasumi(g, env, 5, 2.6, -7, 30, 7);
    /* kamiR：尼君のすぐそば（左前、同じ畳の上）。若紫が尼君の方へ半ば向いて座る（髪をなでられる距離） */
    d.slots.kami = [-0.7, 0.75, 0.75, 0.065]; d.slots.kamiL = [-2.3, 0.6, 1.4, 0]; d.slots.kamiR = [-0.16, 0.82, -0.95, 0.065];
    /* naka・shimo は上座（kami の僧都・尼君）の方へ向く（客と主が向き合って話す） */
    d.slots.naka = [1.7, -1.1, -0.62, 0.065]; d.slots.nakaL = [0.2, -1.6, 0.4, 0]; d.slots.nakaR = [3.0, -1.4, -0.2, 0];
    d.slots.shimo = [3.3, 0.9, -1.25, 0]; d.slots.shimoL = [2.2, 1.2, 0.3, 0]; d.slots.shimoR = [4.6, 0.6, -0.9, 0];
    d.slots.sunoko = [1.6, d.fz + 0.65, 0, -0.1]; d.slots.niwa = [3.2, 4.6, PI, -FH]; d.slots.to = [d.rx - 0.5, -0.6, -PI / 2, 0];
    sl(d, 'jibutsu', jx + 1.7, jz + 0.1, -PI / 2, 0);
    sl(d, 'kaki', 0.5, FENCE_Z + 0.75, PI, -FH); sl(d, 'kakiL', -1.1, FENCE_Z + 0.8, PI - 0.2, -FH); sl(d, 'kakiR', 2.1, FENCE_Z + 0.8, PI + 0.2, -FH);
    d.cam = { t: [-0.4, 0.3, 2.6], az: 0.36, el: 0.8, rh: 9.8, rv: 7.4 };
    d.fence = { z: FENCE_Z, panels: FENCE, top: gy + 1.9, low: gy + 0.98, eye: gy + 1.5 };
    d.amb = { x: 0, z: 4, r: 8, y: 6 };
    return finish(d, env);
  }

  /* ---------- 渡殿・馬道：長い廊。両側に戸 ---------- */
  function corridorBay(g, env, x, z, dirX, dirZ, len, wd, kindL, kindR, idx) {
    /* 1 間ぶんの床・柱・両側の壁（道の向きに沿って置く） */
    var m = M(), ry = -Math.atan2(dirZ, dirX), nx = -dirZ, nz = dirX, c = K.grp(g, x, 0, z, ry);
    K.bx(c, len, 0.14, wd, m.slab, 0, -0.074, 0); K.pl(c, len, wd, m.ita, 0, 0, 0, len / 2.4, wd / 2.4);
    [[-1, kindL], [1, kindR]].forEach(function (s) {
      var zz = s[0] * wd / 2, k = s[1];
      K.cy(c, 0.09, PH, m.hashira, -len / 2, 0, zz, 8);
      K.bx(c, len, 0.12, 0.12, m.nageshi, 0, PH - 0.2, zz);
      if (k === 'open') { K.bx(c, len, 0.06, 0.06, m.nageshi, 0, 0.7, zz); K.bx(c, len, 0.05, 0.05, m.nageshi, 0, 0.4, zz); K.bx(c, 0.06, 0.7, 0.06, m.nageshi, 0, 0.35, zz); }
      else if (k) K.vp(c, len - 0.16, PH - 0.3, K.mat('#ffffff', { map: K.tex.kabe(k), side: T.DoubleSide }), 0, 0.02, zz, 0);
    });
    return c;
  }
  function watadono(env) {
    var g = new T.Group(), L = 22, wd = 3.0, n = 10, i, bl = L / n, kinds = ['to', 'misu', 'shitomi', 'misu', 'to', 'misu', 'open', 'to', 'misu', 'shitomi'];
    K.pl(g, 90, 90, K.mat(groundCol(env)), 0, -FH, 0);
    K.bx(g, wd - 0.3, FH - 0.2, L, M().shita, 0, -FH / 2 - 0.1, -L / 2 + 3, 0, false);
    for (i = 0; i < n; i++) corridorBay(g, env, 0, 3 - (i + 0.5) * bl, 0, -1, bl, wd, kinds[i], kinds[(i * 3 + 4) % n], i);
    /* 両側の局（つぼね）の床と、のぞく几帳 */
    [-1, 1].forEach(function (s) {
      K.bx(g, 5, 0.16, L, M().slab, s * (wd / 2 + 2.5), -0.09, -L / 2 + 3); floorTop(g, s * (wd / 2 + 2.5) - 2.5, -L + 3, s * (wd / 2 + 2.5) + 2.5, 3, 0);
      for (i = 0; i < 4; i++) { kicho(g, env, s * (wd / 2 + 1.6), 1 - i * 5.2, s * PI / 2 + 0.3, ['beni', 'fuyu', 'ao', 'beni'][i]); tatami(g, s * (wd / 2 + 2.9), -1 - i * 5.2, 0.2 * s, 'kourai'); }
    });
    tree(g, env, 'matsu', -8.6, -FH, -6, 1, 71); tree(g, env, 'momiji', 8.8, -FH, -12, 1, 72);
    kinun(g, -10, 1.2, -4, 9, 5); kinun(g, 10.5, 1.6, -9, 9, 5); kinun(g, 0, 2.6, -L - 0.5, 13, 5); kinun(g, -7, 0.6, 6, 9, 3.5); kinun(g, 8, 0.6, 5.5, 8, 3.5);
    var zs = function (f) { return 3 - L * f; };
    var slots = {
      oku: [0, zs(0.9), 0], temae: [0, zs(0.08), PI], kami: [0, zs(0.88), 0], kamiL: [-0.8, zs(0.8), 0.3], kamiR: [0.8, zs(0.8), -0.3],
      naka: [0, zs(0.5), PI], nakaL: [-0.85, zs(0.55), 1.2], nakaR: [0.85, zs(0.45), -1.2],
      shimo: [0, zs(0.2), PI], shimoL: [-0.8, zs(0.27), 2.7], shimoR: [0.8, zs(0.15), -2.7],
      sunoko: [0.9, zs(0.66), -PI / 2], niwa: [-7, 1, PI / 2, -FH], misu: [wd / 2 + 1.0, zs(0.43), -PI / 2], to: [-wd / 2 + 0.5, zs(0.62), PI / 2]
    };
    var env2 = env, d = { g: g, slots: slots, cam: { t: [0, 0.6, -7.2], az: 0.2, el: 0.74, rh: 6.5, rv: 9.2 }, figScale: 1, focusDist: 5.2, shadowR: 14, standing: 1, amb: { x: 0, z: -7, r: 8, y: 6 } };
    return finish(d, env);
  }

  /* ---------- 後宮（内裏の北半分）の俯瞰 ---------- */
  /* 平面図（北が -Z・東が +X）。殿舎の位置関係は内裏図による。寸法は簡略 */
  var PLAN = S.PLAN = {
    halls: [
      { id: 'seiryoden', name: '清涼殿', x: -12, z: 6, w: 7, d: 13, key: 1, col: '#c9a44a' },
      { id: 'kokiden', name: '弘徽殿', x: -12, z: -8.2, w: 7, d: 10, key: 1, col: '#b5432e' },
      { id: 'kiritsubo', name: '淑景舎（桐壺）', x: 24, z: -21, w: 8, d: 7, key: 1, col: '#a58bc4', tree: 'kiri' },
      { id: 'toka', name: '登花殿', x: -12, z: -21, w: 7, d: 9 },
      { id: 'jogan', name: '貞観殿', x: 0, z: -21.5, w: 11, d: 6 },
      { id: 'jonei', name: '常寧殿', x: 0, z: -11.5, w: 11, d: 5.6 },
      { id: 'shokyo', name: '承香殿', x: 0, z: -3, w: 11, d: 6 },
      { id: 'jiju', name: '仁寿殿', x: 0, z: 8, w: 11, d: 8 },
      { id: 'senyo', name: '宣耀殿', x: 12, z: -21, w: 7, d: 8.5 },
      { id: 'reikei', name: '麗景殿', x: 12, z: -9.6, w: 7, d: 9.4 },
      { id: 'ryoki', name: '綾綺殿', x: 12, z: 8, w: 6, d: 9 },
      { id: 'shoyo', name: '昭陽舎（梨壺）', x: 24, z: -10, w: 8, d: 7, tree: 'nashi' },
      { id: 'unmei', name: '温明殿', x: 24, z: 8, w: 6, d: 10 },
      { id: 'higyo', name: '飛香舎（藤壺）', x: -24, z: -6, w: 8, d: 7, tree: 'fuji' },
      { id: 'gyoka', name: '凝花舎（梅壺）', x: -24, z: -15.5, w: 8, d: 6, tree: 'ume' },
      { id: 'shuho', name: '襲芳舎', x: -24, z: -24.5, w: 8, d: 6 },
      { id: 'koryo', name: '後涼殿', x: -20.5, z: 7, w: 5, d: 12 }
    ],
    /* 桐壺から清涼殿（上の御局）へ。宣耀殿・麗景殿、貞観殿・常寧殿、弘徽殿の前を通る */
    route: [[19.6, -20.5], [17.2, -20.5], [17.2, -15.9], [6, -15.9], [-7.2, -15.9], [-7.2, -1.6], [-10.2, -1.6], [-10.2, 1.6]]
  };
  function pathOf(pts, sc) {
    var p = pts.map(function (q) { return [q[0] * sc, q[1] * sc]; }), cum = [0], i;
    for (i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.sqrt(Math.pow(p[i][0] - p[i - 1][0], 2) + Math.pow(p[i][1] - p[i - 1][1], 2)));
    var len = cum[cum.length - 1];
    function raw(s) {
      s = K.clamp(s, 0, len); var k = 1; while (k < p.length - 1 && cum[k] < s) k++;
      var f = (s - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]), a = p[k - 1], b = p[k], L = cum[k] - cum[k - 1];
      return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L };
    }
    return { pts: p, cum: cum, len: len, at: raw,
      /* 曲がり角でカメラが急に振れないよう、前後をならした向き */
      dir: function (s, w) { var a = raw(s - (w || 1.6)), b = raw(s + (w || 1.6)), dx = a.dx + b.dx, dz = a.dz + b.dz, l = Math.sqrt(dx * dx + dz * dz) || 1; return [dx / l, dz / l]; } };
  }
  S.pathOf = pathOf;
  function miniTree(g, env, kind, x, z) {
    var c = kind === 'fuji' ? (env.season === 'summer' || env.season === 'spring' ? [WA.fuji, '#b9a2d6'] : LEAF.kiri[env.season]) : (LEAF[kind] || LEAF.sakura)[env.season];
    K.cy(g, 0.14, 1.5, M().miki, x, 0, z, 5);
    if (kind === 'kiri' && env.season === 'summer') c = [WA.kiri, '#8fae7e'];
    if (c) [0, 1, 2].forEach(function (i) { var m = new T.Mesh(K.G.ico(0), K.mat(c[i % 2])); m.scale.set(0.9, 0.6, 0.9); m.position.set(x + Math.cos(i * 2.1) * 0.6, 1.7 + (i % 2) * 0.4, z + Math.sin(i * 2.1) * 0.6); m.castShadow = true; g.add(m); });
    else { var s = new T.Mesh(K.G.ico(0), M().yuki); s.scale.set(0.7, 0.2, 0.7); s.position.set(x, 1.6, z); g.add(s); }
  }
  function hallMass(g, env, h) {
    var m = M(), wall = K.mat(h.key ? '#eadfc4' : '#ddd1b6'), fy = 0.55;
    K.bx(g, h.w, fy, h.d, m.slab, h.x, fy / 2, h.z);
    K.bx(g, h.w - 1.2, 1.5, h.d - 1.2, wall, h.x, fy + 0.75, h.z);
    K.bx(g, h.w - 1.14, 0.16, h.d - 1.14, m.nageshi, h.x, fy + 1.05, h.z);
    var rf = new T.Mesh(K.roof(h.w + 1.0, h.d + 1.0, 2.1), env.season === 'winter' ? K.mat('#e9edf0') : m.hiwada); rf.position.set(h.x, fy + 1.5, h.z); rf.castShadow = true; rf.receiveShadow = true; g.add(rf);
    K.bx(g, h.w + 1.0, 0.1, h.d + 1.0, m.nageshi, h.x, fy + 1.47, h.z);
    var long = h.w >= h.d, rl = Math.max(0.4, (long ? h.w : h.d) / 2 - (long ? h.d : h.w) / 2 * 0.8 + 0.5) * 2;
    K.bx(g, long ? rl : 0.28, 0.2, long ? 0.28 : rl, m.nageshi, h.x, fy + 3.65, h.z);
  }
  function kokyu(env) {
    var g = new T.Group(), m = M(), i;
    K.pl(g, 140, 140, K.mat(groundCol(env)), 0, 0, 0);
    PLAN.halls.forEach(function (h) {
      hallMass(g, env, h);
      if (h.tree) miniTree(g, env, h.tree, h.x - h.w / 2 - 1.3, h.z + h.d / 2 - 1.2);
      var lb = K.label(h.name.replace(/（.*/, h.id === 'kiritsubo' ? '(桐壺)' : ''), { px: h.key ? 0 : 0, bg: h.key ? 'rgba(252,246,228,.98)' : 'rgba(244,238,220,.86)', edge: h.col || '#6b5a44' });
      if (h.id === 'kiritsubo') { lb = K.label('桐壺', { bg: 'rgba(252,246,228,.98)', edge: h.col }); }
      lb.userData.label.px = h.key ? 62 : 40; lb.userData.minor = !h.key;
      lb.position.set(h.x, 4.6, h.z); g.add(lb);
    });
    /* 渡殿（殿舎をつなぐ廊）と、まわりの廊 */
    function roka(x0, z0, x1, z1) {
      var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), ry = -Math.atan2(dz, dx), c = K.grp(g, (x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
      K.bx(c, L, 0.5, 1.5, m.slab, 0, 0.25, 0); K.bx(c, L, 0.12, 1.9, env.season === 'winter' ? K.mat('#e9edf0') : K.mat('#5a4636'), 0, 1.75, 0);
      var n = Math.max(1, Math.round(L / 1.6)); for (var k = 0; k <= n; k++) { K.bx(c, 0.1, 1.25, 0.1, m.hashira, -L / 2 + L * k / n, 1.1, 0.7); K.bx(c, 0.1, 1.25, 0.1, m.hashira, -L / 2 + L * k / n, 1.1, -0.7); }
    }
    var R = PLAN.route; for (i = 1; i < R.length; i++) roka(R[i - 1][0], R[i - 1][1], R[i][0], R[i][1]);
    roka(-5.5, -21.5, -8.5, -21.5); roka(5.5, -21.5, 8.5, -21.5); roka(15.5, -10, 20, -10); roka(-20, -6, -15.5, -6); roka(-12, -13.2, -12, -16.5); roka(0, -8.7, 0, -6); roka(0, 0, 0, 4);
    roka(-8.5, 8, -5.5, 8); roka(5.5, 8, 9, 8); roka(15, 8, 21, 8); roka(24, -17.5, 24, -13.5); roka(-24, -12.5, -24, -9.5); roka(-24, -21.5, -24, -18.5); roka(-18, 7, -15.5, 7);
    roka(-30, -29, 30, -29); roka(30, -29, 30, 14); roka(-30, -29, -30, 14);
    /* 道のりを朱の点線で（屋根越しにも見える） */
    var P = pathOf(PLAN.route, 1), rm = K.mat(WA.shu, { basic: true, depthTest: false, fog: false, transparent: true, opacity: 0.95 }), s;
    for (s = 0; s <= P.len; s += 1.0) { var q = P.at(s), dd = K.bx(g, 0.56, 0.05, 0.3, rm, q.x, 2.1, q.z, -Math.atan2(q.dz, q.dx), false); dd.renderOrder = 15; dd.receiveShadow = false; }
    /* 金雲：南（紫宸殿の方）と四隅を霞ませる */
    kinun(g, 8, 4, 20, 46, 13); kinun(g, -22, 3.2, 22, 30, 10, 0.1); kinun(g, 34, 3, -6, 22, 10, 1.4); kinun(g, -36, 3, -12, 24, 10, 1.5); kinun(g, 2, 2.6, -35, 44, 9); kinun(g, 30, 5, 18, 22, 9, 0.3);
    var f = function (x, z, ry) { return [x, z, ry || 0, 0]; };
    var slots = {
      seiryoden: f(-6.6, 5, PI / 2), kokiden: f(-6.4, -9.5, PI / 2), kiritsubo: f(18.4, -18.4, -PI / 2),
      michi1: f(12, -14.8, -PI / 2), michi2: f(0, -14.8, -PI / 2), michi3: f(-6.2, -5.5, PI),
      kami: f(-6.6, 3, PI / 2), kamiL: f(-6.6, 7, PI / 2), kamiR: f(-5, 10, 0.5), naka: f(4, -14.8, 0), nakaL: f(-3, -14.8, 0.6), nakaR: f(8.6, -14.8, -0.6),
      shimo: f(17.6, -14.4, -0.4), shimoL: f(14.6, -14.8, 0.3), shimoR: f(19, -16.4, -PI / 2), sunoko: f(-6.4, -12.5, PI / 2), niwa: f(6, 1, 0), misu: f(-6.2, -7.2, PI / 2), to: f(-8.8, -0.8, 0)
    };
    var d = { g: g, slots: slots, cam: { t: [1.5, 0, -8.5], az: -0.5, el: 0.9, rh: 31, rv: 21 }, figScale: 2.3, focusDist: 22, shadowR: 44, standing: 1, amb: { x: 0, z: -8, r: 30, y: 16 }, outdoor: 1 };
    return finish(d, env);
  }

  /* ---------- 北山：山桜と霞。高みから僧坊を見下ろす ---------- */
  function kitayama(env) {
    var g = new T.Group(), m = M(), r = K.rng(91), i;
    function H(x, z) {
      return 9.5 * Math.exp(-((x + 15) * (x + 15) + (z + 15) * (z + 15)) / 150) + 7.5 * Math.exp(-((x - 17) * (x - 17) + (z + 19) * (z + 19)) / 190)
        + 5.2 * Math.exp(-((x - 11) * (x - 11) + (z - 9) * (z - 9)) / 34) + 3 * Math.exp(-((x + 22) * (x + 22) + (z - 10) * (z - 10)) / 90)
        + 0.35 * Math.sin(x * 0.5) * Math.cos(z * 0.45);
    }
    var win = env.season === 'winter', aut = env.season === 'autumn';
    var lo = K.col(win ? '#e6eaec' : aut ? '#b7a56a' : '#a9b57a'), mid = K.col(win ? '#cfd8dc' : aut ? '#9a8a52' : '#6f9a72'), hi = K.col(win ? '#f4f6f8' : '#4f7f78');
    var sg = K.surf(40, 40, function (u, v, o) { o[0] = (u - 0.5) * 72; o[2] = (v - 0.5) * 72; o[1] = H(o[0], o[2]); }, false, false);
    var b = new K.Builder(); b.add(sg, function (v, out) { var t = K.clamp(v.y / 8, 0, 1); return t < 0.4 ? out.copy(lo).lerp(mid, t / 0.4) : out.copy(mid).lerp(hi, (t - 0.4) / 0.6); }); sg.dispose();
    var ter = new T.Mesh(b.build(), K.mat('#ffffff', { vc: true })); ter.receiveShadow = true; ter.userData.dyn = true; g.add(ter);
    /* つづら折りの道 */
    var road = [[-2.5, 1.5], [1, 3.2], [3.5, 2.2], [5.5, 4.8], [7.2, 4.4], [9.2, 7.2]], P = pathOf(road, 1), s;
    for (s = 0; s < P.len; s += 0.5) { var q = P.at(s); K.bx(g, 0.6, 0.06, 0.9, K.mat(win ? '#d8d2c2' : '#d2c29a'), q.x, H(q.x, q.z) + 0.04, q.z, -Math.atan2(q.dz, q.dx), false); }
    /* 僧坊（見下ろす小さな屋根）と小柴垣 */
    var bx = -4.5, bz = 0, by = H(bx, bz);
    K.bx(g, 6.4, 0.5, 4.4, m.slab, bx, by + 0.25, bz); K.bx(g, 5.4, 1.4, 3.4, K.mat('#ddd1b6'), bx, by + 1.2, bz);
    var rf = new T.Mesh(K.roof(7.6, 5.6, 1.9), win ? K.mat('#e9edf0') : m.hiwada); rf.position.set(bx, by + 1.9, bz); rf.castShadow = true; g.add(rf);
    K.bx(g, 3.2, 0.45, 2.6, m.slab, bx + 5.4, by + 0.22, bz - 1.4); var rf2 = new T.Mesh(K.roof(4, 3.4, 1.3), win ? K.mat('#e9edf0') : m.hiwada); rf2.position.set(bx + 5.4, by + 1.5, bz - 1.4); g.add(rf2); K.bx(g, 2.6, 1.1, 2.0, K.mat('#ddd1b6'), bx + 5.4, by + 0.95, bz - 1.4);
    for (i = 0; i < 80; i++) { var a = i / 80 * PI * 2, fx = bx + 1.6 + Math.cos(a) * 7.2, fz = bz - 0.4 + Math.sin(a) * 4.8; if (Math.abs(a - 0.5) < 0.16) continue; K.bx(g, 0.1, 0.95, 0.1, m.shiba, fx, H(fx, fz) + 0.45, fz); }
    var lb = K.label('僧坊', { bg: 'rgba(250,244,228,.95)' }); lb.userData.label.px = 44; lb.position.set(bx, by + 4.2, bz); g.add(lb);
    /* 聖の岩屋（高い峰の上） */
    var ix = -14, iz = -13.5, iy = H(ix, iz);
    rock(g, ix - 1.4, iy, iz - 0.6, 2.2); rock(g, ix + 1.5, iy, iz - 0.9, 1.9); rock(g, ix, iy + 1.6, iz - 1.1, 2.3);
    K.bx(g, 1.5, 1.5, 0.4, K.mat('#2a2622'), ix, iy + 0.75, iz - 0.1);
    var lb2 = K.label('聖の岩屋', { bg: 'rgba(250,244,228,.95)' }); lb2.userData.label.px = 52; lb2.position.set(ix, iy + 4.4, iz - 1); g.add(lb2);
    /* 山桜・松 */
    var n = env.low ? 26 : 60, c = LEAF.sakura[env.season];
    for (i = 0; i < n; i++) {
      var x = (r() - 0.5) * 60, z = (r() - 0.5) * 56 - 3, y = H(x, z), pine = r() < 0.3, sc = 0.7 + r() * 0.8;
      if (Math.abs(x - bx - 1.6) < 8 && Math.abs(z - bz) < 5.6) continue; if (Math.abs(x - 10.5) < 2.6 && Math.abs(z - 8.5) < 2.6) continue;
      K.cy(g, 0.12 * sc, 1.5 * sc, m.miki, x, y, z, 5);
      var col = pine ? [WA.matsu, '#4a6846'] : c;
      if (col) for (var j = 0; j < 2; j++) { var bl = new T.Mesh(K.G.ico(pine ? 0 : 1), K.mat(col[(i + j) % 2])); bl.scale.set((pine ? 1.0 : 1.5) * sc, (pine ? 1.5 : 1.0) * sc, (pine ? 1.0 : 1.4) * sc); bl.position.set(x + (j ? 0.7 * sc : 0), y + (1.8 + j * 0.5) * sc, z + (j ? 0.3 : 0)); bl.castShadow = true; g.add(bl); }
      else K.bx(g, 1.6 * sc, 0.06, 0.06, m.miki, x, y + 1.5 * sc, z, i);
      if (win) { var sn = new T.Mesh(K.G.ico(0), m.yuki); sn.scale.set(1.0 * sc, 0.25 * sc, 1.0 * sc); sn.position.set(x, y + (col ? 2.7 : 1.6) * sc, z); g.add(sn); }
    }
    /* 霞と金雲 */
    kasumi(g, env, -4, 5.2, -9, 44, 9); kasumi(g, env, 8, 3.2, -2, 36, 7); kasumi(g, env, -10, 2.4, 6, 30, 6); kasumi(g, env, 4, 7.5, -20, 50, 9);
    kinun(g, -26, 8, -30, 30, 10); kinun(g, 26, 9, -32, 30, 10, 0.1); kinun(g, 30, 3, 8, 20, 9, 1.2); kinun(g, -30, 4, 14, 22, 9, 0.2); kinun(g, -2, 3.5, 22, 34, 9);
    function f(x, z, ry) { return [x, z, ry || 0, H(x, z) + 0.02]; }
    var slots = {
      takami: f(10.6, 8.6, PI + 0.75), sakamichi: f(4.6, 3.6, 0.6), iwaya: f(-13.6, -11.6, 0.4),
      kami: f(-13.6, -11.6, 0.4), kamiL: f(-15.4, -11.2, 0.7), kamiR: f(-11.8, -11.4, 0.1), naka: f(10.6, 8.6, PI + 0.75), nakaL: f(9.0, 9.4, PI + 0.6), nakaR: f(12.0, 8.0, PI + 0.9),
      shimo: f(4.6, 3.6, 0.6), shimoL: f(2.4, 3.2, 0.9), shimoR: f(6.6, 4.6, 0.3), sunoko: f(0.5, 2.2, 0.4), niwa: f(-0.5, 3.4, 0.2), misu: f(1.6, -1.4, 0.8), to: f(-2.4, 2.6, 0.5)
    };
    var d = { g: g, slots: slots, cam: { t: [-1.5, 3.4, -2.5], az: 0.52, el: 0.6, rh: 21, rv: 13.5 }, figScale: 2.0, focusDist: 17, shadowR: 34, standing: 1, amb: { x: 0, z: 0, r: 24, y: 16 }, outdoor: 1 };
    return finish(d, env);
  }

  var BUILD = { kokyu: kokyu, kiritsubo: kiritsubo, seiryoden: seiryoden, kokiden: kokiden, watadono: watadono, sato: sato, kitayama: kitayama, soubou: soubou };
  S.STAGES = Object.keys(BUILD);
  S.build = function (stage, env, opt) {
    env.sway = []; env.lamps = []; env.drift = []; OCC = [];
    var d = (BUILD[stage] || BUILD.kiritsubo)(env, opt);
    d.stage = BUILD[stage] ? stage : 'kiritsubo'; d.occ = OCC;
    return d;
  };

  /* ---------- 渡殿を渡る遊びの道：後宮の平面図を歩ける大きさに広げる ---------- */
  S.walk = function (env, cfg) {
    env.sway = []; env.lamps = []; env.drift = [];
    var g = new T.Group(), m = M(), SC = 2.0, P = pathOf(PLAN.route, SC), wd = 2.8, i, s;
    K.pl(g, 260, 260, K.mat(groundCol(env)), 0, -FH, -10);
    /* 殿舎：壁面だけ（屋根は吹抜）。名前の札を道の近くに */
    var labels = [];
    PLAN.halls.forEach(function (h) {
      var w = h.w * SC - 1.6, dd = h.d * SC - 1.6, x = h.x * SC, z = h.z * SC, wall = K.mat('#ffffff', { map: K.tex.kabe('misu'), side: T.DoubleSide }), wall2 = K.mat('#ffffff', { map: K.tex.kabe('shitomi'), side: T.DoubleSide });
      K.bx(g, w + 1.2, FH + 0.02, dd + 1.2, m.slab, x, -FH / 2, z);
      K.vp(g, w, PH + 0.2, wall, x, 0, z + dd / 2, 0, Math.round(w / KEN), 1); K.vp(g, w, PH + 0.2, wall2, x, 0, z - dd / 2, 0, Math.round(w / KEN), 1);
      K.vp(g, dd, PH + 0.2, wall, x - w / 2, 0, z, PI / 2, Math.round(dd / KEN), 1); K.vp(g, dd, PH + 0.2, wall2, x + w / 2, 0, z, PI / 2, Math.round(dd / KEN), 1);
      K.bx(g, w + 0.3, 0.3, dd + 0.3, m.nageshi, x, PH + 0.3, z);
      if (h.tree) tree(g, env, h.tree === 'fuji' ? 'kiri' : h.tree, x - w / 2 - 3.2, -FH, z + dd / 2 - 2, 1.1, h.x);
      /* 道にいちばん近い点に札 */
      var best = null, bd = 1e9;
      for (s = 0; s <= P.len; s += 1.5) { var q = P.at(s), cx = K.clamp(q.x, x - w / 2, x + w / 2), cz = K.clamp(q.z, z - dd / 2, z + dd / 2), di = Math.pow(q.x - cx, 2) + Math.pow(q.z - cz, 2); if (di < bd) { bd = di; best = [cx, cz, s]; } }
      if (best && bd < 90) { var lb = K.label(h.name.replace(/（.*/, ''), { world: 1.7, depthTest: true, edge: h.col || '#5c3f2a' }); lb.position.set(best[0], PH + 0.5, best[1]); g.add(lb); labels.push({ s: best[2], name: h.name, id: h.id }); }
    });
    /* 廊：道に沿って 1 間ずつ */
    var n = Math.round(P.len / KEN), bl = P.len / n, sides = [];
    for (i = 0; i < n; i++) {
      var q = P.at((i + 0.5) * bl), a = P.at(i * bl + 0.01), b = P.at((i + 1) * bl - 0.01);
      if (Math.abs(a.dx - b.dx) + Math.abs(a.dz - b.dz) > 0.1) {            // 曲がり角は広い板敷に
        var cq = P.at(Math.round(((i + 0.5) * bl)));
        K.bx(g, wd + bl, 0.14, wd + bl, m.slab, q.x, -0.074, q.z); K.pl(g, wd + bl, wd + bl, m.ita, q.x, -0.001, q.z, 2, 2);
        continue;
      }
      var pat = ['open', 'misu', 'to', 'open', 'shitomi', 'misu', 'open'];
      corridorBay(g, env, q.x, q.z, q.dx, q.dz, bl + 0.02, wd, pat[i % 7], pat[(i * 3 + 2) % 7], i);
    }
    for (s = 4; s < P.len; s += 17) { var t = P.at(s); tree(g, env, (s / 17 | 0) % 2 ? 'matsu' : 'momiji', t.x - t.dz * 6.5, -FH, t.z + t.dx * 6.5, 1, s); }
    /* 行く手の清涼殿の入口：明るい御簾 */
    var e = P.at(P.len), gate = K.grp(g, e.x + e.dx * 1.2, 0, e.z + e.dz * 1.2, -Math.atan2(e.dz, e.dx) + PI / 2);
    K.cy(gate, 0.12, PH + 0.3, m.hashira, -1.5, 0, 0, 8); K.cy(gate, 0.12, PH + 0.3, m.hashira, 1.5, 0, 0, 8); K.bx(gate, 3.2, 0.18, 0.18, m.nageshi, 0, PH + 0.1, 0);
    misu(gate, env, 0, 0, 2.8, 0, 1.2, PH);
    var d = { g: g, path: P, labels: labels, SC: SC, wd: wd, slots: {}, figScale: 1, shadowR: 16, cam: { t: [0, 0, 0], az: 0, el: 0.5, rh: 8, rv: 6 }, amb: { x: 0, z: 0, r: 10, y: 6 }, follow: 1 };
    d.dynRoot = new T.Group(); d.dynRoot.userData.dyn = true; g.add(d.dynRoot);
    K.bake(g); d.sway = env.sway; d.lamps = env.lamps; d.drift = env.drift;
    return d;
  };
  S.KEN = KEN; S.FH = FH; S.PH = PH;
})(typeof window !== 'undefined' ? window : globalThis);
