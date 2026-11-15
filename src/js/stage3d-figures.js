/* 3D 舞台の人形 —— 引目鉤鼻の簡素な造形。精密な顔は作らない。
 * 女性は床に広がる長い黒髪と、裾を引く袿の重なり（襲の色目を袖口・裾・襟に見せる）。
 * 男性は直衣・束帯・狩衣に冠／烏帽子。尼は尼削ぎ、少女は扇を広げたような肩までの髪。
 * 1 体は「裾・胴・左右の袖・頭・髪」の 6 メッシュ前後（色は頂点色。材質は 1 体に 1 つ）。
 * 向き：人形の正面は +Z。原点は床。公開: GENJI.S3F */
(function (root) {
  'use strict';
  var G = root.GENJI, T = root.THREE, K = G && G.S3K;
  if (!T || !K || !K.ok) return;
  var F = G.S3F = {};
  var PI = Math.PI, SKIN = '#f4ebdc', HAIR = '#15121a', KURO = '#17141a';

  /* 装束の型ごとの作り分け */
  var KIND = {
    juni:     { fem: 1, sc: 1.0,  layers: 4, hair: 'long' },
    kouchiki: { fem: 1, sc: 1.0,  layers: 3, hair: 'long' },
    noshi:    { fem: 0, sc: 1.05, hat: 'kanmuri' },
    sokutai:  { fem: 0, sc: 1.05, hat: 'kanmuri', kyo: 1, shaku: 1 },
    kariginu: { fem: 0, sc: 1.05, hat: 'eboshi' },
    ama:      { fem: 1, sc: 0.97, layers: 3, hair: 'ama' },
    sou:      { fem: 0, sc: 1.0,  hair: 'none', kesa: 1 },
    shojo:    { fem: 1, sc: 0.74, layers: 3, hair: 'ougi' },
    warawa:   { fem: 1, sc: 0.68, layers: 2, hair: 'mid' },
    chigo:    { fem: 1, sc: 0.46, layers: 2, hair: 'short' }
  };
  /* 群像（1 つの id で 2〜3 人） */
  F.GROUPS = { kata: 3, kandachime: 3, warawabe: 2 };

  /* 姿勢：lean=上体の前傾, yaw=上体のひねり, hp/hy=頭の うつむき/振り, lf,ls / rf,rs = 左右の袖（前へ上げる角・外へ開く角） */
  var POSE = {
    sit:   { lean: 0.06, hp: 0.08, lf: 0.62, ls: 0.10, rf: 0.62, rs: 0.10 },
    stand: { st: 1, lean: 0.03, hp: 0.04, lf: 0.28, ls: 0.10, rf: 0.28, rs: 0.10 },
    bow:   { lean: 1.12, hp: 0.30, lf: 1.45, ls: 0.22, rf: 1.45, rs: 0.22 },
    fan:   { lean: 0.08, hp: 0.10, hy: -0.18, lf: 0.6, ls: 0.1, rf: 2.05, rs: -0.42, prop: 'fan' },
    weep:  { lean: 0.34, hp: 0.38, lf: 0.75, ls: 0.05, rf: 2.2, rs: -0.46, anim: 'weep' },
    lie:   { lie: 1, lean: -1.38, hp: 0.25, lf: 0.2, ls: 0.25, rf: 0.2, rs: 0.25, prop: 'fusuma' },
    peek:  { st: 1, lean: 0.40, hp: -0.22, lf: 0.45, ls: 0.1, rf: 1.35, rs: -0.2 },
    run:   { st: 1, lean: 0.30, hp: -0.12, lf: -0.5, ls: 0.38, rf: -0.5, rs: 0.38, anim: 'run' },
    write: { lean: 0.30, hp: 0.32, lf: 0.8, ls: 0.0, rf: 1.05, rs: -0.16, prop: 'desk' },
    pray:  { lean: 0.15, hp: 0.30, lf: 1.28, ls: -0.44, rf: 1.28, rs: -0.44, prop: 'juzu' },
    turn:  { lean: 0.06, yaw: 0.5, hp: 0.16, hy: 0.7, lf: 1.4, ls: -0.32, rf: 0.6, rs: 0.1 },
    hold:  { lean: 0.13, hp: 0.32, lf: 1.02, ls: -0.3, rf: 1.02, rs: -0.3, prop: 'chigo' }
  };
  var PKEYS = ['lean', 'yaw', 'hp', 'hy', 'lf', 'ls', 'rf', 'rs', 'wy'];
  F.POSES = Object.keys(POSE);

  function lookOf(id) {
    var c = G.chars && G.chars[id];
    return (c && c.look) || { kind: 'juni', colors: ['#8c8a86', '#c8c6c0', '#efeeea'] };
  }
  function shade(hex, k) { var c = new T.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }
  function hue(hex, dh, dl) { var c = new T.Color(hex); c.offsetHSL(dh, 0, dl || 0); return '#' + c.getHexString(); }

  /* 裾の広がり（θ=0 が正面、π が後ろ）。女性は後ろへ長く引く */
  function footFn(fem, stand, seed, trail) {
    return function (th) {
      var c = Math.cos(th - 0.22), b = (1 - c) / 2, s = Math.sin(th), w = 0.022 * Math.sin(th * 5 + seed);
      if (fem) return stand ? 0.2 + 0.05 * s * s + 0.72 * trail * b * b * b + w * 0.6 : 0.43 + 0.13 * s * s + 0.66 * trail * b * b * b + w;
      return stand ? 0.2 + 0.05 * s * s + 0.03 * b : 0.37 + 0.17 * s * s + 0.03 * b;
    };
  }
  function moundGeo(topR, H, p, foot) {
    return K.surf(22, 7, function (u, v, o) {
      var th = u * PI * 2, r = topR + (foot(th) - topR) * v;
      o[0] = r * Math.sin(th); o[1] = H * Math.pow(1 - v, p) + 0.012; o[2] = r * Math.cos(th);
    }, true);
  }
  function hemGeo(foot, k, y) {   // 下の衣が裾からのぞく輪
    return K.surf(22, 1, function (u, v, o) {
      var th = u * PI * 2, r = foot(th) * (v ? k : 0.8);
      o[0] = r * Math.sin(th); o[1] = y; o[2] = r * Math.cos(th);
    }, true);
  }

  function Fig(id, opts) {
    opts = opts || {};
    var look = lookOf(id), kd = KIND[look.kind] || KIND.juni, self = this;
    this.id = id; this.kd = kd; this.kind = look.kind;
    var cols = (look.colors || ['#888']).slice();
    if (opts.variant) cols = cols.map(function (c, i) { return hue(c, 0.035 * opts.variant * (i % 2 ? -1 : 1), i ? 0 : -0.03 * opts.variant); });
    this.cols = cols;
    this.boy = !kd.fem || id === 'ichinomiya' || id === 'wakamiya';
    this.fem = kd.fem && id !== 'ichinomiya';
    this.seed = (opts.seed || 0) + id.length * 1.7;
    this.scale = kd.sc * (opts.scale || 1);
    this.trail = look.kind === 'juni' || look.kind === 'kouchiki' ? 1 : look.kind === 'ama' ? 0.55 : 0.4;
    this.mat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    this.mat.emissive = new T.Color(0, 0, 0);
    this.root = new T.Group(); this.root.scale.setScalar(this.scale);
    this.pivot = new T.Group(); this.root.add(this.pivot);
    this.upper = new T.Group(); this.pivot.add(this.upper);
    this.headG = new T.Group(); this.headG.position.set(0, 0.33, 0.012); this.upper.add(this.headG);
    this.armL = new T.Group(); this.armL.position.set(0.185, 0.25, 0); this.upper.add(this.armL);
    this.armR = new T.Group(); this.armR.position.set(-0.185, 0.25, 0); this.upper.add(this.armR);
    this.wSit = this.fem ? 0.30 : 0.34; this.wStand = this.fem ? 0.92 : 0.98;
    this.props = {}; this.skirts = {}; this.hairKey = '';
    this.ph = (this.seed * 2.3) % 6.28;
    this.cur = {}; this.tgt = {}; this.spk = 0; this.spkT = 0;
    this._mesh(this.upper, this._torso());
    this._mesh(this.armL, this._sleeve());
    this._mesh(this.armR, this._sleeve());
    this._mesh(this.headG, this._head());
    this.setPose(opts.pose || 'sit', true);
  }
  Fig.prototype._mesh = function (parent, geo) {
    var m = new T.Mesh(geo, this.mat); m.castShadow = true; m.receiveShadow = false; parent.add(m); return m;
  };

  /* 胴と襟の重なり */
  Fig.prototype._torso = function () {
    var b = new K.Builder(), c = this.cols, kd = this.kd, i;
    var pts = [[0.165, 0], [0.2, 0.1], [0.212, 0.2], [0.17, 0.262], [0.085, 0.3], [0.058, 0.345]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var lathe = new T.LatheGeometry(pts, 14);
    b.add(lathe, c[0], K.M(0, 0, 0, 0, 0, 0, this.fem ? 0.92 : 1.04, 1, 0.7)); lathe.dispose();
    var n = this.fem ? Math.min(c.length, kd.layers || 3) : 2, cone = K.G.cone(12);
    for (i = 1; i < n + 0; i++) {            // 襟もとに下の衣の色をのぞかせる
      var cc = this.fem ? c[i] : (c[2] || c[1]);
      b.add(cone, cc, K.M(0, 0.318 - i * 0.012, 0.004 + i * 0.006, PI, 0, 0, 0.074 + i * 0.02, 0.07, 0.066 + i * 0.016));
    }
    if (kd.kesa) {                            // 袈裟：胴を斜めに巻く帯
      var ring = new T.CylinderGeometry(0.218, 0.2, 0.1, 14, 1, true);
      b.add(ring, c[1], K.M(0, 0.15, 0, 0, 0, 0.62, 1.04, 1, 0.74)); ring.dispose();
    }
    return b.build();
  };
  /* 袖：下に開いた鐘の形を入れ子にして、袖口に襲の色目を見せる */
  Fig.prototype._sleeve = function () {
    var b = new K.Builder(), c = this.cols, kd = this.kd, i, fem = this.fem;
    var n = fem ? Math.min(c.length, kd.layers || 3) : 2, L = fem ? 0.5 : 0.52, rb = fem ? 0.165 : 0.2;
    for (i = 0; i < n; i++) {
      var g = new T.CylinderGeometry(0.062, rb * (1 - 0.1 * i), L, 10, 1, true);
      g.translate(0, -L / 2 - 0.03 * i, 0);
      b.add(g, fem ? c[i] : (i ? (c[2] || c[1]) : c[0]), K.M(0, 0, 0, 0, 0, 0, 0.52, 1, 1)); g.dispose();
    }
    b.add(K.G.sph(8, 6), SKIN, K.M(0, -L - 0.03 * n + 0.02, 0.02, 0, 0, 0, 0.03, 0.04, 0.035));
    return b.build();
  };
  /* 頭：引目鉤鼻。髪・冠・烏帽子もここにまとめる */
  Fig.prototype._head = function () {
    var b = new K.Builder(), kd = this.kd, sph = K.G.sph(14, 10), box = K.G.box(), hy = 0.115, rx = 0.091, ry = 0.108, rz = 0.095, self = this;
    b.add(sph, SKIN, K.M(0, hy, 0, 0, 0, 0, rx, ry, rz));
    function zAt(x, y) { return rz * Math.sqrt(Math.max(0.02, 1 - x * x / (rx * rx) - y * y / (ry * ry))); }
    function mark(x, y, w, h, col, rz2) {
      [-1, 1].forEach(function (s) {
        if (x === 0 && s < 0) return;
        b.add(box, col, K.M(s * x, hy + y, zAt(x, y) - 0.002, 0, s * (x ? 0.42 : 0), s * (rz2 || 0), w, h, 0.008));
      });
    }
    var child = kd.sc < 0.8;
    mark(0.036, child ? -0.004 : 0.004, 0.03, 0.0045, '#221a1c', -0.07);        // 引目
    if (!child) mark(0.037, 0.05, 0.027, 0.009, '#9d9590', 0.05);                // 殿上眉（額の高いところにぼんやりと）
    b.add(box, '#cdbba6', K.M(0.005, hy - 0.016, zAt(0, -0.016) + 0.001, 0, 0, 0.28, 0.0045, 0.02, 0.008));   // 鉤鼻
    b.add(box, '#b7333b', K.M(0, hy - 0.05, zAt(0, -0.05) - 0.001, 0, 0, 0, 0.013, 0.007, 0.008));            // 口
    var hair = kd.hair || (kd.fem ? 'long' : 'male');
    if (hair !== 'none') {
      if (this.fem || hair === 'short') {
        b.add(sph, HAIR, K.M(0, hy + 0.014, -0.02, 0, 0, 0, 0.1, 0.113, 0.103));
        if (hair !== 'short') [-1, 1].forEach(function (s) {             // 下がり端（頬にかかる髪）
          var len = hair === 'long' ? 0.36 : 0.2;
          var g = K.ribbon([[s * 0.072, hy + 0.075, 0.035], [s * 0.094, hy - 0.03, 0.04], [s * 0.118, hy - 0.03 - len * 0.6, 0.075], [s * 0.125, hy - 0.03 - len, 0.09]], [0.05, 0.05, 0.04, 0.02], 0.01, [0, 0, 1], 8);
          b.add(g, HAIR); g.dispose();
        });
      } else {
        b.add(sph, HAIR, K.M(0, hy + 0.02, -0.03, 0, 0, 0, 0.096, 0.1, 0.098));
      }
    }
    if (this.id === 'ichinomiya') [-1, 1].forEach(function (s) {          // 角髪（みづら）
      b.add(sph, HAIR, K.M(s * 0.1, hy - 0.03, 0, 0, 0, 0, 0.032, 0.05, 0.035));
    });
    var top = hy + ry - 0.012;
    if (kd.hat === 'kanmuri') {
      b.add(K.G.cyl(10), KURO, K.M(0, top + 0.012, -0.005, 0, 0, 0, 0.072, 0.04, 0.078));
      b.add(K.G.cyl(8), KURO, K.M(0, top + 0.07, -0.04, 0.1, 0, 0, 0.026, 0.1, 0.022));
      var ei = K.ribbon([[0, top + 0.11, -0.05], [0, top + 0.1, -0.12], [0, top - 0.05, -0.17], [0, top - 0.2, -0.16]], [0.045, 0.05, 0.055, 0.05], 0.004, [0, 0, -1], 8);
      b.add(ei, KURO); ei.dispose();
    } else if (kd.hat === 'eboshi') {
      var eb = new T.CylinderGeometry(0.045, 0.078, 0.2, 10);
      b.add(eb, KURO, K.M(0, top + 0.085, -0.012, -0.12, 0, 0, 1, 1, 0.6)); eb.dispose();
    }
    return b.build();
  };

  /* 裾（座る／立つ）。必要になったときに作る */
  Fig.prototype._skirt = function (stand) {
    var key = stand ? 'st' : 'si'; if (this.skirts[key]) return this.skirts[key];
    var b = new K.Builder(), c = this.cols, kd = this.kd, fem = this.fem, i;
    var foot = footFn(fem, stand, this.seed, this.trail), H = (stand ? this.wStand : this.wSit) + 0.03, topR = stand ? 0.14 : 0.17, p = stand ? 2.3 : (fem ? 1.7 : 1.35);
    var info = { foot: foot, H: H, topR: topR, p: p };
    var g = moundGeo(topR, H, p, foot), hak = K.col(c[1] || c[0]), top = K.col(c[0]);
    if (fem) b.add(g, c[0]);
    else b.add(g, function (v, out) {            // 男：膝から下に袴（指貫）の色
      var r = Math.sqrt(v.x * v.x + v.z * v.z), t = v.y / H;
      return (kd.kesa ? false : (stand ? t < 0.42 : (t < 0.5 && v.z > -0.12))) ? out.copy(hak) : out.copy(top);
    });
    g.dispose();
    var n = fem ? Math.min(c.length, kd.layers || 3) : 1;
    for (i = 1; i < n; i++) { g = hemGeo(foot, 1 + 0.085 * i, 0.012 - i * 0.003); b.add(g, c[i]); g.dispose(); }
    if (kd.kyo) {                                  // 束帯：下襲の裾（きょ）を後ろへ長く引く
      g = K.ribbon([[0, 0.3, -0.2], [0, 0.03, -0.55], [0.05, 0.02, -1.1], [0.12, 0.02, -1.6]], [0.3, 0.34, 0.32, 0.26], 0.01, [0, 1, 0], 10);
      b.add(g, c[1]); g.dispose();
    }
    var m = this._mesh(this.pivot, b.build()); m.userData.info = info;
    return (this.skirts[key] = m);
  };

  /* 髪：姿勢（前傾・立ち座り）に合わせて、背から裾の上へ流す */
  Fig.prototype._hair = function (P) {
    var kd = this.kd, hair = kd.hair || (kd.fem ? 'long' : 'male');
    if (!this.fem || hair === 'none' || hair === 'short' || hair === 'male') return;
    var key = hair + (P.st ? 's' : 'i') + (P.lie ? 'l' : '') + Math.round(P.lean * 10);
    if (key === this.hairKey) return;
    this.hairKey = key;
    if (this.hair) { this.hair.geometry.dispose(); this.hair.parent.remove(this.hair); this.hair = null; }
    var g;
    if (hair !== 'long') {
      /* 尼削ぎ・少女の「扇を広げたるやうに」・童：肩〜背まで。頭について動く */
      var len = hair === 'ama' ? 0.2 : hair === 'ougi' ? 0.3 : 0.42, wid = hair === 'ougi' ? [0.15, 0.3, 0.43, 0.47] : hair === 'ama' ? [0.16, 0.25, 0.28, 0.27] : [0.15, 0.2, 0.2, 0.1];
      g = K.ribbon([[0, 0.2, -0.085], [0, 0.07, -0.125], [0, 0.07 - len * 0.6, -0.17], [0, 0.07 - len, -0.2]], wid, 0.03, [0, 0.2, -1], 9);
      this.hair = this._mesh(this.headG, g); this.hairOnHead = true;
      return;
    }
    var a = P.lean, wy = P.st ? this.wStand : this.wSit, ca = Math.cos(a), sa = Math.sin(a), pts = [];
    function U(y, z) { return [0, wy + y * ca - z * sa, y * sa + z * ca]; }
    if (P.lie) {
      var h = U(0.46, -0.05);
      pts = [[0, h[1] + 0.06, h[2]], [0.1, 0.05, h[2] - 0.22], [0.3, 0.03, h[2] - 0.5], [0.52, 0.03, h[2] - 0.72], [0.8, 0.03, h[2] - 0.8]];
      g = K.ribbon(pts, [0.16, 0.26, 0.3, 0.26, 0.08], 0.02, [0, 1, 0], 14);
    } else {
      var sk = this._skirt(!!P.st).userData.info, R = sk.foot(PI), end = P.st ? 0.62 : 0.97;
      pts.push(U(0.53, -0.05), U(0.41, -0.118), U(0.22, -0.17), U(0.03, -0.2));
      [0.34, 0.52, 0.7, 0.86, 1].forEach(function (f) {
        var r = sk.topR + 0.06 + (R * end - sk.topR - 0.06) * f, t = K.clamp((r - sk.topR) / (R - sk.topR), 0, 1);
        pts.push([0.05 * f * f, sk.H * Math.pow(1 - t, sk.p) + 0.034, -r]);
      });
      /* 上体から裾へ移るところで、裾より下にもぐらないようにする */
      pts.forEach(function (q) { var r = -q[2]; if (r > sk.topR) { var t = K.clamp((r - sk.topR) / (R - sk.topR), 0, 1), y = sk.H * Math.pow(1 - t, sk.p) + 0.03; if (q[1] < y) q[1] = y; } });
      g = K.ribbon(pts, [0.15, 0.2, 0.25, 0.27, 0.29, 0.31, 0.31, 0.26, 0.09], 0.028, [0, 1, -1], 26);
    }
    this.hair = this._mesh(this.pivot, g); this.hairOnHead = false;
  };

  /* 小道具（扇・文机・数珠・衾・抱いた幼子・笏） */
  Fig.prototype._prop = function (name) {
    if (this.props[name]) return this.props[name];
    var b = new K.Builder(), parent = this.pivot, g, c = this.cols, L = (this.fem ? 0.5 : 0.52) + 0.06;
    if (name === 'fan') {
      parent = this.armR;
      g = new T.CircleGeometry(0.22, 10, -PI / 2 - 0.62, 1.24); b.add(g, this.fem ? '#d9c08a' : '#efe6d0', K.M(0, -L + 0.03, 0.03)); g.dispose();
      g = new T.RingGeometry(0.13, 0.19, 10, 1, -PI / 2 - 0.62, 1.24); b.add(g, this.fem ? '#b5432e' : '#7f9bbd', K.M(0, -L + 0.03, 0.034)); g.dispose();
    } else if (name === 'shaku') {
      parent = this.armR; b.add(K.G.box(), '#e6d9b8', K.M(0, -L - 0.1, 0.03, 0.2, 0, 0, 0.045, 0.3, 0.01));
    } else if (name === 'juzu') {
      parent = this.armR; g = new T.TorusGeometry(0.055, 0.008, 5, 14); b.add(g, '#4a2f22', K.M(0.1, -L - 0.03, 0.02, 0.6, 0, 0)); g.dispose();
    } else if (name === 'desk') {
      b.add(K.G.box(), '#2a1d18', K.M(0, 0.22, 0.6, 0, 0, 0, 0.62, 0.03, 0.32));
      [-1, 1].forEach(function (s) { b.add(K.G.box(), '#2a1d18', K.M(s * 0.27, 0.11, 0.6, 0, 0, 0, 0.03, 0.22, 0.28)); });
      b.add(K.G.box(), '#f4eede', K.M(0.02, 0.24, 0.6, 0, 0.1, 0, 0.34, 0.006, 0.22));
      b.add(K.G.box(), '#1c1714', K.M(-0.25, 0.25, 0.56, 0, 0, 0, 0.07, 0.02, 0.1));
    } else if (name === 'fusuma') {
      /* 臥す：衾（上に掛ける衣）と枕。襲の色を縁に */
      var self = this;
      c.slice(0, 3).forEach(function (col, i) {
        b.add(K.G.sph(14, 8), col, K.M(0, 0.02 - i * 0.004, 0.42, 0, 0, 0, 0.44 + i * 0.05, 0.2 - i * 0.03, 0.86 + i * 0.05));
      });
      b.add(K.G.box(), '#3a2a44', K.M(0, 0.05, -0.62, 0, 0, 0, 0.3, 0.1, 0.14));
    } else if (name === 'chigo') {
      parent = this.upper;
      var cc = (G.chars.wakamiya && G.chars.wakamiya.look.colors) || ['#f6f0f8', '#e9c46a'];
      b.add(K.G.sph(10, 8), cc[0], K.M(0.02, 0.1, 0.22, 0, 0, 0.5, 0.2, 0.095, 0.1));
      b.add(K.G.sph(10, 8), cc[1], K.M(0.0, 0.085, 0.21, 0, 0, 0.5, 0.21, 0.07, 0.1));
      b.add(K.G.sph(8, 6), SKIN, K.M(0.17, 0.2, 0.22, 0, 0, 0, 0.052));
      b.add(K.G.sph(8, 6), HAIR, K.M(0.178, 0.212, 0.212, 0, 0, 0, 0.05));
    }
    return (this.props[name] = this._mesh(parent, b.build()));
  };

  Fig.prototype.setPose = function (name, instant) {
    var P = POSE[name] || POSE.sit, k, self = this;
    this.pose = POSE[name] ? name : 'sit'; this.P = P;
    var wy = P.lie ? 0.15 : (P.st ? this.wStand : this.wSit);
    PKEYS.forEach(function (key) { self.tgt[key] = key === 'wy' ? wy : (P[key] || 0); if (instant || self.cur[key] == null) self.cur[key] = self.tgt[key]; });
    var st = this._skirt(!!P.st);
    for (k in this.skirts) this.skirts[k].visible = !P.lie && this.skirts[k] === st;
    this._hair(P);
    for (k in this.props) this.props[k].visible = false;
    if (P.prop) this._prop(P.prop).visible = true;
    if (this.kd.shaku && (name === 'stand' || name === 'sit')) this._prop('shaku').visible = true;
    this.armL.visible = this.armR.visible = true;
    this.height = (wy + 0.33 + 0.24) * this.scale;
  };
  Fig.prototype.speak = function (on) { this.spkT = on ? 1 : 0; };
  Fig.prototype.update = function (dt, t) {
    var c = this.cur, g = this.tgt, k = 1 - Math.exp(-dt * 6), i, key, P = this.P, ph = this.ph;
    for (i = 0; i < PKEYS.length; i++) { key = PKEYS[i]; c[key] += (g[key] - c[key]) * k; }
    this.spk += (this.spkT - this.spk) * (1 - Math.exp(-dt * 5));
    var br = Math.sin(t * 1.5 + ph), sw = Math.sin(t * 1.05 + ph * 1.7) * 0.022, bob = 0, lean = c.lean, rz = 0, hp = c.hp - this.spk * 0.1;
    if (P.anim === 'run') { bob = Math.abs(Math.sin(t * 9 + ph)) * 0.06; lean += Math.sin(t * 9 + ph) * 0.04; sw = Math.sin(t * 9 + ph) * 0.3; }
    if (P.anim === 'weep') { rz = Math.sin(t * 13) * 0.01 * (0.5 + 0.5 * Math.sin(t * 0.9)); hp += Math.sin(t * 1.3) * 0.03; }
    this.pivot.position.y = bob;
    this.upper.position.y = c.wy; this.upper.rotation.set(lean, c.yaw, rz); this.upper.scale.y = 1 + br * 0.012;
    this.headG.rotation.set(hp + br * 0.008, c.hy + Math.sin(t * 0.4 + ph) * 0.03 * (1 - this.spk) + this.spk * Math.sin(t * 2.2) * 0.05, 0);
    this.armL.rotation.set(-c.lf - sw, 0, c.ls + br * 0.012);
    this.armR.rotation.set(-c.rf + sw, 0, -c.rs - br * 0.012);
    if (this.hair && this.hairOnHead) this.hair.rotation.x = -c.lean * 0.5 + (P.anim === 'run' ? -0.35 + Math.sin(t * 9 + ph) * 0.12 : Math.sin(t * 1.1 + ph) * 0.012);
    var e = this.spk * 0.085; this.mat.emissive.setRGB(e, e * 0.9, e * 0.62);
  };
  var _hv = null;
  Fig.prototype.headWorld = function (v) { v.set(0, 0.115, 0); return this.headG.localToWorld(v); };
  Fig.prototype.dispose = function () {
    this.root.traverse(function (o) { if (o.geometry && !o.geometry._gjShared) o.geometry.dispose(); });
    this.mat.dispose(); if (this.root.parent) this.root.parent.remove(this.root);
  };

  F.make = function (id, opts) { return new Fig(id, opts); };
  F.lookOf = lookOf;
  /* 立ち姿が自然な人物かどうか（既定の姿勢を決める手がかり） */
  F.kindOf = function (id) { return lookOf(id).kind; };
})(typeof window !== 'undefined' ? window : globalThis);
