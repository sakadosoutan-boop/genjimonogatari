/* 3D 舞台の道具箱 —— 和の色・材質・形・手続きテクスチャ（Canvas）。
 * 外部の画像・モデルは使わない。THREE r128（グローバル）前提。公開: GENJI.S3K
 *   - 材質と基本形は使い回す（_gjShared の印を付け、舞台を替えても捨てない）。
 *   - 動かない部品は bake() で材質ごとに 1 つのメッシュへ焼き固め、描画回数を減らす。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  var T = root.THREE;
  var K = G.S3K = { ok: !!T };
  if (!T) return;
  var PI = Math.PI;

  /* ---------- 数の道具 ---------- */
  K.rng = function (seed) {
    var a = (seed | 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  K.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  K.lerp = function (a, b, t) { return a + (b - a) * t; };
  K.ease = function (u) { u = K.clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  /* ---------- 和の色（絵巻の岩絵具を意識した、やや沈んだ色） ---------- */
  K.WA = {
    hinoki: '#b89466', ita: '#a67c52', hashira: '#6b4a30', nageshi: '#5c3f2a', kuro: '#1c1714', shu: '#b5432e',
    kin: '#c9a44a', kinpaku: '#d8b964', gofun: '#f3eadb', kami: '#16121a', suna: '#e6decb', tsuchi: '#bca681',
    koke: '#8a9460', kusa: '#7d9a5a', matsu: '#3f5a3c', take: '#6f9160', sakura: '#f3c9d2', usuzakura: '#f8e1e4',
    kiri: '#a58bc4', fuji: '#9a7fc0', momiji: '#c2452d', kouyou: '#d98a3a', ichou: '#d9ae45', kare: '#b59a62',
    yuki: '#f4f6f8', mizu: '#7fa3ad', gunjo: '#4a6a8a', rokusho: '#5f8f78', iwa: '#8b8478', miki: '#5d4a3c',
    tatami: '#b5ad72', kabe: '#e3d8be', kami2: '#efe6d0', nibi: '#8c8a86'
  };
  K.col = function (h) { var c = new T.Color(h); c.convertSRGBToLinear(); return c; };

  /* ---------- 材質（使い回し） ---------- */
  var MAT = {};
  K.mat = function (hex, o) {
    o = o || {};
    if (hex == null) hex = '#ffffff';
    var key = [hex, o.map ? o.map.uuid : '', o.side || 0, o.opacity == null ? 1 : o.opacity, o.basic ? 'b' : 'l', o.emissive || '',
      o.alphaTest || 0, o.depthWrite === false ? 'n' : '', o.depthTest === false ? 't' : '', o.fog === false ? 'f' : '', o.add ? 'a' : '', o.vc ? 'v' : ''].join('|');
    if (MAT[key]) return MAT[key];
    var p = { color: K.col(hex) };
    if (o.map) p.map = o.map;
    if (o.side) p.side = o.side;
    if (o.opacity != null && o.opacity < 1 || o.transparent) { p.transparent = true; p.opacity = o.opacity == null ? 1 : o.opacity; }
    if (o.alphaTest) p.alphaTest = o.alphaTest;
    if (o.depthWrite === false) p.depthWrite = false;
    if (o.depthTest === false) p.depthTest = false;
    if (o.add) p.blending = T.AdditiveBlending;
    if (o.vc) p.vertexColors = true;
    var m;
    if (o.basic) m = new T.MeshBasicMaterial(p);
    else { if (o.emissive) p.emissive = K.col(o.emissive); m = new T.MeshLambertMaterial(p); }
    if (o.fog === false) m.fog = false;
    m._gjShared = true;
    return (MAT[key] = m);
  };

  /* ---------- 基本形（単位の大きさ。scale で伸ばして使い回す） ---------- */
  var GEO = {};
  function geo(key, make) { var g = GEO[key]; if (!g) { g = GEO[key] = make(); g._gjShared = true; } return g; }
  K.G = {
    box: function () { return geo('box', function () { return new T.BoxGeometry(1, 1, 1); }); },
    cyl: function (seg) { seg = seg || 8; return geo('cyl' + seg, function () { return new T.CylinderGeometry(1, 1, 1, seg); }); },
    cone: function (seg) { seg = seg || 8; return geo('cone' + seg, function () { return new T.ConeGeometry(1, 1, seg); }); },
    sph: function (w, h) { w = w || 12; h = h || 9; return geo('sph' + w + '_' + h, function () { return new T.SphereGeometry(1, w, h); }); },
    ico: function (d) { d = d || 0; return geo('ico' + d, function () { return new T.IcosahedronGeometry(1, d); }); },
    plane: function () { return geo('plane', function () { var g = new T.PlaneGeometry(1, 1); g.rotateX(-PI / 2); return g; }); },
    vplane: function () { return geo('vplane', function () { return new T.PlaneGeometry(1, 1); }); },
    disc: function () { return geo('disc', function () { var g = new T.CircleGeometry(1, 20); g.rotateX(-PI / 2); return g; }); }
  };

  function put(parent, m, x, y, z, shadow) {
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = shadow !== false; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  /* 箱（中心が x,y,z） */
  K.bx = function (parent, w, h, d, mat, x, y, z, ry, shadow) {
    var m = new T.Mesh(K.G.box(), mat); m.scale.set(w, h, d); if (ry) m.rotation.y = ry;
    return put(parent, m, x, y, z, shadow);
  };
  /* 円柱（底が y） */
  K.cy = function (parent, r, h, mat, x, y, z, seg, shadow) {
    var m = new T.Mesh(K.G.cyl(seg), mat); m.scale.set(r, h, r);
    return put(parent, m, x, (y || 0) + h / 2, z, shadow);
  };
  function repUV(base, ru, rv) {
    var g = base.clone(), uv = g.attributes.uv, i;
    for (i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    return g;
  }
  /* 水平の面（床・畳・砂）。ru, rv は模様のくり返し */
  K.pl = function (parent, w, d, mat, x, y, z, ru, rv) {
    var m = new T.Mesh(ru ? repUV(K.G.plane(), ru, rv || ru) : K.G.plane(), mat); m.scale.set(w, 1, d);
    return put(parent, m, x, y, z, false);
  };
  /* 垂直の面（御簾・帷・障子）。底が y */
  K.vp = function (parent, w, h, mat, x, y, z, ry, ru, rv) {
    var m = new T.Mesh(ru ? repUV(K.G.vplane(), ru, rv || ru) : K.G.vplane(), mat); m.scale.set(w, h, 1); if (ry) m.rotation.y = ry;
    return put(parent, m, x, (y || 0) + h / 2, z, false);
  };
  K.grp = function (parent, x, y, z, ry) { var g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); if (ry) g.rotation.y = ry; if (parent) parent.add(g); return g; };

  /* ---------- 行列 ---------- */
  var _e = new T.Euler(), _q = new T.Quaternion(), _p = new T.Vector3(), _s = new T.Vector3();
  K.M = function (px, py, pz, rx, ry, rz, sx, sy, sz) {
    if (sx == null) sx = 1; if (sy == null) sy = sx; if (sz == null) sz = sx;
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    return new T.Matrix4().compose(_p.set(px || 0, py || 0, pz || 0), _q, _s.set(sx, sy, sz));
  };

  /* ---------- 曲面（u×v の格子を関数で置く）。closeU は u 方向を輪に閉じる ---------- */
  K.surf = function (nu, nv, fn, closeU, flip) {
    var cols = closeU ? nu : nu + 1, rows = nv + 1, pos = new Float32Array(cols * rows * 3), o = [0, 0, 0], i, j, k = 0;
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) { fn(i / nu, j / nv, o); pos[k++] = o[0]; pos[k++] = o[1]; pos[k++] = o[2]; }
    var idx = [];
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * cols + i, b = j * cols + (i + 1) % cols, c = (j + 1) * cols + i, d = (j + 1) * cols + (i + 1) % cols;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };

  /* 帯（髪・纓など）。pts を通る曲線に沿い、幅 widths、中ほどを bulge だけふくらませる */
  K.ribbon = function (pts, widths, bulge, out, nv) {
    var curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }), false, 'centripetal');
    nv = nv || Math.max(6, pts.length * 3);
    var up = new T.Vector3(0, 1, 0), prev = new T.Vector3(1, 0, 0), ov = new T.Vector3(out ? out[0] : 0, out ? out[1] : 1, out ? out[2] : -1);
    var P = [], S = [], N = [], W = [], j;
    for (j = 0; j <= nv; j++) {
      var t = j / nv, p = curve.getPoint(t), tg = curve.getTangent(t);
      var s = new T.Vector3().crossVectors(up, tg);
      if (s.length() < 0.3) s.copy(prev); else s.normalize();
      if (s.dot(prev) < 0) s.negate();
      prev.copy(s);
      var n = new T.Vector3().crossVectors(tg, s).normalize(); if (n.dot(ov) < 0) n.negate();
      var f = t * (widths.length - 1), i0 = Math.min(widths.length - 2, Math.floor(f));
      P.push(p); S.push(s); N.push(n); W.push(K.lerp(widths[i0], widths[i0 + 1], f - i0));
    }
    return K.surf(4, nv, function (u, v, o) {
      var k = Math.round(v * nv), p = P[k], s = S[k], n = N[k], w = W[k], a = (u - 0.5), b = (bulge || 0) * (1 - 4 * a * a);
      o[0] = p.x + s.x * a * w + n.x * b; o[1] = p.y + s.y * a * w + n.y * b; o[2] = p.z + s.z * a * w + n.z * b;
    });
  };

  /* 屋根（寄棟に近い簡略形。檜皮葺の入母屋を俯瞰で表す）。w が棟の方向 */
  K.roof = function (w, d, h) {
    var long = w >= d, a = (long ? w : d) / 2, b = (long ? d : w) / 2, r = Math.max(0.2, a - b * 0.8);
    function P(x, y, z) { return long ? [x, y, z] : [z, y, x]; }
    var e = [P(-a, 0, -b), P(a, 0, -b), P(a, 0, b), P(-a, 0, b)], r0 = P(-r, h, 0), r1 = P(r, h, 0);
    var tri = long
      ? [e[3], e[2], r1, e[3], r1, r0, e[1], e[0], r0, e[1], r0, r1, e[2], e[1], r1, e[0], e[3], r0]
      : [e[2], e[3], r1, r1, e[3], r0, e[0], e[1], r0, r0, e[1], r1, e[1], e[2], r1, e[3], e[0], r0];
    var pos = [], uv = [];
    tri.forEach(function (p) { pos.push(p[0], p[1], p[2]); uv.push((p[0] + p[2]) * 0.5, p[1] * 1.6); });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };

  /* ---------- 色つき頂点で 1 つの形にまとめる（人形用） ---------- */
  var _v = new T.Vector3(), _n = new T.Vector3(), _nm = new T.Matrix3(), _c = new T.Color();
  K.Builder = function () { this.pos = []; this.nor = []; this.col = []; };
  K.Builder.prototype.add = function (g, color, m4) {
    var P = g.attributes.position, N = g.attributes.normal, I = g.index, n = I ? I.count : P.count, i, k;
    var fn = typeof color === 'function' ? color : null, c = fn ? null : K.col(color);
    var flip = m4 && m4.determinant() < 0;
    if (m4) _nm.getNormalMatrix(m4);
    for (i = 0; i < n; i++) {
      k = flip ? i - (i % 3) + (2 - i % 3) : i;
      k = I ? I.getX(k) : k;
      _v.fromBufferAttribute(P, k);
      if (fn) c = fn(_v, _c);
      if (m4) _v.applyMatrix4(m4);
      this.pos.push(_v.x, _v.y, _v.z);
      if (N) { _n.fromBufferAttribute(N, k); if (m4) _n.applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(c.r, c.g, c.b);
    }
    return this;
  };
  K.Builder.prototype.build = function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    return g;
  };

  /* ---------- 焼き固め：動かない Mesh を材質ごとに 1 つへ ---------- */
  K.bake = function (group) {
    group.updateMatrixWorld(true);
    var inv = new T.Matrix4().copy(group.matrixWorld).invert(), buckets = {}, order = [], list = [];
    group.traverse(function (o) {
      if (!o.isMesh || o.isInstancedMesh || o.userData.dyn || Array.isArray(o.material)) return;
      for (var p = o.parent; p && p !== group; p = p.parent) if (p.userData.dyn) return;
      list.push(o);
    });
    list.forEach(function (o) {
      var key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '') + (o.renderOrder || 0);
      if (!buckets[key]) { buckets[key] = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, list: [], n: 0 }; order.push(key); }
      var g = o.geometry; buckets[key].n += g.index ? g.index.count : g.attributes.position.count; buckets[key].list.push(o);
    });
    var m4 = new T.Matrix4();
    order.forEach(function (key) {
      var b = buckets[key], pos = new Float32Array(b.n * 3), nor = new Float32Array(b.n * 3), useUV = !!b.mat.map, uv = useUV ? new Float32Array(b.n * 2) : null, k = 0;
      b.list.forEach(function (o) {
        var g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index, n = I ? I.count : P.count, i, a;
        m4.multiplyMatrices(inv, o.matrixWorld); _nm.getNormalMatrix(m4);
        var flip = m4.determinant() < 0;
        for (i = 0; i < n; i++) {
          a = flip ? i - (i % 3) + (2 - i % 3) : i; a = I ? I.getX(a) : a;
          _v.fromBufferAttribute(P, a).applyMatrix4(m4); pos[k * 3] = _v.x; pos[k * 3 + 1] = _v.y; pos[k * 3 + 2] = _v.z;
          if (N) _n.fromBufferAttribute(N, a).applyMatrix3(_nm).normalize(); else _n.set(0, 1, 0);
          nor[k * 3] = _n.x; nor[k * 3 + 1] = _n.y; nor[k * 3 + 2] = _n.z;
          if (useUV) { uv[k * 2] = U ? U.getX(a) : 0; uv[k * 2 + 1] = U ? U.getY(a) : 0; }
          k++;
        }
        if (o.parent) o.parent.remove(o);
        if (!g._gjShared) g.dispose();
      });
      var ng = new T.BufferGeometry();
      ng.setAttribute('position', new T.BufferAttribute(pos, 3));
      ng.setAttribute('normal', new T.BufferAttribute(nor, 3));
      if (useUV) ng.setAttribute('uv', new T.BufferAttribute(uv, 2));
      var m = new T.Mesh(ng, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.ro || 0;
      group.add(m);
    });
    return group;
  };

  /* 後始末：使い回しの印がないものだけ捨てる */
  K.dispose = function (obj) {
    if (!obj) return;
    obj.traverse(function (o) {
      if (o.geometry && !o.geometry._gjShared) o.geometry.dispose();
      var m = o.material;
      if (m && !m._gjShared) { if (m.map && !m.map._gjShared) m.map.dispose(); m.dispose(); }
    });
    if (obj.parent) obj.parent.remove(obj);
  };
  K.disposeAll = function () {
    var k;
    for (k in MAT) MAT[k].dispose(); MAT = {};
    for (k in GEO) GEO[k].dispose(); GEO = {};
    for (k in TEX) TEX[k].dispose(); TEX = {};
  };

  /* ---------- 手続きテクスチャ ---------- */
  var TEX = {};
  K.canvas = function (w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  function tex(name, w, h, draw, rep) {
    if (TEX[name]) return TEX[name];
    var t = new T.CanvasTexture(K.canvas(w, h, draw));
    t.encoding = T.sRGBEncoding;
    if (rep !== false) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = 4; t._gjShared = true;
    return (TEX[name] = t);
  }
  K.tex = {
    /* 板敷：幅広の板と木目 */
    ita: function () {
      return tex('ita', 256, 256, function (g, w, h) {
        var r = K.rng(11), i;
        g.fillStyle = '#b08658'; g.fillRect(0, 0, w, h);
        for (i = 0; i < 4; i++) { g.fillStyle = ['#b38a5c', '#a97f52', '#b6905f', '#a57a4e'][i]; g.fillRect(0, i * 64, w, 64); }
        g.globalAlpha = 0.16;
        for (i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? '#6e4a2c' : '#d9b888'; g.fillRect(r() * w, r() * h, 30 + r() * 120, 1); }
        g.globalAlpha = 0.55; g.fillStyle = '#5a3c26';
        for (i = 0; i < 4; i++) g.fillRect(0, i * 64, w, 2);
        g.globalAlpha = 1;
      });
    },
    /* 畳：藺草の目 */
    tatami: function () {
      return tex('tatami', 64, 64, function (g, w, h) {
        g.fillStyle = '#b9b276'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < h; i += 2) { g.fillStyle = i % 4 ? 'rgba(120,118,60,.35)' : 'rgba(222,216,160,.3)'; g.fillRect(0, i, w, 1); }
      });
    },
    /* 繧繝縁（帝・院の畳の縁）と高麗縁 */
    ungen: function () {
      return tex('ungen', 64, 16, function (g, w, h) {
        var c = ['#b5432e', '#e59a7a', '#f3eadb', '#7fa97a', '#3f7a5e', '#f3eadb', '#7f9bd0', '#3b5a9a'], i;
        for (i = 0; i < 8; i++) { g.fillStyle = c[i]; g.fillRect(i * 8, 0, 8, h); }
        g.fillStyle = 'rgba(40,30,20,.5)'; for (i = 0; i < 8; i += 2) g.fillRect(i * 8 + 3, 6, 2, 4);
      });
    },
    kourai: function () {
      return tex('kourai', 64, 16, function (g, w, h) {
        g.fillStyle = '#efe8d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2420';
        for (var i = 0; i < 4; i++) { g.beginPath(); g.arc(8 + i * 16, 8, 4.2, 0, PI * 2); g.fill(); g.clearRect(6 + i * 16, 6, 4, 4); g.fillStyle = '#efe8d8'; g.fillRect(6 + i * 16, 6, 4, 4); g.fillStyle = '#2a2420'; }
      });
    },
    /* 御簾：細い竹ひごと編み糸。すき間は透ける */
    misu: function () {
      return tex('misu', 64, 64, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        for (var y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? 'rgba(206,188,112,.96)' : 'rgba(188,170,98,.96)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(120,104,60,.42)'; g.fillRect(0, y + 3, w, 1); }
        g.fillStyle = 'rgba(92,70,40,.75)'; g.fillRect(15, 0, 2, h); g.fillRect(47, 0, 2, h);
      });
    },
    /* 檜皮葺：薄い皮を重ねた横の筋 */
    hiwada: function () {
      return tex('hiwada', 64, 64, function (g, w, h) {
        g.fillStyle = '#51402f'; g.fillRect(0, 0, w, h);
        var r = K.rng(5);
        for (var y = 0; y < h; y += 4) { g.fillStyle = 'rgba(30,22,16,' + (0.25 + r() * 0.25) + ')'; g.fillRect(0, y, w, 1); g.fillStyle = 'rgba(140,112,84,.16)'; g.fillRect(0, y + 2, w, 1); }
      });
    },
    /* 蔀・格子 */
    koshi: function () {
      return tex('koshi', 64, 64, function (g, w, h) {
        g.fillStyle = '#d8ccb0'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b2019';
        for (var i = 0; i < 4; i++) { g.fillRect(i * 16, 0, 3, h); g.fillRect(0, i * 16, w, 3); }
      });
    },
    /* やまと絵の障子・屏風：金地に緑青の山、群青の水、白い霞 */
    yamatoe: function () {
      return tex('yamatoe', 256, 128, function (g, w, h) {
        var r = K.rng(31), i;
        g.fillStyle = '#d9c284'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#6f93a0'; g.beginPath(); g.moveTo(0, h); g.bezierCurveTo(60, h - 34, 130, h - 8, w, h - 30); g.lineTo(w, h); g.fill();
        for (i = 0; i < 5; i++) {
          var x = i * 56 + r() * 20, hh = 38 + r() * 34;
          g.fillStyle = i % 2 ? '#5e8f76' : '#7da07a'; g.beginPath(); g.moveTo(x - 46, h - 16); g.quadraticCurveTo(x, h - 16 - hh * 2, x + 46, h - 16); g.fill();
        }
        g.fillStyle = 'rgba(245,238,220,.9)';
        for (i = 0; i < 4; i++) { var cx = r() * w, cy = 14 + r() * 50; g.beginPath(); g.ellipse(cx, cy, 40 + r() * 30, 6, 0, 0, PI * 2); g.fill(); }
        g.fillStyle = '#3f5a3c'; for (i = 0; i < 14; i++) { g.beginPath(); g.arc(r() * w, h - 28 - r() * 40, 3.5, 0, PI * 2); g.fill(); }
        g.fillStyle = '#3a2c20'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 2, h); g.fillRect(127, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
      }, false);
    },
    /* 几帳の帷：白から裾濃（すそご）へ。野筋の紐 */
    katabira: function (name, top, bottom, suji) {
      return tex('kata_' + name, 32, 128, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(0.45, top); gr.addColorStop(1, bottom);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,.22)'; for (var i = 0; i < 6; i++) { g.beginPath(); g.ellipse(8 + (i % 2) * 16, 58 + i * 12, 9, 4, 0.4, 0, PI * 2); g.fill(); }
        g.fillStyle = suji; g.fillRect(14, 0, 4, h);
        g.fillStyle = 'rgba(60,40,30,.25)'; g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
      }, false);
    },
    /* 金雲（すやり霞）：横に長く、端が丸い帯を重ねる */
    kinun: function () {
      return tex('kinun', 256, 128, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        var r = K.rng(77), i;
        function band(x, y, bw, bh, a) {
          var gr = g.createLinearGradient(0, y - bh, 0, y + bh);
          gr.addColorStop(0, 'rgba(226,196,112,' + a + ')'); gr.addColorStop(1, 'rgba(206,170,84,' + a + ')');
          g.fillStyle = gr; g.beginPath();
          g.moveTo(x - bw + bh, y - bh); g.lineTo(x + bw - bh, y - bh); g.arc(x + bw - bh, y, bh, -PI / 2, PI / 2);
          g.lineTo(x - bw + bh, y + bh); g.arc(x - bw + bh, y, bh, PI / 2, PI * 1.5); g.fill();
        }
        g.shadowColor = 'rgba(226,196,112,.9)'; g.shadowBlur = 6;
        band(128, 64, 104, 16, 0.96); band(96, 42, 70, 11, 0.94); band(164, 86, 76, 11, 0.94); band(150, 26, 40, 7, 0.9); band(84, 104, 46, 7, 0.9);
        g.shadowBlur = 0; g.fillStyle = 'rgba(255,240,190,.55)';
        for (i = 0; i < 120; i++) g.fillRect(40 + r() * 176, 22 + r() * 86, 1.5, 1.5);
      }, false);
    },
    /* 白い霞（mist・夕霞） */
    kasumi: function () {
      return tex('kasumi', 256, 64, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        var gr = g.createRadialGradient(128, 32, 4, 128, 32, 128);
        gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.translate(0, 32); g.scale(1, 0.22); g.translate(0, -32); g.fillStyle = gr; g.fillRect(0, -200, w, 464); g.restore();
      }, false);
    },
    glow: function () {
      return tex('glow', 64, 64, function (g) {
        var gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      }, false);
    },
    /* 花びら・葉・雪の粒 */
    hira: function () {
      return tex('hira', 32, 32, function (g) {
        g.clearRect(0, 0, 32, 32); g.fillStyle = '#fff';
        g.beginPath(); g.moveTo(16, 3); g.bezierCurveTo(28, 8, 26, 24, 16, 29); g.bezierCurveTo(6, 24, 4, 8, 16, 3); g.fill();
      }, false);
    },
    /* 渡殿の壁（1 間ぶん）：妻戸 / 御簾と出だし衣 / 蔀 */
    kabe: function (kind) {
      return tex('kabe_' + kind, 128, 128, function (g, w, h) {
        var i;
        g.fillStyle = '#e0d4b8'; g.fillRect(0, 0, w, h);
        if (kind === 'to') {
          g.fillStyle = '#6a4a30'; g.fillRect(10, 14, 108, 114); g.fillStyle = '#573a25'; g.fillRect(62, 14, 4, 114);
          g.strokeStyle = '#3d2818'; g.lineWidth = 3; g.strokeRect(16, 20, 44, 102); g.strokeRect(68, 20, 44, 102);
          g.fillStyle = '#c9a44a'; g.fillRect(56, 66, 5, 9); g.fillRect(67, 66, 5, 9);
        } else if (kind === 'misu') {
          for (i = 14; i < 104; i += 3) { g.fillStyle = i % 6 ? '#cbb96e' : '#b8a660'; g.fillRect(6, i, 116, 2); }
          g.fillStyle = '#3d5a45'; g.fillRect(6, 10, 116, 10); g.fillStyle = '#7a5a34'; g.fillRect(36, 14, 2, 90); g.fillRect(90, 14, 2, 90);
          g.fillStyle = '#b5432e'; g.fillRect(62, 20, 4, 30);
          var c = ['#c66a3a', '#e9b872', '#f3e3b0', '#5b7a4a'];           // 御簾の下からこぼれる袖口（出だし衣）
          for (i = 0; i < 4; i++) { g.fillStyle = c[i]; g.beginPath(); g.ellipse(64, 126, 46 - i * 9, 20 - i * 4, 0, PI, 0); g.fill(); }
        } else {
          g.fillStyle = '#d2c5a4'; g.fillRect(6, 14, 116, 114); g.fillStyle = '#2b2019';
          for (i = 0; i < 8; i++) { g.fillRect(6 + i * 16, 14, 3, 114); g.fillRect(6, 14 + i * 16, 116, 3); }
        }
        g.fillStyle = '#5c3f2a'; g.fillRect(0, 0, w, 10); g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
      }, false);
    }
  };

  /* ---------- 札（殿舎の名など）。縦書きの小さな木札を Sprite で ---------- */
  K.label = function (text, o) {
    o = o || {};
    var chars = String(text).split(''), fs = 44, w = 64, h = chars.length * (fs + 4) + 20;
    var cv = K.canvas(w, h, function (g) {
      g.fillStyle = o.bg || 'rgba(248,242,226,.96)'; g.fillRect(2, 2, w - 4, h - 4);
      g.strokeStyle = o.edge || '#5c3f2a'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = o.ink || '#2a2018'; g.font = '600 ' + fs + 'px "Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP","Noto Serif JP",serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      chars.forEach(function (c, i) { g.fillText(c, w / 2, 12 + fs / 2 + i * (fs + 4)); });
    });
    var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
    var m = new T.SpriteMaterial({ map: t, depthTest: o.depthTest === true, depthWrite: false, sizeAttenuation: !!o.world, fog: false, transparent: true });
    var s = new T.Sprite(m);
    s.center.set(0.5, 0);
    s.userData.label = { px: o.px || chars.length * 15 + 8, aspect: w / h, world: o.world || 0 };
    if (o.world) s.scale.set(o.world * w / h, o.world, 1);
    s.renderOrder = 20;
    return s;
  };
  /* 画面上の大きさを一定に保つ札の寸法合わせ（resize・画角が変わったとき） */
  K.fitLabels = function (obj, camera, viewH) {
    var k = 2 * Math.tan(camera.fov * PI / 360) / Math.max(1, viewH);
    obj.traverse(function (o) {
      var L = o.userData.label; if (!L || L.world) return;
      var hh = L.px * k; o.scale.set(hh * L.aspect, hh, 1);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
