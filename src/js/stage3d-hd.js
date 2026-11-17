/* 3D 舞台の人物（高精細版）—— 解剖学的な頭部・手の網目（CC0）に、平安の装束・髪・化粧を手続きで着せる。
 *   頭部・手のデータ（src/js/stage3d-hd-assets.js、約 4MB）は表紙を出したあとに裏で読み込む（script タグを足す。file:// でも動く）。
 *   届くまで・画質 low・読み込み失敗のときは、stage3d-figures.js の簡素な人形がそのまま使われる。
 *   届いたら、いま映っている舞台の人物もその場で差し替える（stage3d.js の hdSwap）。
 * 公開: GENJI.S3H = { loaded(), ready(), want(), make(id, opts), onReady(fn) }
 * 網目の出典：Blender Studio「Human Base Meshes v1.2.0」（CC0）を姉妹作「鴻門の会」（MIT）が整えたもの。
 * 復号の手順は鴻門の会 koumon-heads.js / koumon-hands.js（同じ作者・MIT）にならう。 */
(function (root) {
  'use strict';
  var G = root.GENJI, T = root.THREE, K = G && G.S3K;
  if (!T || !K || !K.ok) return;
  var H = G.S3H = {}, doc = root.document, PI = Math.PI;

  /* ================= 読み込み ================= */
  var me = doc && doc.currentScript, BASE = '';
  if (me && me.src) BASE = me.src.replace(/[^\/]*$/, '');
  var pending = null, waiters = [];
  H.loaded = function () { return !!(root.GJ3_HD_ASSETS && root.GJ3_HD_ASSETS.heads); };
  H.failed = false;
  H.onReady = function (fn) { if (H.loaded()) fn(); else waiters.push(fn); };
  function fire() { var w = waiters; waiters = []; w.forEach(function (f) { try { f(); } catch (e) { root.console && console.error('[S3H]', e); } }); }
  H.ready = function () {
    if (pending) return pending;
    if (H.loaded()) { pending = Promise.resolve(true); return pending; }
    pending = new Promise(function (res) {
      if (!doc) return res(false);
      /* 一枚 HTML（dist）では、データが <script type="text/plain" id="gj3-hd-data"> に埋め込まれている */
      var inl = doc.getElementById('gj3-hd-data');
      var s = doc.createElement('script');
      if (inl) { s.text = inl.textContent; doc.head.appendChild(s); return res(H.loaded()); }
      s.src = BASE + 'stage3d-hd-assets.js?v=1'; s.async = true;
      s.onload = function () { res(H.loaded()); };
      s.onerror = function () { H.failed = true; res(false); };
      doc.head.appendChild(s);
    }).then(function (ok) { if (ok) fire(); return ok; });
    return pending;
  };
  /* 絵巻（軽量）を選んでいる人には読み込まない */
  H.want = function () {
    try { var m = JSON.parse(root.localStorage.getItem('genji:v1') || '{}'); if (m && m.settings && m.settings.view === '2d') return false; } catch (e) {}
    return true;
  };
  if (doc && root.addEventListener) {
    var pre = function () { if (H.want()) root.setTimeout(H.ready, 300); };
    if (doc.readyState === 'complete') pre(); else root.addEventListener('load', pre);
  }

  /* ================= 復号（koumon-heads.js と同じ形式） ================= */
  function bytes(s) {
    var raw = root.atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function decodeIdx(encoded, count, encoding, vcount) {
    var raw = bytes(encoded), out = new Uint32Array(count), prev = 0, w = 0, off = 0;
    if (encoding !== 'delta-zigzag-varint') { var dv = new DataView(raw.buffer); for (var j = 0; j < count; j++) out[j] = dv.getUint16(j * 2, true); return out; }
    while (off < raw.length && w < count) {
      var v = 0, sh = 0, b;
      do { b = raw[off++]; v |= (b & 127) << sh; sh += 7; } while (b & 128);
      prev += (v >>> 1) ^ -(v & 1);
      out[w++] = prev < 0 ? 0 : prev >= vcount ? vcount - 1 : prev;
    }
    return out;
  }
  function decodeAttr(encoded, count, position, encoding) {
    var raw = bytes(encoded), size = position ? 2 : 1;
    if (!encoding) return raw;
    var res = new Uint8Array(count * size), view = new DataView(res.buffer), prev = [0, 0, 0], off = 0, w = 0, mask = position ? 65535 : 255;
    function num() { var v = 0, sh = 0, b; do { b = raw[off++]; v |= (b & 127) << sh; sh += 7; } while (b & 128); return v; }
    function put(d) { var ax = w % 3, v = (prev[ax] + d) & mask; prev[ax] = v; if (position) view.setUint16(w * 2, v, true); else res[w] = v; w++; }
    while (off < raw.length && w < count) {
      var v = num();
      if (v === 0) { var run = num(); while (run-- && w < count) put(0); }
      else put((v >>> 1) ^ -(v & 1));
    }
    return res;
  }
  /* 頭の部品 1 つ → 位置（Float32）・頂点色（0..1）・index */
  var RAW = {};
  function rawPart(role, q, kind) {
    var key = role + '|' + q + '|' + kind; if (RAW[key]) return RAW[key];
    var A = root.GJ3_HD_ASSETS, d = A.heads[role].lod[q][kind]; if (!d) return null;
    var pk = decodeAttr(d.p, d.v * 3, true, d.encoding && d.encoding.p), dv = new DataView(pk.buffer), pos = new Float32Array(d.v * 3), i;
    for (i = 0; i < pos.length; i++) pos[i] = dv.getInt16(i * 2, true) * A.quantization;
    var col = null;
    if (d.c) { var c = decodeAttr(d.c, d.v * 3, false, d.encoding && d.encoding.c); col = new Float32Array(d.v * 3); for (i = 0; i < col.length; i++) col[i] = c[i] / 255; }
    var idx = decodeIdx(A.indices[d.i], d.t * 3, A.indexEncoding, d.v);
    return (RAW[key] = { pos: pos, col: col, idx: idx, v: d.v });
  }

  /* ================= 色の道具 ================= */
  function lin(hex) { return K.col(hex); }
  function smooth(a, b, x) { var t = K.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mixc(out, a, b, t) { out.r = a.r + (b.r - a.r) * t; out.g = a.g + (b.g - a.g) * t; out.b = a.b + (b.b - a.b) * t; return out; }

  /* ================= 手続きテクスチャ ================= */
  var TX = {};
  function ctex(name, w, h, draw, rep) {
    if (TX[name]) return TX[name];
    var t = new T.CanvasTexture(K.canvas(w, h, draw));
    if (rep !== false) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4; t._gjShared = true;
    return (TX[name] = t);
  }
  /* 髪の筋（明暗の細い縦すじ。bumpMap と色の両方に使う） */
  function hairTex() {
    return ctex('hair', 256, 256, function (g, w, h) {
      var r = K.rng(17), x, i;
      g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
      for (i = 0; i < 900; i++) {
        x = r() * w; var l = 0.3 + r() * 0.7, c = (90 + r() * 120) | 0;
        g.strokeStyle = 'rgba(' + c + ',' + c + ',' + c + ',' + (0.25 + r() * 0.4) + ')'; g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath(); var y0 = r() * h; g.moveTo(x, y0); g.bezierCurveTo(x + (r() - 0.5) * 6, y0 + h * l * 0.33, x + (r() - 0.5) * 6, y0 + h * l * 0.66, x + (r() - 0.5) * 4, y0 + h * l); g.stroke();
        g.beginPath(); g.moveTo(x, y0 - h); g.bezierCurveTo(x + (r() - 0.5) * 6, y0 - h + h * l * 0.33, x, y0 - h + h * l * 0.66, x, y0 - h + h * l); g.stroke();
      }
    });
  }
  /* 絹の地紋（ごく淡い菱文と織り目）。頂点色に掛ける */
  function silkTex() {
    return ctex('silk', 256, 256, function (g, w, h) {
      var im = g.createImageData(w, h), d = im.data, x, y, r = K.rng(5);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var i = (y * w + x) * 4, weave = ((x + y) % 2 ? 3 : -3) + (y % 4 < 2 ? 2 : -2), dia = Math.abs(((x + y) % 64) - 32) + Math.abs(((x - y + 256) % 64) - 32);
        var hishi = dia > 29 && dia < 32 ? -6 : 0, n = (r() - 0.5) * 6, v = 240 + weave + hishi + n;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    });
  }
  function silkBump() {
    return ctex('silkb', 128, 128, function (g, w, h) {
      var im = g.createImageData(w, h), d = im.data, x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var i = (y * w + x) * 4, v = 128 + ((x % 2) ? 30 : -30) * (y % 2 ? 1 : -1); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      g.putImageData(im, 0, 0);
    });
  }

  /* ================= 頭 ================= */
  var GEO = {};
  /* 役ごとの頭の網目（子どもの比率への変形・肌の塗り分けを含む）。同じ鍵は使い回す */
  function headGeo(role, q, look) {
    var key = [role, q, look.tone, look.child || 0, look.paint || ''].join('|');
    if (GEO[key]) return GEO[key];
    var R = rawPart(role, q, 'skin'), n = R.v, pos = new Float32Array(R.pos), col = new Float32Array(n * 3), i;
    var child = look.child || 0, A = root.GJ3_HD_ASSETS.heads[role], eyeY = A.anchors.eyes[0].center[1];
    /* 子ども：顔の下半分を短く、あごを細く、首を短く */
    if (child) for (i = 0; i < n; i++) {
      var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (y < eyeY) { var k = 1 - 0.2 * child; pos[i * 3 + 1] = eyeY + (y - eyeY) * k; if (y < eyeY - 0.03) pos[i * 3] = x * (1 - 0.1 * child * smooth(eyeY - 0.03, -0.08, y)); }
      if (y > eyeY + 0.02) { var s = 1 + 0.06 * child * smooth(eyeY + 0.02, 0.1, y); pos[i * 3] = x * s; pos[i * 3 + 2] = (z + 0.01) * s - 0.01; pos[i * 3 + 1] = eyeY + 0.02 + (y - eyeY - 0.02) * (1 + 0.04 * child); }
    }
    /* 肌の色：網目の頂点色の明暗（彫りの陰影）は残し、色味だけを役の肌（白粉など）へ */
    var M = [0, 0, 0];
    for (i = 0; i < n * 3; i++) M[i % 3] += R.col[i];
    M = M.map(function (v) { return v / n; });
    var base = lin(look.tone), beni = lin(look.lip || '#a8202a'), ink = lin('#2a2226'), blush = lin(look.blush || '#e0a0a0'), c = new T.Color(), tmp = new T.Color();
    var fem = role === 'female';
    for (i = 0; i < n; i++) {
      var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      var vr = R.col[i * 3] / M[0], vg = R.col[i * 3 + 1] / M[1], vb = R.col[i * 3 + 2] / M[2];
      var lum = (vr + vg + vb) / 3, red = K.clamp((vr - vg) * 1.5, 0, 1);
      var d = 1 + (lum - 1) * (look.paint === 'oshiroi' ? 0.45 : 0.75);
      c.setRGB(base.r * d, base.g * d, base.b * d);
      /* 口紅：女は小さく（唇の中ほどだけ）、男・子は控えめに地の赤み */
      var mouthY = fem ? -0.042 : -0.044;
      var lipM = smooth(0.06, 0.08, z) * (1 - smooth(fem ? 0.004 : 0.018, fem ? 0.011 : 0.026, Math.abs(x))) * (1 - smooth(0.006, 0.012, Math.abs(y - mouthY)));
      lipM = K.clamp(lipM * (0.4 + red * 1.6), 0, 1);
      if (lipM > 0) mixc(c, c, look.paint === 'oshiroi' ? beni : tmp.copy(base).lerp(beni, 0.35), lipM * (look.paint === 'oshiroi' ? 0.8 : 0.6));
      /* 頬のほのかな赤み（子ども・若い女） */
      if (look.cheek) { var ch = Math.exp(-(Math.pow(Math.abs(x) - 0.036, 2) + Math.pow(y + 0.008, 2)) / 0.00035) * smooth(0.03, 0.06, z); mixc(c, c, blush, ch * look.cheek); }
      /* 引眉（殿上眉）：もとの眉の上、額の高いところにぼかした墨 */
      if (look.paint === 'oshiroi' && !child) {
        var bx = Math.abs(x) - 0.022, by = y - 0.058 + bx * 0.12, mb = Math.exp(-(bx * bx / 0.00014 + by * by / 0.00002)) * smooth(0.04, 0.07, z);
        mixc(c, c, ink, K.clamp(mb * 0.8, 0, 0.6));
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(new T.BufferAttribute(R.idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    /* 首の下（襟に隠れる帯）は網目が粗く陰影が筋になるので、法線を円筒の向きにならす */
    var NN = g.attributes.normal;
    for (i = 0; i < n; i++) {
      var yy = pos[i * 3 + 1], f = smooth(-0.07, -0.1, yy); if (f <= 0) continue;
      var nx = pos[i * 3], nz = pos[i * 3 + 2] + 0.015, l = Math.sqrt(nx * nx + nz * nz) || 1;
      NN.setXYZ(i, K.lerp(NN.getX(i), nx / l, f), K.lerp(NN.getY(i), 0, f), K.lerp(NN.getZ(i), nz / l, f));
    }
    g._gjShared = true;
    return (GEO[key] = g);
  }
  function partGeo(role, q, kind, hex) {
    var key = role + '|' + q + '|' + kind + '|' + hex; if (GEO[key]) return GEO[key];
    var R = rawPart(role, q, kind); if (!R) return null;
    var g = new T.BufferGeometry(), n = R.v, col = new Float32Array(n * 3), b = lin(hex), i;
    var M = 0; for (i = 0; i < n * 3; i++) M += R.col ? R.col[i] : 1; M /= n * 3;
    for (i = 0; i < n; i++) { var l = R.col ? (R.col[i * 3] + R.col[i * 3 + 1] + R.col[i * 3 + 2]) / 3 / M : 1; l = 0.7 + 0.3 * l; col[i * 3] = b.r * l; col[i * 3 + 1] = b.g * l; col[i * 3 + 2] = b.b * l; }
    g.setAttribute('position', new T.BufferAttribute(R.pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(new T.BufferAttribute(R.idx, 1)); g.computeVertexNormals(); g._gjShared = true;
    return (GEO[key] = g);
  }

  /* 肌の材質：口（あご）を少し動かす uniform を差し込む */
  function skinMat(rough) {
    var m = new T.MeshStandardMaterial({ vertexColors: true, roughness: rough || 0.55, metalness: 0 });
    var u = m.userData.jaw = { value: 0 };
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uJaw = u;
      sh.vertexShader = 'uniform float uJaw;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  float jw = smoothstep(-0.040, -0.047, position.y) * (1.0 - smoothstep(0.018, 0.04, abs(position.x))) * smoothstep(0.035, 0.07, position.z) * (1.0 - smoothstep(-0.075, -0.1, position.y) * 0.0);\n  jw *= 1.0 - smoothstep(-0.08, -0.11, position.y);\n  transformed.y -= uJaw * jw * 0.0045;\n  transformed.z -= uJaw * jw * 0.0012;');
    };
    m.customProgramCacheKey = function () { return 'gj3skin'; };
    return m;
  }

  /* 目：白目の球・虹彩・上まぶた（まばたきと伏し目） */
  var EYEG = {};
  function irisTex() {
    return ctex('iris', 128, 128, function (g, w, h) {
      var im = g.createImageData(w, h), d = im.data, x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
        var st = 0.5 + 0.5 * Math.sin(a * 71 + Math.sin(a * 17) * 3 + r * 18), edge = K.clamp((1 - r) * 8, 0, 1), pup = r < 0.4, i = (y * w + x) * 4;
        d[i] = pup ? 6 : (16 + 16 * st) * edge; d[i + 1] = pup ? 5 : (10 + 8 * st) * edge; d[i + 2] = pup ? 4 : (7 + 5 * st) * edge; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, false);
  }
  function irisGeo(R, ir) {
    var k = R + '|' + ir; if (EYEG[k]) return EYEG[k];
    var g = new T.CircleGeometry(ir, 28), p = g.attributes.position, i;
    for (i = 0; i < p.count; i++) { var x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sqrt(Math.max(0, R * R - x * x - y * y)) + 0.00008); }
    g.computeVertexNormals(); g._gjShared = true; return (EYEG[k] = g);
  }
  function makeEyes(role, look, skin, q) {
    var A = root.GJ3_HD_ASSETS.heads[role], grp = new T.Group(), lids = [];
    var white = new T.MeshStandardMaterial({ color: lin(role === 'female' ? '#d9cdc2' : '#cdbfae'), roughness: 0.28 });
    var iris = new T.MeshStandardMaterial({ map: irisTex(), roughness: 0.18 }); iris.map.encoding = T.sRGBEncoding;
    var lidM = new T.MeshStandardMaterial({ color: lin(look.lid || look.tone), roughness: 0.6 });
    var seg = q === 'low' ? 14 : 24;
    A.anchors.eyes.forEach(function (e) {
      var eg = new T.Group(); eg.position.fromArray(e.center); if (e.scale) eg.scale.fromArray(e.scale);
      var R = e.radius;
      var ball = new T.Mesh(new T.SphereGeometry(R, seg, seg * 0.7 | 0), white); eg.add(ball);
      var ir = new T.Mesh(irisGeo(R, R * (role === 'female' ? 0.5 : 0.46)), iris); eg.add(ir);
      /* 上まぶた：目の球より少し大きい半球。x 軸まわりに回して伏せる */
      var lid = new T.Mesh(new T.SphereGeometry(R * 1.06, seg, 8, 0, PI * 2, 0, PI / 2), lidM);
      eg.add(lid); lids.push(lid);
      grp.add(eg);
    });
    return { g: grp, lids: lids, mats: [white, iris, lidM] };
  }

  /* 髪の殻：頭皮（網目）の生え際より上を法線方向に浮かせる。生え際は頂点の不透明度でぼかす。
   *   style: long（女：中央で分け、耳の上まで。耳から下は下がり髪で隠す） / bob（尼・少女） / male（冠・烏帽子の下の髪と髻） */
  function hairShellGeo(role, q, child, style) {
    var key = 'shell|' + role + '|' + q + '|' + (child || 0) + '|' + style; if (GEO[key]) return GEO[key];
    var skin = headGeo(role, q, { tone: '#ffffff', child: child }), P = skin.attributes.position, N = skin.attributes.normal, I = skin.index.array, n = P.count, i;
    var male = style === 'male';
    function edge(x, y, z) {   /* 生え際からの距離（正＝髪の内側, m） */
      var ax = Math.abs(x), front = smooth(-0.01, 0.05, z);
      var hy = male ? 0.074 + (z - 0.06) * 0.5 - ax * 0.12 : 0.07 - ax * 0.42 + Math.max(0, z - 0.06) * 0.6;
      var side = male ? 0.03 + Math.max(0, z - 0.02) * 0.6 : (style === 'bob' ? -0.02 : 0.028);
      var back = male ? -0.055 : -0.08;
      var lim = K.lerp(K.lerp(back, side, smooth(-0.06, -0.02, z)), Math.max(hy, side), front);
      return y - lim;
    }
    var al = new Float32Array(n), map = new Int32Array(n).fill(-1), pos = [], nor = [], uv = [], col = [], idx = [];
    for (i = 0; i < n; i++) al[i] = smooth(-0.002, 0.006, edge(P.getX(i), P.getY(i), P.getZ(i)));
    function vid(j) {
      if (map[j] >= 0) return map[j];
      var x = P.getX(j), y = P.getY(j), z = P.getZ(j), nx = N.getX(j), ny = N.getY(j), nz = N.getZ(j);
      var th = (male ? 0.0022 : 0.003) + (male ? 0.003 : 0.007) * smooth(-0.02, 0.1, y) * (1 - 0.6 * smooth(0.02, 0.08, z));
      if (!male && Math.abs(x) > 0.06 && y < 0.06) th += 0.006 * smooth(0.06, 0.08, Math.abs(x));
      th *= 0.4 + 0.6 * al[j];
      pos.push(x + nx * th, y + ny * th, z + nz * th); nor.push(nx, ny, nz);
      var a = Math.atan2(x, z + 0.02);
      uv.push(a / PI * 4, (y + 0.1) * 6);
      col.push(1, 1, 1, al[j]);
      return (map[j] = pos.length / 3 - 1);
    }
    for (i = 0; i < I.length; i += 3) {
      var a = I[i], b = I[i + 1], c = I[i + 2];
      if (al[a] + al[b] + al[c] > 0.02) idx.push(vid(a), vid(b), vid(c));
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 4));
    g.setIndex(idx); g.computeVertexNormals(); g._gjShared = true;
    return (GEO[key] = g);
  }
  var HAIRM = {};
  function hairMat(hex, gloss) {
    var k = hex + gloss; if (HAIRM[k]) return HAIRM[k];
    var m = new T.MeshStandardMaterial({ color: lin(hex), roughness: gloss ? 0.34 : 0.5, metalness: 0.0, bumpMap: hairTex(), bumpScale: 0.0016, side: T.DoubleSide, map: hairTex(), vertexColors: true, transparent: true });
    m._gjShared = true;
    return (HAIRM[k] = m);
  }

  /* 頭 1 つを組み立てる。look: { role, tone, paint, lip, child, hair, brow, beard } → { g, skin, lids, jaw, mouth } */
  function buildHead(look, q) {
    var role = look.role, A = root.GJ3_HD_ASSETS.heads[role], g = new T.Group(), mats = [];
    var sm = skinMat(look.paint === 'oshiroi' ? 0.5 : 0.58); mats.push(sm);
    var skin = new T.Mesh(headGeo(role, q, look), sm); skin.castShadow = true; skin.receiveShadow = true; g.add(skin);
    var eyes = makeEyes(role, look, skin, q); g.add(eyes.g); mats = mats.concat(eyes.mats);
    /* 口の奥（口が開いたときに透けないよう） */
    var mo = new T.Mesh(K.G.sph(8, 6), new T.MeshBasicMaterial({ color: 0x2a0f12 })); mo.scale.set(0.012, 0.004, 0.006); mo.position.set(0, role === 'female' ? -0.043 : -0.045, 0.066); g.add(mo); mats.push(mo.material);
    var hk = look.hair || (role === 'female' ? 'long' : 'male');
    if (hk !== 'shaved' && hk !== 'none') {
      var shell = new T.Mesh(hairShellGeo(role, q, look.child || 0, role !== 'female' ? 'male' : hk === 'ama' || hk === 'bob' ? 'bob' : 'long'), hairMat(look.hairCol || '#120f14', role === 'female'));
      shell.castShadow = true; shell.renderOrder = 1; g.add(shell);
    }
    if (role !== 'female') {
      var brow = look.brow !== false && partGeo(role, q, 'brow', look.hairCol || '#211b1c');
      if (brow) g.add(new T.Mesh(brow, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
      var bd = look.beard && partGeo(role, q, 'beard', look.hairCol || '#231d1d');
      if (bd) { var bm = new T.Mesh(bd, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); g.add(bm); }
      if (hk === 'male') {   /* 髻（もとどり）：冠の巾子・烏帽子の中に収まる */
        var mk = new T.Mesh(K.G.sph(12, 10), hairMat(look.hairCol || '#17131a', false)); mk.scale.set(0.022, 0.03, 0.022); mk.position.set(0, 0.13, -0.035); g.add(mk);
      }
    }
    return { g: g, skin: skin, lids: eyes.lids, jaw: sm.userData.jaw, mats: mats, anchors: A.anchors };
  }


  /* ================= 網目の組み立て（頂点色・uv つき） ================= */
  function Mesher(alpha) { this.p = []; this.c = []; this.u = []; this.i = []; this.a = !!alpha; }
  /* fn(u, v, o) で位置 o=[x,y,z]、col(u, v, o) で色（THREE.Color）。uv は (u*us, v*vs) */
  Mesher.prototype.surf = function (nu, nv, fn, col, us, vs, closeU, flip, alphaFn) {
    var base = this.p.length / 3, cols = closeU ? nu : nu + 1, o = [0, 0, 0], i, j, cc;
    for (j = 0; j <= nv; j++) for (i = 0; i < cols; i++) {
      var u = i / nu, v = j / nv; fn(u, v, o); this.p.push(o[0], o[1], o[2]);
      cc = typeof col === 'function' ? col(u, v, o) : col; this.c.push(cc.r, cc.g, cc.b); if (this.a) this.c.push(alphaFn ? alphaFn(u, v) : 1);
      this.u.push(u * (us || 1), v * (vs || 1));
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = base + j * cols + i, b = base + j * cols + (i + 1) % cols, c = base + (j + 1) * cols + i, d = base + (j + 1) * cols + (i + 1) % cols;
      if (!closeU && i === nu) continue;
      if (flip) this.i.push(a, b, c, b, d, c); else this.i.push(a, c, b, b, c, d);
    }
    return this;
  };
  Mesher.prototype.build = function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, this.a ? 4 : 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  };
  /* 曲線に沿う帯（髪の房・纓・紐）。pts を通り、幅 w(t)、厚み bulge、面の向き out */
  function strip(M, pts, widths, bulge, out, nv, col, alphaFn, nu) {
    var curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }), false, 'centripetal');
    nv = nv || 16; nu = nu || 4;
    var up = new T.Vector3(0, 1, 0), prev = new T.Vector3(1, 0, 0), ov = new T.Vector3(out[0], out[1], out[2]), P = [], S = [], N = [], W = [], j;
    for (j = 0; j <= nv; j++) {
      var t = j / nv, p = curve.getPoint(t), tg = curve.getTangent(t), sd = new T.Vector3().crossVectors(up, tg);
      if (sd.length() < 0.3) sd.copy(prev); else sd.normalize();
      if (sd.dot(prev) < 0) sd.negate(); prev.copy(sd);
      var n = new T.Vector3().crossVectors(tg, sd).normalize(); if (n.dot(ov) < 0) n.negate();
      var f = t * (widths.length - 1), i0 = Math.min(widths.length - 2, Math.floor(f));
      P.push(p); S.push(sd); N.push(n); W.push(K.lerp(widths[i0], widths[i0 + 1], f - i0));
    }
    M.surf(nu, nv, function (u, v, o) {
      var k = Math.round(v * nv), p = P[k], sd = S[k], n = N[k], w = W[k], a = u - 0.5, b = (typeof bulge === 'function' ? bulge(v) : bulge) * (1 - 4 * a * a);
      o[0] = p.x + sd.x * a * w + n.x * b; o[1] = p.y + sd.y * a * w + n.y * b; o[2] = p.z + sd.z * a * w + n.z * b;
    }, col, 1, 1, false, false, alphaFn);
    return M;
  }

  /* ================= 人物の型 ================= */
  var F = null;
  var SKIN = { lady: '#f8f1ec', child: '#f6e7dc', noble: '#efdcc9', man: '#e4c8ad', monk: '#d6b494' };
  function roleOf(id, kind) {
    if (kind === 'sou') return 'elder';
    if (kind === 'sokutai' || id === 'mikado') return 'adult';
    if (kind === 'noshi' || kind === 'kariginu') return 'young';
    return 'female';
  }
  function headLookOf(id, kind, fem) {
    var L = { role: roleOf(id, kind) };
    if (L.role === 'female') {
      var child = { shojo: 0.75, warawa: 1, chigo: 1.25 }[kind] || 0;
      L.child = child;
      if (child) { L.tone = SKIN.child; L.cheek = 0.22; L.lip = '#c05a5a'; L.hair = 'bob'; }
      else { L.tone = SKIN.lady; L.paint = 'oshiroi'; L.lip = '#b4323e'; L.hair = kind === 'ama' ? 'ama' : 'long'; L.lid = '#efe2da'; }
      if (id === 'haha' || id === 'amagimi') { L.tone = '#f2e9e2'; }
    } else if (L.role === 'elder') { L.tone = SKIN.monk; L.hair = 'shaved'; L.brow = true; }
    else { L.tone = id === 'genji' ? '#f0dfcd' : id === 'mikado' ? '#eedac6' : SKIN.man; L.beard = L.role === 'adult'; }
    return L;
  }
  function hairStyleOf(kind, id) {
    if (kind === 'juni' || kind === 'kouchiki') return 'long';
    if (kind === 'ama') return 'ama'; if (kind === 'shojo') return 'ougi'; if (kind === 'warawa') return id === 'ichinomiya' ? 'mizura' : 'mid';
    if (kind === 'chigo') return 'short';
    return 'none';
  }

  /* 裾の広がり（θ=0 が正面、π が後ろ）。女性は後ろへ長く引く（stage3d-figures.js と同じ考え） */
  function footFn(fem, stand, seed, trail, wide) {
    return function (th) {
      var c = Math.cos(th - 0.15), b = (1 - c) / 2, s = Math.sin(th), w = 0.012 * Math.sin(th * 7 + seed) + 0.008 * Math.sin(th * 13 + seed * 2);
      if (fem) return stand ? 0.22 + 0.04 * s * s + 0.75 * trail * b * b * b + w * 0.6 : (0.40 + 0.11 * s * s + 0.68 * trail * b * b * b) * (wide || 1) + w;
      return stand ? 0.22 + 0.04 * s * s + 0.6 * trail * b * b * b : 0.36 + 0.16 * s * s + 0.6 * trail * b * b * b + w;
    };
  }

  function HFig(id, opts) {
    F = F || G.S3F;
    var look = F.lookOf(id), kd = F.KIND[look.kind] || F.KIND.juni;
    this.id = id; this.kd = kd; this.kind = look.kind; this.hd = true;
    var cols = (look.colors || ['#888']).slice();
    if (opts.variant) cols = cols.map(function (c, i) { var k = new T.Color(c); k.offsetHSL(0.035 * opts.variant * (i % 2 ? -1 : 1), 0, i ? 0 : -0.03 * opts.variant); return '#' + k.getHexString(); });
    this.cols = cols;
    this.fem = kd.fem && id !== 'ichinomiya';
    this.child = { shojo: 1, warawa: 1, chigo: 1 }[look.kind] ? 1 : 0;
    this.seed = (opts.seed || 0) + id.length * 1.7;
    this.q = 'high'; this.tier = opts.quality === 'low' ? 'low' : 'high';   /* low：人数・網目を控えめに（頭は寄ったときだけ細かく） */
    this.far = !!opts.far;
    this.scale = kd.sc * (opts.scale || 1);
    this.trail = look.kind === 'juni' || look.kind === 'kouchiki' ? 1 : look.kind === 'ama' ? 0.55 : id === 'mikado' ? 0.7 : 0.35;
    this.hairStyle = hairStyleOf(look.kind, id);
    this.headLook = headLookOf(id, look.kind, this.fem);
    if (id === 'ichinomiya' || id === 'wakamiya') { this.headLook.role = 'female'; }
    /* 材質：装束（頂点色×絹の地紋）・髪 */
    this.mat = new T.MeshStandardMaterial({ vertexColors: true, map: silkTex(), bumpMap: silkBump(), bumpScale: 0.0004, roughness: 0.74, metalness: 0, side: T.DoubleSide });
    this.mat.emissive = new T.Color(0, 0, 0);
    this.hmat = hairMat(this.fem || this.child ? '#120f14' : '#17131a', true);
    this.root = new T.Group(); this.root.scale.setScalar(this.scale);
    this.pivot = new T.Group(); this.root.add(this.pivot);
    this.upper = new T.Group(); this.pivot.add(this.upper);
    var male = !this.fem;
    this.dim = male ? { H: 0.45, sx: 0.145, sy: 0.37, wSit: 0.3, wStand: 0.94 } : { H: 0.42, sx: 0.14, sy: 0.355, wSit: 0.26, wStand: 0.9 };
    this.wSit = this.dim.wSit; this.wStand = this.dim.wStand;
    this.headG = new T.Group(); this.headG.position.set(0, this.dim.H - 0.01, 0.0); this.upper.add(this.headG);
    /* 子どもは頭を大きめに（頭身を下げる） */
    this.headScale = this.child ? Math.pow(kd.sc, -0.6) : 1;
    this.headO = new T.Vector3(0, 0.112, 0.014);
    this.headWrap = new T.Group(); this.headWrap.position.copy(this.headO).multiplyScalar(1); this.headWrap.scale.setScalar(this.headScale); this.headG.add(this.headWrap);
    this.armL = new T.Group(); this.armL.position.set(this.dim.sx, this.dim.sy, -0.01); this.upper.add(this.armL);
    this.armR = new T.Group(); this.armR.position.set(-this.dim.sx, this.dim.sy, -0.01); this.upper.add(this.armR);
    this.props = {}; this.lowers = {}; this.sleeveKey = ''; this.hairKey = '';
    this.ph = (this.seed * 2.3) % 6.28;
    this.cur = {}; this.tgt = {}; this.spk = 0; this.spkT = 0; this.blinkT = 2 + (this.seed % 3); this.blink = 0;
    this.heads = {};
    this._mesh(this.upper, this._torso());
    this._setHead('low');
    this._headDeco();
    this.setPose(opts.pose || 'sit', true);
    this.update(0, 0);
  }
  HFig.prototype._mesh = function (parent, geo, mat) {
    var m = new T.Mesh(geo, mat || this.mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  HFig.prototype._setHead = function (q) {
    if (this.headQ === q) return;
    var h = this.heads[q];
    if (!h) { h = this.heads[q] = buildHead(this.headLook, q); this.headWrap.add(h.g); }
    for (var k in this.heads) this.heads[k].g.visible = k === q;
    this.headQ = q; this.head = h;
  };
  /* 視点からの距離で、頭の網目の細かさを切り替える */
  HFig.prototype.lod = function (camPos) {
    if (this.far) return;
    var hw = this.headWorld(_lv), d = hw.distanceTo(camPos) / (this.root.scale.x || 1);
    var near = this.tier === 'low' ? 2.0 : 3.2;
    this._setHead(d < near ? 'high' : d > near + 0.4 ? 'low' : this.headQ);
  };
  var _lv = new T.Vector3();

  /* ---------- 胴（上半身）と襟 ---------- */
  HFig.prototype._torsoR = function (v, th) {
    /* v: 0=腰 .. 1=首。返り値 [rx, rz, dz] */
    var fem = this.fem, P = fem ? [[0.158, 0.132], [0.162, 0.13], [0.16, 0.122], [0.148, 0.108], [0.108, 0.082], [0.054, 0.052]] : [[0.168, 0.13], [0.174, 0.134], [0.168, 0.126], [0.15, 0.11], [0.105, 0.084], [0.056, 0.054]];
    var V = [0, 0.3, 0.6, 0.8, 0.92, 1], k = 0; v = K.clamp(v, 0, 1);
    while (k < V.length - 2 && v > V[k + 1]) k++;
    var t = smooth(V[k], V[k + 1], v);
    return [K.lerp(P[k][0], P[k + 1][0], t), K.lerp(P[k][1], P[k + 1][1], t), 0.012 * Math.sin(v * PI) - 0.01 * v];
  };
  HFig.prototype._torsoPt = function (th, v, off, o) {
    var r = this._torsoR(v, th), H = this.dim.H, fold = 0.0025 * Math.sin(th * 7 + this.seed) * (1 - v);
    var c = Math.cos(th), s = Math.sin(th), nx = s / r[0], nz = c / r[1], nl = Math.sqrt(nx * nx + nz * nz);
    o[0] = (r[0] + fold) * s + off * nx / nl; o[2] = (r[1] + fold) * c + r[2] + off * nz / nl; o[1] = v * H;
    return o;
  };
  HFig.prototype._torso = function () {
    var M = new Mesher(), self = this, c = this.cols, kd = this.kd, H = this.dim.H, outer = lin(c[0]), i;
    /* 上着の胴。腰より下にも少し伸ばし、裾との継ぎ目を隠す */
    M.surf(40, 16, function (u, v, o) { var vv = v * 1.12 - 0.12; self._torsoPt(u * PI * 2, Math.max(0, vv), 0, o); if (vv < 0) { o[1] = vv * H * 0.8; o[0] *= 1.02; o[2] *= 1.02; } }, outer, 8, 3, true);
    var kind = this.kind;
    if (kind === 'noshi' || kind === 'sokutai' || kind === 'kariginu') this._roundCollar(M);
    else this._vCollar(M);
    if (kd.kesa) this._kesa(M);
    if (kind === 'sokutai') {   /* 石帯 */
      M.surf(40, 2, function (u, v, o) { self._torsoPt(u * PI * 2, 0.08 + v * 0.06, 0.006, o); }, lin('#151316'), 8, 1, true);
    }
    if (kind === 'kariginu' || kind === 'noshi') {   /* 当帯（腰の帯） */
      M.surf(40, 2, function (u, v, o) { self._torsoPt(u * PI * 2, 0.06 + v * 0.05, 0.005, o); }, lin(c[0]).multiplyScalar(0.82), 8, 1, true);
    }
    return M.build();
  };
  /* 女・僧・子：前で合わせる襟。外の衣ほど V が深く、内へ行くほど首に近い。襲の色が段に見える */
  HFig.prototype._vCollar = function (M) {
    var self = this, c = this.cols, n = this.fem ? Math.min(c.length, (this.kd.layers || 3)) : 2, layers = [], i;
    for (i = 0; i < n; i++) layers.push(c[i]);
    if (!this.fem || this.kind === 'ama') layers = [c[0], c[1] || c[0]];
    layers.push('#f6f2ea');                          /* いちばん内の白（単・小袖） */
    var L = layers.length, depth0 = this.child ? 0.7 : 0.66;
    for (i = 0; i < L; i++) {
      var col = lin(layers[i]), vd = depth0 + i * (0.22 / L), off = 0.003 + (L - i) * 0.002, w = 0.06;
      [-1, 1].forEach(function (sd) {
        M.surf(14, 2, function (u, v, o) {
          /* u: 0 = 前の合わせ目 .. 1 = 後ろ首。v: 帯の幅 */
          var th = sd * (0.02 + u * (PI - 0.02)), vv = K.lerp(vd, 0.975, smooth(0, 0.2, u)) + v * w * (0.6 + 0.4 * smooth(0, 0.2, u));
          self._torsoPt(th, Math.min(1, vv), off + 0.002 * v, o);
          if (u < 0.06 && sd > 0) o[0] -= 0.02 * (1 - u / 0.06);
        }, col, 2, 1);
      });
    }
  };
  /* 男：盤領（あげくび）。首をまわる丸い襟と、右肩の留め（蜻蛉） */
  HFig.prototype._roundCollar = function (M) {
    var self = this, c = this.cols, H = this.dim.H, col = lin(c[0]), hit = lin('#f6f2ea');
    M.surf(32, 6, function (u, v, o) {
      var th = u * PI * 2, a = v * PI * 2, r = self._torsoR(0.965, th), R = 0.0085;
      var cx = (r[0] + 0.003) * Math.sin(th), cz = (r[1] + 0.003) * Math.cos(th) + r[2];
      var nx = Math.sin(th), nz = Math.cos(th);
      o[0] = cx + nx * R * Math.cos(a); o[2] = cz + nz * R * Math.cos(a); o[1] = H * 0.965 + R * Math.sin(a) * 1.4 + 0.004;
    }, col, 4, 1, true);
    /* 内の単の白がのぞく */
    M.surf(32, 1, function (u, v, o) { var th = u * PI * 2; self._torsoPt(th, 0.985, 0.002, o); o[1] += v * 0.012; }, hit, 4, 1, true);
    var k = new T.SphereGeometry(0.009, 8, 6); k.translate(-0.07, H * 0.95, 0.03);
    addGeo(M, k, col); k.dispose();
  };
  function addGeo(M, g, col) {
    var P = g.attributes.position, I = g.index, base = M.p.length / 3, i;
    for (i = 0; i < P.count; i++) { M.p.push(P.getX(i), P.getY(i), P.getZ(i)); M.c.push(col.r, col.g, col.b); if (M.a) M.c.push(1); M.u.push(0, 0); }
    if (I) for (i = 0; i < I.count; i++) M.i.push(base + I.getX(i)); else for (i = 0; i < P.count; i++) M.i.push(base + i);
  }
  /* 袈裟：左肩から右の脇へ斜めにかける */
  HFig.prototype._kesa = function (M) {
    var self = this, col = lin(this.cols[1] || '#a58c5c'), line = lin(this.cols[1] || '#a58c5c').multiplyScalar(0.7);
    M.surf(48, 4, function (u, v, o) {
      var th = u * PI * 2, vc = 0.55 + 0.32 * Math.sin(th - PI / 2) * 0.9;
      self._torsoPt(th, K.clamp(vc - 0.1 + v * 0.2, 0, 0.97), 0.008, o);
    }, function (u, v) { return (Math.round(u * 48) % 6 === 0 || v === 0 || v === 1) ? line : col; }, 6, 1, true);
  };

  /* ---------- 袖（腕ごと動く）。袖口に襲の色目、袂は下へ垂れる ---------- */
  HFig.prototype._sleeve = function (side, P) {
    var M = new Mesher(), self = this, c = this.cols, fem = this.fem, kd = this.kd;
    var n = fem ? Math.min(c.length, kd.layers || 3) : 2, L = fem ? 0.36 : 0.39, i;
    var layers = []; for (i = 0; i < n; i++) layers.push(fem ? c[i] : (i ? (this.kind === 'kariginu' ? c[1] : '#f4efe2') : c[0]));
    if (this.kind === 'sou' || this.kind === 'ama') layers = [c[0], '#f2eee6'];
    /* 重力の向きを腕の座標へ（姿勢の目標値で） */
    var lf = side > 0 ? P.lf || 0 : P.rf || 0, a = (P.lean || 0) + lf, gy = -Math.cos(a), gz = -Math.sin(a);   /* 腕の座標での「下」 */
    var bag = (fem ? 0.2 : 0.15) * (this.child ? 0.8 : 1);
    layers.forEach(function (hex, li) {
      var col = lin(hex), len = L + li * 0.014, shrink = li * 0.005, v0 = li ? 0.55 : 0;
      M.surf(28, 12, function (u, v, o) {
        var vv = K.lerp(v0, 1, v), th = u * PI * 2, y = -len * vv;
        var rx = K.lerp(0.05, fem ? 0.095 : 0.082, smooth(0, 0.6, vv)) - shrink, rz = K.lerp(0.06, fem ? 0.135 : 0.125, smooth(0, 0.7, vv)) - shrink;
        var x = rx * Math.sin(th), z = rz * Math.cos(th);
        /* 袂：腕の下側（重力の側）に平たい袋になって垂れる。腕を下ろすと袖口の先へ伸びる */
        var dn = Math.max(0, -Math.cos(th)), sgz = Math.abs(gz), drop = bag * smooth(0.15, 1, vv) * Math.pow(dn, 0.6);
        var fold = 0.005 * Math.sin(th * 5 + self.seed + side) * vv;
        o[0] = x * (1 + fold * 8) * (1 - 0.35 * drop / (bag + 1e-6) * sgz); o[1] = y - drop * (1 - sgz) * 0.6; o[2] = z - drop * sgz * 1.1;
        o[0] *= side;
      }, col, 3, 2, true);
    });
    /* 狩衣：袖口の袖括（そでぐくり）の紐を縁に通す */
    if (this.kind === 'kariginu') {
      var cord = lin(c[1] || '#d8cfb0'), len0 = L;
      M.surf(28, 3, function (u, v, o) {
        var th = u * PI * 2, a2 = v * PI * 2, rx = 0.082, rz = 0.125, r0 = 0.005;
        var dn = Math.max(0, -Math.cos(th)), sgz = Math.abs(gz), drop = bag * Math.pow(dn, 0.6);
        var x = (rx + r0 * Math.cos(a2)) * Math.sin(th) * (1 - 0.35 * drop / (bag + 1e-6) * sgz), z = (rz + r0 * Math.cos(a2)) * Math.cos(th);
        o[0] = x * side; o[1] = -len0 + 0.006 + r0 * Math.sin(a2) - drop * (1 - sgz) * 0.6; o[2] = z - drop * sgz * 1.1;
      }, cord, 3, 1, true);
    }
    return M.build();
  };
  HFig.prototype._hands = function () {
    if (this.handsMade || !root.GJ3_HD_ASSETS.hands) return;
    this.handsMade = true;
    var tone = this.headLook.tone, P = { skin: new T.Color(tone).getHex(), skinRed: new T.Color(tone).offsetHSL(-0.01, 0.1, -0.12).getHex(), skinLight: new T.Color(tone).offsetHSL(0, 0, 0.04).getHex() };
    this.handP = P; this.hand = {};
  };
  HFig.prototype._hand = function (side, pose) {
    this._hands(); if (!this.hand) return null;
    var key = side + pose; if (this.hand[key]) return this.hand[key];
    var m = buildHand(pose, side > 0 ? 'L' : 'R', this.handP, this.tier === 'low' || this.far ? 'low' : 'high');
    if (!m) return null;
    var g = new T.Group(); g.add(m); (side > 0 ? this.armL : this.armR).add(g);
    m.rotation.set(PI, side > 0 ? -PI / 2 : PI / 2, 0, 'YXZ');
    g.position.set(0, -(this.fem ? 0.36 : 0.39) + 0.035, 0.01);
    g.scale.setScalar(this.child ? 0.75 : this.fem ? 0.88 : 0.95);
    return (this.hand[key] = g);
  };

  /* ---------- 裾（下半身） ---------- */
  HFig.prototype._lower = function (stand) {
    var key = stand ? 'st' : 'si'; if (this.lowers[key]) return this.lowers[key];
    var M = new Mesher(), self = this, c = this.cols, kd = this.kd, fem = this.fem, kind = this.kind, i;
    var foot = footFn(fem, stand, this.seed, this.trail, this.child ? 0.85 : 1), H = (stand ? this.wStand : this.wSit) + 0.03;
    var topRx = stand ? 0.17 : 0.19, topRz = stand ? 0.14 : 0.16, p = stand ? 2.2 : (fem ? 1.6 : 1.3);
    var outer = lin(c[0]);
    var hak = fem ? (kind === 'ama' ? lin('#6d6863') : kind === 'shojo' || kind === 'warawa' || kind === 'chigo' ? null : lin(this.id === 'murasaki' ? '#5a2440' : '#a3202a')) : lin(kind === 'kariginu' ? (c[2] || c[1]) : (c[1] || c[0]));
    if (kind === 'sou') hak = null;
    var nl = fem ? Math.min(c.length, kd.layers || 3) : 1;
    var openW = function (v) { return fem ? (0.1 + 0.36 * v) : (kind === 'kariginu' ? 0.35 + 0.55 * v : 0.2 + 0.4 * v); };
    function S(th, v, off, o) {
      var r0x = topRx, r0z = topRz, R = foot(th), t = Math.pow(v, stand ? 1.25 : 0.7);
      var rr = K.lerp(Math.sqrt(1 / (Math.pow(Math.sin(th) / r0x, 2) + Math.pow(Math.cos(th) / r0z, 2))), R, t);
      /* ひだ：裾に近いほど深く */
      var fold = (0.016 * Math.sin(th * 11 + self.seed) + 0.009 * Math.sin(th * 23 + self.seed * 3)) * smooth(0.15, 1, v);
      rr += fold + off;
      var y = H * Math.pow(1 - v, p) + 0.012 + Math.max(0, fold) * 0.4 * v;
      /* 座る男：膝のふくらみ（あぐら）を前に */
      if (!fem && !stand) { var kn = Math.exp(-Math.pow((Math.abs(Math.sin(th)) - 0.55) / 0.35, 2)) * smooth(0, 0.6, Math.cos(th)); y += 0.06 * kn * smooth(0.3, 0.7, v) * (1 - smooth(0.8, 1, v)); }
      o[0] = rr * Math.sin(th); o[1] = y; o[2] = rr * Math.cos(th);
      return o;
    }
    function inOpen(th, v) { var a = Math.atan2(Math.sin(th), Math.cos(th)); return Math.abs(a) < openW(v); }
    /* 表の衣：前の合わせ目（くさび形）を空け、そこに一段奥の袴を置く */
    var W1 = hak ? openW : function () { return 0; };
    var NU = this.tier === 'low' || this.far ? 56 : 88;
    M.surf(NU, 20, function (u, v, o) { var w = W1(v); S(w + u * (PI * 2 - 2 * w), v, 0, o); }, outer, 10, 3, !hak);
    if (hak) M.surf(16, 22, function (u, v, o) { var w = openW(v) * 1.04; S(-w + u * 2 * w, v, -0.006, o); }, hak, 2, 3);
    /* 合わせ目の縁：内の衣の色が段に見える（女） */
    if (fem && hak && nl > 1) {
      for (i = 1; i < nl; i++) {
        (function (i) {
          var col = lin(c[i]);
          [-1, 1].forEach(function (sd) {
            M.surf(1, 20, function (u, v, o) {
              var vv = 0.04 + v * 0.96, w = openW(vv), th = sd * (w - (i) * 0.026 + u * 0.026);
              S(th, vv, -0.0015 * i, o);
            }, col, 1, 4);
          });
        })(i);
      }
    }
    /* 裾の重なり：内の衣ほど外へ少しずつはみ出す */
    for (i = 1; i < nl; i++) {
      (function (i) {
        var col = lin(c[i]), k = 1 + 0.04 * i, w = hak ? openW(1) - i * 0.026 : 0;
        M.surf(88, 2, function (u, v, o) {
          var th = w + u * (PI * 2 - 2 * w), R = foot(th) * K.lerp(0.95, k, v) + (0.016 * Math.sin(th * 11 + self.seed) + 0.009 * Math.sin(th * 23 + self.seed * 3));
          o[0] = R * Math.sin(th); o[2] = R * Math.cos(th); o[1] = 0.016 - i * 0.003 - v * 0.006;
        }, col, 10, 1, !hak);
      })(i);
    }
    /* 束帯の裾（下襲の裾＝きょ）・御引直衣の後ろへ引く裾 */
    if (kd.kyo || this.id === 'mikado') {
      var kcol = lin(kd.kyo ? (c[1] || c[0]) : c[0]), long = kd.kyo ? 1.55 : 0.9;
      M.surf(10, 18, function (u, v, o) {
        var w = 0.28 + 0.06 * v, x = (u - 0.5) * w * 2, z = -0.18 - v * long, y = Math.max(0.012, H * 0.6 * Math.pow(1 - smooth(0, 0.3, v), 2)) + 0.004 * Math.sin(u * 12 + v * 4);
        o[0] = x + 0.04 * v; o[1] = y; o[2] = z;
      }, kcol, 3, 6);
    }
    var m = this._mesh(this.pivot, M.build()); m.userData.info = { foot: foot, H: H, topR: topRx, p: p, S: S };
    return (this.lowers[key] = m);
  };


  /* ---------- 頭の飾り：髪の房（頭について動く分）・冠・烏帽子 ---------- */
  HFig.prototype._headDeco = function () {
    var M = new Mesher(true), hs = this.hairStyle, self = this, black = lin('#ffffff'), i, r = K.rng(this.seed * 100 | 0);
    function fadeEnd(k) { return function (u, v) { return 1 - smooth(1 - k, 1, v); }; }
    function clumps(n, mk) { for (var j = 0; j < n; j++) mk(j, (j + 0.5) / n - 0.5, r()); }
    if (this.fem || this.child) {
      /* 後ろ頭を覆う房（髪の殻との継ぎ目を隠す） */
      var backLen = hs === 'ama' ? -0.2 : hs === 'ougi' ? -0.3 : hs === 'mid' ? -0.52 : hs === 'short' ? -0.06 : -0.15;
      if (hs !== 'none' && hs !== 'mizura') clumps(hs === 'short' ? 5 : 9, function (j, f, rr) {
        var x = f * 0.15, sp = hs === 'ougi' ? 2.6 : hs === 'ama' ? 1.35 : 1.15, z0 = -0.088 + Math.abs(f) * 0.05;
        var end = backLen * (0.94 + rr * 0.1);
        var pts = [[x * 0.6, 0.075, -0.06], [x * 0.9, 0.045, z0 - 0.002], [x, 0.0, z0 - 0.012], [x * (1 + (sp - 1) * 0.5), -0.09, z0 - 0.006], [x * sp, end, z0 - 0.02 - (hs === 'ougi' ? 0.02 : 0)]];
        if (end > -0.1) pts = pts.slice(0, 4).map(function (q, k) { return k === 3 ? [q[0], end, q[2]] : q; });
        strip(M, pts, [0.006, 0.03, 0.034, 0.036 * sp * 0.8, 0.04 * sp], 0.006, [x * 2, 0, -1], 18, black, hs === 'ama' || hs === 'ougi' || hs === 'mid' ? fadeEnd(0.04) : fadeEnd(0.1));
      });
      /* 鬢（びん）・額髪：顔の両脇に下がる房。耳を隠し、肩の前へ */
      var sideLen = hs === 'long' ? -0.36 : hs === 'ama' ? -0.19 : hs === 'ougi' ? -0.22 : hs === 'mid' ? -0.2 : 0;
      if (sideLen) [-1, 1].forEach(function (sd) {
        clumps(3, function (j, f, rr) {
          var x0 = 0.05 + j * 0.006, z0 = 0.026 - j * 0.022, wd = j === 1 ? 0.056 : 0.032;
          var pts = [[sd * x0 * 0.9, 0.07, z0 - 0.012], [sd * (x0 + 0.024), 0.045, z0 + 0.0], [sd * (0.088 + j * 0.005), -0.015, z0 - 0.008], [sd * (0.094 + j * 0.006), -0.12, z0 - 0.004], [sd * (0.096 + j * 0.008), sideLen * (0.95 + rr * 0.08), z0 + 0.016]];
          strip(M, pts, [0.004, wd * 0.8, wd, wd, hs === 'ougi' ? wd * 1.6 : wd * 0.9], 0.004, [sd, 0, 0.3], 18, black, fadeEnd(hs === 'long' ? 0.12 : 0.04));
        });
      });
      if (hs === 'mizura') [-1, 1].forEach(function (sd) {   /* 角髪：耳の横で輪に結う */
        var tor = new T.TorusGeometry(0.03, 0.012, 8, 18); tor.rotateY(PI / 2); tor.translate(sd * 0.09, -0.03, -0.01); addGeo(M, tor, black); tor.dispose();
      });
    }
    var hairM = M.p.length ? this._mesh(this.headWrap, M.build(), this.hmat) : null;
    if (hairM) hairM.renderOrder = 2;
    var kind = this.kind;
    if (kind === 'noshi' || kind === 'sokutai') this._mesh(this.headWrap, this._kanmuri(this.id === 'mikado'), lacquer());
    else if (kind === 'kariginu') this._mesh(this.headWrap, this._eboshi(), lacquer(true));
  };
  var LAQ = {};
  function lacquer(soft) {
    var k = soft ? 's' : 'h'; if (LAQ[k]) return LAQ[k];
    var m = new T.MeshStandardMaterial({ color: lin(soft ? '#1a181b' : '#121014'), roughness: soft ? 0.55 : 0.3, metalness: 0, side: T.DoubleSide, bumpMap: silkBump(), bumpScale: soft ? 0.0008 : 0.0003 });
    m._gjShared = true; return (LAQ[k] = m);
  }
  /* 冠：頭にかぶる甲・髻を入れる巾子（こじ）・纓（えい）。帝は立纓（纓を立てる） */
  HFig.prototype._kanmuri = function (ryu) {
    var M = new Mesher(), k = lin('#ffffff');
    M.surf(32, 8, function (u, v, o) {          /* 甲：頭頂をおおう浅い椀 */
      var th = u * PI * 2, a = v * PI * 0.5, rx = 0.075, rz = 0.088;
      o[0] = Math.sin(th) * Math.cos(a) * rx; o[2] = Math.cos(th) * Math.cos(a) * rz - 0.018; o[1] = 0.07 + Math.sin(a) * 0.052 + (Math.cos(th) > 0 ? 0.004 * Math.cos(th) : -0.012 * Math.cos(th) * Math.cos(a));
    }, k, 4, 1, true, true);
    M.surf(24, 4, function (u, v, o) {          /* 巾子：後ろに立つ筒 */
      var th = u * PI * 2, rx = 0.03, rz = 0.026, y = 0.11 + v * 0.085;
      o[0] = Math.sin(th) * rx * (1 - v * 0.08); o[2] = Math.cos(th) * rz - 0.048 - v * 0.012; o[1] = y + (v === 1 ? 0.004 * Math.cos(th) : 0);
    }, k, 3, 1, true);
    M.surf(24, 1, function (u, v, o) { var th = u * PI * 2; o[0] = Math.sin(th) * 0.028 * (1 - v); o[2] = Math.cos(th) * 0.024 * (1 - v) - 0.06; o[1] = 0.195; }, k, 1, 1, true, true);
    /* 纓：巾子の後ろから。立纓は上へ反り、垂纓は背へ垂れる */
    var pts = ryu ? [[0, 0.17, -0.075], [0, 0.22, -0.11], [0, 0.27, -0.16], [0, 0.29, -0.22]] : [[0, 0.17, -0.075], [0, 0.15, -0.14], [0, 0.04, -0.18], [0, -0.1, -0.19], [0, -0.22, -0.18]];
    strip(M, pts, ryu ? [0.034, 0.042, 0.048, 0.05] : [0.03, 0.038, 0.042, 0.044, 0.044], 0.002, [0, 0.3, -1], 14, k);
    return M.build();
  };
  /* 立烏帽子：漆で固めた紗の高い帽子。頭にかぶる口から上はやや細り、頂は丸く後ろへ反る。前に「招き」のくぼみ、表に皺（さび） */
  HFig.prototype._eboshi = function () {
    var M = new Mesher(), k = lin('#ffffff'), seed = this.seed;
    M.surf(36, 18, function (u, v, o) {
      var th = u * PI * 2, h = 0.2, top = smooth(0.72, 1, v), round = Math.sqrt(Math.max(0, 1 - top * top * 0.98));
      var rx = K.lerp(0.077, 0.062, smooth(0, 0.7, v)) * round, rz = K.lerp(0.09, 0.07, smooth(0, 0.7, v)) * round;
      var dent = 0.014 * Math.exp(-Math.pow(th / 0.45, 2)) * smooth(0.3, 0.6, v) * (1 - smooth(0.75, 0.95, v));
      var crumple = 0.0025 * Math.sin(th * 7 + seed + v * 11) * smooth(0.1, 0.5, v) + 0.0015 * Math.sin(v * 37 + th * 3);
      var lean = 0.06 * v * v;
      o[0] = Math.sin(th) * (rx + crumple); o[2] = Math.cos(th) * (rz + crumple - dent) - 0.016 - lean; o[1] = 0.06 + v * h - top * 0.02;
    }, k, 4, 3, true, true);
    return M.build();
  };

  /* ---------- 長い髪：背から裾の上へ流し、床に広がる（姿勢ごとに作り直す） ---------- */
  HFig.prototype._longHair = function (P) {
    if (this.hairStyle !== 'long') return;
    var key = (P.st ? 's' : 'i') + (P.lie ? 'l' : '') + Math.round(P.lean * 10) + '|' + Math.round((P.hp || 0) * 10);
    if (key === this.hairKey) return; this.hairKey = key;
    if (this.longHair) { this.longHair.geometry.dispose(); this.pivot.remove(this.longHair); this.longHair = null; }
    var self = this, M = new Mesher(true), a = P.lean || 0, hp = P.hp || 0, wy = P.lie ? 0.15 : P.st ? this.wStand : this.wSit, Hn = this.headG.position.y, hs = this.headScale, ho = this.headO;
    var ca = Math.cos(a), sa = Math.sin(a), ch = Math.cos(hp), sh = Math.sin(hp);
    function fromHead(y, z) { var yy = ho.y + y * hs, zz = ho.z + z * hs, y2 = yy * ch - zz * sh, z2 = yy * sh + zz * ch; return fromUpper(Hn + y2, z2); }
    function fromUpper(y, z) { return [0, wy + y * ca - z * sa, y * sa + z * ca]; }
    var r = K.rng(this.seed * 31 | 0), N = this.tier === 'low' || this.far ? 6 : 10, white = lin('#ffffff'), j;
    var spine = [];
    if (P.lie) {
      var h0 = fromHead(-0.05, -0.09);
      spine = [h0, [0.05, 0.05, h0[2] - 0.2], [0.18, 0.03, h0[2] - 0.45], [0.36, 0.025, h0[2] - 0.68], [0.6, 0.02, h0[2] - 0.8]];
    } else {
      var sk = this._lower(!!P.st).userData.info, R = sk.foot(PI), o = [0, 0, 0], k2;
      spine.push(fromHead(0.02, -0.098), fromHead(-0.1, -0.1), fromUpper(Hn - 0.1, -0.142), fromUpper(Hn * 0.5, -0.16));
      /* 腰から下は裾の面（背の側）をなぞる。裾の面は表の衣の S() と同じ式 */
      var last = spine[spine.length - 1], zs = [];
      for (k2 = 0; k2 <= 12; k2++) { var p = sk.S(PI, k2 / 12, 0.028, o).slice(); if (-p[2] > -last[2] + 0.02 && p[1] < last[1] - 0.02) zs.push(p); }
      var stepN = Math.max(1, Math.floor(zs.length / 6));
      zs.forEach(function (p, k3) { if (k3 % stepN === 0 || k3 === zs.length - 1) spine.push(p); });
      var tail = spine[spine.length - 1]; spine.push([0.02, 0.022, tail[2] - (P.st ? 0.12 : 0.28)]);
    }
    var widths = P.lie ? [0.14, 0.26, 0.32, 0.3, 0.12] : [0.14, 0.18, 0.22, 0.25, 0.28, 0.3, 0.32, 0.34, 0.34, 0.3];
    /* 下地の一枚（房のすき間から下の衣が透けないように） */
    strip(M, spine.map(function (q) { return [q[0], q[1] - 0.002, q[2] + 0.002]; }), widths.map(function (w) { return w * 0.92; }), 0.004, [0, 1, -0.4], 36, white, function (u, v) { return 1 - smooth(0.8, 0.97, v); }, 4);
    for (j = 0; j < N; j++) {
      var f = (j + 0.5) / N - 0.5, len = 0.93 + r() * 0.07, wig = (r() - 0.5) * 0.02, lay = (j % 2) * 0.004 + r() * 0.002;
      var pts = spine.map(function (q, k) { var t = k / (spine.length - 1), wd = widths[Math.min(widths.length - 1, Math.round(t * (widths.length - 1)))]; return [q[0] + f * wd + wig * Math.sin(t * 9 + j), q[1] + lay * (1 - t * 0.6), q[2] - lay]; });
      var cut = Math.max(2, Math.round(pts.length * len)); pts = pts.slice(0, cut);
      strip(M, pts, pts.map(function (q, k) { var t = k / (pts.length - 1); return (widths[Math.min(widths.length - 1, Math.round(t * (widths.length - 1)))] / N) * 2.2; }), 0.004, [0, 1, -0.4], 36, white, function (u, v) { return 1 - smooth(0.86, 1, v); }, 3);
    }
    this.longHair = this._mesh(this.pivot, M.build(), this.hmat); this.longHair.renderOrder = 2;
  };


  /* ---------- 小道具（檜扇・笏・数珠・文机・衾・抱いた幼子） ---------- */
  function fanTex(fem) {
    return ctex(fem ? 'hiougi' : 'kawahori', 256, 128, function (g, w, h) {
      var r = K.rng(fem ? 3 : 4), i;
      var gr = g.createLinearGradient(0, 0, 0, h);
      if (fem) { gr.addColorStop(0, '#f1e3b4'); gr.addColorStop(1, '#d9b96a'); } else { gr.addColorStop(0, '#f3ecdc'); gr.addColorStop(1, '#e2d6bb'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      if (fem) {   /* 金地に霞と松・桜の絵 */
        g.fillStyle = 'rgba(255,255,255,.55)'; for (i = 0; i < 5; i++) { g.beginPath(); g.ellipse(r() * w, 20 + r() * 50, 40, 7, 0, 0, PI * 2); g.fill(); }
        g.fillStyle = '#4c7a5a'; for (i = 0; i < 12; i++) { g.beginPath(); g.arc(r() * w, 70 + r() * 40, 5 + r() * 4, 0, PI * 2); g.fill(); }
        g.fillStyle = '#e9a3b4'; for (i = 0; i < 26; i++) { g.beginPath(); g.arc(r() * w, 40 + r() * 70, 2 + r() * 2, 0, PI * 2); g.fill(); }
      } else { g.strokeStyle = '#6b7f9a'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 90); g.bezierCurveTo(80, 40, 160, 110, 246, 50); g.stroke(); }
      g.fillStyle = 'rgba(80,60,30,.35)'; for (i = 0; i < w; i += 9) g.fillRect(i, 0, 1, h);   /* 檜の板の継ぎ目 */
    }, false);
  }
  function fanGeo(fem) {
    var M = new Mesher(), n = fem ? 26 : 16, W = 1.7;
    M.surf(n * 2, 3, function (u, v, o) {
      var a = -W / 2 + u * W, rr = 0.035 + v * 0.19, z = (Math.round(u * n * 2) % 2 ? 0.003 : -0.003) * v;
      o[0] = Math.sin(a) * rr; o[1] = Math.cos(a) * rr; o[2] = z;
    }, lin('#ffffff'), 1, 1);
    return M.build();
  }
  HFig.prototype._prop = function (name) {
    if (this.props[name]) return this.props[name];
    var self = this, grp = new T.Group(), parent = this.pivot, c = this.cols, L = this.fem ? 0.36 : 0.39, M, m;
    if (name === 'fan') {
      parent = this.armR;
      m = new T.Mesh(fanGeo(this.fem), new T.MeshStandardMaterial({ map: fanTex(this.fem), roughness: 0.5, metalness: this.fem ? 0.15 : 0, side: T.DoubleSide }));
      m.material.map.encoding = T.sRGBEncoding;
      m.position.set(0.0, -L - 0.02, 0.06); m.rotation.set(-PI / 2 + 0.25, 0, 0); grp.add(m);
      if (this.fem) {   /* 飾り糸（色糸を長く垂らす） */
        var cm = new Mesher();
        ['#b5432e', '#e9c46a', '#7f9bd0', '#5f8f78', '#f3eadb', '#9a7fc0'].forEach(function (hx, i) {
          strip(cm, [[-0.15 + i * 0.004, -L + 0.02, 0.1], [-0.17 + i * 0.006, -L - 0.08, 0.12], [-0.18 + i * 0.008, -L - 0.26, 0.1]], [0.006, 0.006, 0.006], 0.001, [0, 0, 1], 8, lin(hx));
        });
        grp.add(new T.Mesh(cm.build(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: T.DoubleSide })));
      }
    } else if (name === 'shaku') {
      parent = this.upper;   /* 笏：胸の前に立てて持つ */
      m = new T.Mesh(new T.BoxGeometry(0.05, 0.3, 0.008), new T.MeshStandardMaterial({ color: lin('#e3d3ad'), roughness: 0.6 })); m.position.set(0, 0.2, 0.2); m.rotation.x = -0.18; grp.add(m);
    } else if (name === 'juzu') {
      parent = this.armR; M = new Mesher();
      for (var i = 0; i < 36; i++) { var a = i / 36 * PI * 2, sg = new T.SphereGeometry(0.008, 6, 4); sg.translate(Math.cos(a) * 0.06, -L - 0.06 + Math.sin(a) * 0.09, 0.05); addGeo(M, sg, lin(i % 9 ? '#4a2f22' : '#c9a44a')); sg.dispose(); }
      grp.add(new T.Mesh(M.build(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 })));
    } else if (name === 'desk') {
      var lq = new T.MeshStandardMaterial({ color: lin('#1d1512'), roughness: 0.32 });
      var top = new T.Mesh(new T.BoxGeometry(0.62, 0.025, 0.3), lq); top.position.set(0, 0.24, 0.55); grp.add(top);
      [-1, 1].forEach(function (s) { var lg = new T.Mesh(new T.BoxGeometry(0.03, 0.23, 0.24), lq); lg.position.set(s * 0.27, 0.115, 0.55); grp.add(lg); });
      var pap = new T.Mesh(new T.BoxGeometry(0.34, 0.004, 0.22), new T.MeshStandardMaterial({ color: lin('#f4eede'), roughness: 0.9 })); pap.position.set(0.04, 0.255, 0.56); pap.rotation.y = 0.1; grp.add(pap);
      var ink = new T.Mesh(new T.BoxGeometry(0.07, 0.02, 0.1), new T.MeshStandardMaterial({ color: lin('#26201c'), roughness: 0.4 })); ink.position.set(-0.23, 0.26, 0.52); grp.add(ink);
      var br = new T.Mesh(new T.CylinderGeometry(0.004, 0.003, 0.18, 6), new T.MeshStandardMaterial({ color: lin('#3b2a1c') })); br.position.set(0, -L - 0.03, 0.06); br.rotation.x = 1.0; this.armR.add(br); grp.userData.extra = br;
    } else if (name === 'fusuma') {
      M = new Mesher();
      c.slice(0, 3).forEach(function (hx, i) {
        var col = lin(hx);
        M.surf(28, 10, function (u, v, o) {
          var th = u * PI * 2, ph = v * PI * 0.5, rx = 0.44 + i * 0.05, rz = 0.86 + i * 0.05, ry = 0.22 - i * 0.03;
          var fold = 0.012 * Math.sin(th * 9 + v * 4) * (1 - v);
          o[0] = (rx + fold) * Math.sin(th) * Math.cos(ph); o[2] = 0.42 + (rz + fold) * Math.cos(th) * Math.cos(ph); o[1] = 0.02 - i * 0.004 + ry * Math.sin(ph);
        }, col, 6, 2, true, true);
      });
      grp.add(new T.Mesh(M.build(), this.mat));
      var pil = new T.Mesh(new T.BoxGeometry(0.3, 0.1, 0.14), new T.MeshStandardMaterial({ color: lin('#3a2a44'), roughness: 0.5 })); pil.position.set(0, 0.05, -0.62); grp.add(pil);
    } else if (name === 'chigo') {
      parent = this.upper;
      var cc = (G.chars.wakamiya && G.chars.wakamiya.look.colors) || ['#f6f0f8', '#e9c46a'];
      M = new Mesher();
      [cc[0], cc[1]].forEach(function (hx, i) {
        M.surf(20, 8, function (u, v, o) { var th = u * PI * 2, ph = (v - 0.5) * PI, rx = 0.2 - i * 0.01, ry = 0.09 - i * 0.012, rz = 0.1; o[0] = Math.sin(ph) * rx; o[1] = Math.cos(th) * Math.cos(ph) * ry; o[2] = Math.sin(th) * Math.cos(ph) * rz; }, lin(hx), 4, 2, true);
      });
      var bundle = new T.Mesh(M.build(), this.mat); bundle.position.set(0.02, 0.1, 0.22); bundle.rotation.z = 0.5; grp.add(bundle);
      var bh = buildHead({ role: 'female', tone: SKIN.child, child: 1.4, cheek: 0.3, lip: '#c05a5a', hair: 'bob' }, 'low');
      bh.g.scale.setScalar(0.58); bh.g.position.set(0.17, 0.2, 0.22); bh.g.rotation.set(-0.2, 0.9, 0.5); grp.add(bh.g);
    }
    parent.add(grp);
    grp.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return (this.props[name] = grp);
  };

  /* ---------- 姿勢・毎フレーム ---------- */
  var HANDPOSE = { fan: ['relax', 'fan'], write: ['rest', 'brush'], pray: ['reach', 'reach'], hold: ['hold', 'hold'] };
  HFig.prototype.setPose = function (name, instant) {
    var TAB = F.POSE_TABLE, P = TAB[name] || TAB.sit, k, self = this;
    this.pose = TAB[name] ? name : 'sit'; this.P = P;
    var wy = P.lie ? 0.15 : (P.st ? this.wStand : this.wSit);
    F.PKEYS.forEach(function (key) { self.tgt[key] = key === 'wy' ? wy : (P[key] || 0); if (instant || self.cur[key] == null) self.cur[key] = self.tgt[key]; });
    var st = this._lower(!!P.st);
    for (k in this.lowers) this.lowers[k].visible = !P.lie && this.lowers[k] === st;
    /* 袖：姿勢で袂の垂れる向きが変わるので作り直す（同じ形なら使い回す） */
    var skey = Math.round(((P.lean || 0) + (P.lf || 0)) * 5) + '|' + Math.round(((P.lean || 0) + (P.rf || 0)) * 5);
    if (skey !== this.sleeveKey) {
      this.sleeveKey = skey;
      [this.sleeveL, this.sleeveR].forEach(function (m) { if (m) { m.geometry.dispose(); m.parent.remove(m); } });
      this.sleeveL = this._mesh(this.armL, this._sleeve(1, P)); this.sleeveR = this._mesh(this.armR, this._sleeve(-1, P));
    }
    this._longHair(P);
    for (k in this.props) { this.props[k].visible = false; if (this.props[k].userData.extra) this.props[k].userData.extra.visible = false; }
    if (P.prop) { var pr = this._prop(P.prop); pr.visible = true; if (pr.userData.extra) pr.userData.extra.visible = true; }
    if (this.kd.shaku && (name === 'stand' || name === 'sit')) this._prop('shaku').visible = true;
    /* 手：女は袖の内に隠す。持つもののある姿勢と、男は見せる */
    var hp = HANDPOSE[name] || null;
    if (this.hand) for (k in this.hand) this.hand[k].visible = false;
    if (hp && root.GJ3_HD_ASSETS.hands) { var hl = hp[0] && this._hand(1, hp[0]), hr = hp[1] && this._hand(-1, hp[1]); if (hl) hl.visible = true; if (hr) hr.visible = true; }
    this.armL.visible = this.armR.visible = true;
    this.height = (wy + this.dim.H + 0.25) * this.scale;
  };
  HFig.prototype.speak = function (on) { this.spkT = on ? 1 : 0; };
  HFig.prototype.update = function (dt, t) {
    var c = this.cur, g = this.tgt, k = 1 - Math.exp(-dt * 6), i, key, P = this.P, ph = this.ph, PK = F.PKEYS;
    for (i = 0; i < PK.length; i++) { key = PK[i]; c[key] += (g[key] - c[key]) * k; }
    this.spk += (this.spkT - this.spk) * (1 - Math.exp(-dt * 5));
    var br = Math.sin(t * 1.5 + ph), sw = Math.sin(t * 1.05 + ph * 1.7) * 0.012, bob = 0, lean = c.lean, rz = 0, hp = c.hp - this.spk * 0.05;
    if (P.anim === 'run') { bob = Math.abs(Math.sin(t * 9 + ph)) * 0.05; lean += Math.sin(t * 9 + ph) * 0.04; sw = Math.sin(t * 9 + ph) * 0.3; }
    if (P.anim === 'weep') { rz = Math.sin(t * 13) * 0.008 * (0.5 + 0.5 * Math.sin(t * 0.9)); hp += Math.sin(t * 1.3) * 0.03; }
    this.pivot.position.y = bob;
    this.upper.position.y = c.wy; this.upper.rotation.set(lean + br * 0.006, c.yaw, rz);
    this.headG.rotation.set(hp + br * 0.006, c.hy + Math.sin(t * 0.4 + ph) * 0.03 * (1 - this.spk) + this.spk * Math.sin(t * 1.7) * 0.04, Math.sin(t * 0.31 + ph) * 0.015);
    this.armL.rotation.set(-c.lf - sw, 0, c.ls + br * 0.008);
    this.armR.rotation.set(-c.rf + sw, 0, -c.rs - br * 0.008);
    /* まばたき */
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2.5 + ((t * 7.3 + ph) % 3); }
    this.blink = Math.max(0, this.blink - dt * 7);
    var open = this.fem ? -0.04 : -0.24, shut = 0.62, b = this.blink > 0 ? Math.sin(this.blink * PI) : 0;
    var low = P.anim === 'weep' || this.pose === 'bow' ? 0.25 : 0;
    var h = this.head; if (h) {
      for (i = 0; i < h.lids.length; i++) h.lids[i].rotation.x = open + low + (shut - open - low) * b;
      /* 口：話し手だけ、音節ほどの速さで小さく開け閉め */
      var jw = this.spk > 0.05 ? this.spk * Math.max(0, Math.sin(t * 13 + Math.sin(t * 3.1) * 2)) * (0.6 + 0.4 * Math.sin(t * 2.3)) : 0;
      h.jaw.value = jw;
    }
    var e = this.spk * 0.06; this.mat.emissive.setRGB(e, e * 0.9, e * 0.62);
  };
  HFig.prototype.headWorld = function (v) { v.set(0, this.headO.y, this.headO.z); return this.headG.localToWorld(v); };
  HFig.prototype.dispose = function () {
    this.root.traverse(function (o) {
      if (o.geometry && !o.geometry._gjShared) o.geometry.dispose();
      var m = o.material; if (m && !m._gjShared && m.dispose) { if (Array.isArray(m)) m.forEach(function (x) { if (!x._gjShared) x.dispose(); }); else m.dispose(); }
    });
    if (this.root.parent) this.root.parent.remove(this.root);
  };

  /* ---------- 手（koumon-hands.js と同じ形式。手首が原点、+Y が指先、+Z が手の甲、親指が -X） ---------- */
  var HANDC = {};
  function values16(enc, signed) { var raw = bytes(enc), dv = new DataView(raw.buffer), out = signed ? new Int16Array(raw.length / 2) : new Uint16Array(raw.length / 2); for (var i = 0; i < out.length; i++) out[i] = signed ? dv.getInt16(i * 2, true) : dv.getUint16(i * 2, true); return out; }
  function buildHand(pose, side, P, q) {
    var A = root.GJ3_HD_ASSETS && root.GJ3_HD_ASSETS.hands; if (!A) return null;
    var d = A.lod[q === 'high' ? 'high' : 'low']; if (!d.poses[pose]) pose = 'relax';
    var key = pose + side + q + P.skin;
    if (!HANDC[key]) {
      var src = values16(d.poses[pose], true), pos = new Float32Array(src.length), idx = values16(d.indices, false), i;
      for (i = 0; i < src.length; i++) pos[i] = src[i] / A.scale * (side === 'L' && i % 3 === 0 ? -1 : 1);
      if (side === 'L') for (i = 0; i < idx.length; i += 3) { var sw = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = sw; }
      var marks = bytes(d.marks), col = new Float32Array(marks.length), sk = lin('#' + new T.Color(P.skin).getHexString()), rd = lin('#' + new T.Color(P.skinRed).getHexString()), li = lin('#' + new T.Color(P.skinLight).getHexString()), tmp = new T.Color(), nail = sk.clone().lerp(li, 0.3);
      for (i = 0; i < marks.length; i += 3) {
        if (marks[i + 2]) tmp.copy(nail); else { tmp.copy(sk).lerp(li, marks[i] / 255).lerp(rd, marks[i + 1] / 255 * 0.6); }
        col[i] = tmp.r; col[i + 1] = tmp.g; col[i + 2] = tmp.b;
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.setIndex(new T.BufferAttribute(idx, 1)); g.computeVertexNormals(); g._gjShared = true; HANDC[key] = g;
    }
    var m = new T.Mesh(HANDC[key], handMat()); m.castShadow = true; return m;
  }
  var HM = null;
  function handMat() { if (!HM) { HM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }); HM._gjShared = true; } return HM; }

  H.make = function (id, opts) { return new HFig(id, opts || {}); };

  H._Mesher = Mesher; H._HFig = HFig;

  H._buildHead = buildHead;
  H._tex = { hair: hairTex, silk: silkTex, silkBump: silkBump };
})(typeof window !== 'undefined' ? window : globalThis);
