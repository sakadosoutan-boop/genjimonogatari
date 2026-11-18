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
  function decodeAttr(encoded, count, position, encoding, comps) {
    var raw = bytes(encoded), size = position ? 2 : 1, nc = comps || 3;
    if (!encoding) return raw;
    var res = new Uint8Array(count * size), view = new DataView(res.buffer), prev = [0, 0, 0], off = 0, w = 0, mask = position ? 65535 : 255;
    function num() { var v = 0, sh = 0, b; do { b = raw[off++]; v |= (b & 127) << sh; sh += 7; } while (b & 128); return v; }
    function put(d) { var ax = w % nc, v = (prev[ax] + d) & mask; prev[ax] = v; if (position) view.setUint16(w * 2, v, true); else res[w] = v; w++; }
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
    var idx = decodeIdx(A.indices[d.i], d.t * 3, A.indexEncoding, d.v), uv = null;
    if (d.uv) { var uq = decodeAttr(A.uvs[d.uv], d.v * 2, true, 'delta-rle-v1', 2), uvv = new DataView(uq.buffer); uv = new Float32Array(d.v * 2); for (i = 0; i < uv.length; i++) uv[i] = uvv.getUint16(i * 2, true) / 65535; }
    var dn = null;   /* 表情（微笑み）なしへの差（モーフ） */
    if (d.dn) { var dq = decodeAttr(d.dn, d.v * 3, true, 'delta-rle-v1'), dvv = new DataView(dq.buffer); dn = new Float32Array(d.v * 3); for (i = 0; i < dn.length; i++) dn[i] = dvv.getInt16(i * 2, true) * A.quantization; }
    return (RAW[key] = { pos: pos, col: col, idx: idx, v: d.v, uv: uv, dn: dn });
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
        x = r() * w; var l = 0.3 + r() * 0.7, c = (80 + r() * 90) | 0;
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
        /* 有職文様：菱の格子と、菱の中の小さな花菱（四弁）。白っぽく浮く織りの文様として、ごく控えめに */
        var cx2 = ((x % 64) + 64) % 64 - 32, cy2 = ((y % 64) + 64) % 64 - 32, pr = Math.abs(cx2) + Math.abs(cy2);
        var petal = pr < 9 && (Math.abs(cx2) < 2.5 || Math.abs(cy2) < 2.5) ? 1 : 0, kk = pr > 3 && pr < 9 && Math.abs(Math.abs(cx2) - Math.abs(cy2)) < 2.2 ? 1 : 0;
        var hishi = dia > 28 && dia < 32 ? -11 : 0, flower = (petal || kk) ? 9 : 0, n = (r() - 0.5) * 6, v = 236 + weave + hishi + flower + n;
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

  /* ---------- 平安の女性・子どもの頭（tools/build-heian-heads.py：可愛く脚色した CC0 の頭。UV と肌のテクスチャつき） ---------- */
  function isHeian(role) { var A = root.GJ3_HD_ASSETS; return !!(A && A.heads && A.heads[role] && A.heads[role].from === 'heian'); }
  function femRole(role) { return role === 'female' || isHeian(role); }
  /* 継ぎ目（UV の境）で分かれた頂点の法線を、同じ位置どうしでそろえる（陰に筋が出ないように） */
  function weldNormals(g) {
    var p = g.attributes.position.array, I = g.index.array, n = p.length / 3, gid = new Int32Array(n), map = {}, i, k, ng = 0;
    for (i = 0; i < n; i++) { k = Math.round(p[i * 3] * 2e5) + ',' + Math.round(p[i * 3 + 1] * 2e5) + ',' + Math.round(p[i * 3 + 2] * 2e5); if (map[k] == null) map[k] = ng++; gid[i] = map[k]; }
    var acc = new Float32Array(ng * 3);
    for (i = 0; i < I.length; i += 3) {
      var a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (k = 0; k < 3; k++) { var q = gid[I[i + k]] * 3; acc[q] += nx; acc[q + 1] += ny; acc[q + 2] += nz; }
    }
    var nn = new Float32Array(n * 3);
    for (i = 0; i < n; i++) { var q2 = gid[i] * 3, l = Math.sqrt(acc[q2] * acc[q2] + acc[q2 + 1] * acc[q2 + 1] + acc[q2 + 2] * acc[q2 + 2]) || 1; nn[i * 3] = acc[q2] / l; nn[i * 3 + 1] = acc[q2 + 1] / l; nn[i * 3 + 2] = acc[q2 + 2] / l; }
    g.setAttribute('normal', new T.BufferAttribute(nn, 3));
  }
  /* 人ごとの少しの違い（顔の幅 w・目の大きさ e・あごの長さ c）と、幼子（若宮）をさらに幼く（extra） */
  function heianShape(A, pos, n, sh, extra) {
    var e0 = A.anchors.eyes[0], ey = e0.center[1], ex = Math.abs(e0.center[0]), ez = e0.center[2], my = A.anchors.mouth[1], i;
    for (i = 0; i < n; i++) {
      var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (extra) {   /* 眉より下の顔を小さく、額は大きいまま */
        var cy = ey + 0.016, w0 = smooth(cy + 0.04, cy - 0.035, y) * smooth(-0.06, 0.01, z) * smooth(-0.112, -0.08, y), k0 = 1 - 0.1 * extra * w0;
        x *= k0; y = cy + (y - cy) * k0; z = -0.005 + (z + 0.005) * (1 - 0.05 * extra * w0);
      }
      if (sh) {
        var wf = smooth(ey + 0.012, ey - 0.03, y) * smooth(-0.03, 0.02, z);
        x *= 1 + ((sh.w || 1) - 1) * wf;
        if (sh.e && sh.e !== 1) {
          var sx = x < 0 ? -1 : 1, dx = x - sx * ex, dy = y - ey, we = Math.exp(-(dx * dx / 2.2e-4 + dy * dy / 1.6e-4)) * smooth(ez - 0.025, ez - 0.006, z);
          x = sx * ex + dx * (1 + (sh.e - 1) * we); y = ey + dy * (1 + (sh.e - 1) * we);
        }
        if (sh.c && sh.c !== 1) { var wc = smooth(my, my - 0.035, y) * smooth(-0.02, 0.03, z) * smooth(-0.112, -0.095, y); y = my + (y - my) * (1 + (sh.c - 1) * wc); }
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
  }
  function heianGeo(role, q, look) {
    var sh = look.shape, extra = look.extra || 0;
    var key = ['H', role, q, extra, sh ? [sh.w, sh.e, sh.c].join(',') : ''].join('|');
    if (GEO[key]) return GEO[key];
    var R = rawPart(role, q, 'skin'), n = R.v, pos = new Float32Array(R.pos), A = root.GJ3_HD_ASSETS.heads[role];
    if (sh || extra) heianShape(A, pos, n, sh, extra);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(R.uv, 2));
    g.setIndex(new T.BufferAttribute(R.idx, 1));
    weldNormals(g); g.computeBoundingSphere(); g._gjShared = true;
    if (R.dn) { g.morphAttributes.position = [new T.BufferAttribute(R.dn, 3)]; g.morphTargetsRelative = true; }
    return (GEO[key] = g);
  }
  /* 頭の表面の半径（縦の軸 x=0, z=-0.01 のまわり）を、高さと向きで引く表。髪の房を頭・耳の外へ沿わせるのに使う */
  function surfTable(geo) {
    if (geo._surf) return geo._surf;
    var P = geo.attributes.position.array, NY = 50, NA = 48, y0 = -0.12, y1 = 0.13, tab = new Float32Array(NY * NA), i, j;
    for (i = 0; i < P.length; i += 3) {
      var x = P[i], y = P[i + 1], z = P[i + 2] + 0.01, r = Math.sqrt(x * x + z * z), a = Math.atan2(x, z);
      var iy = Math.round((y - y0) / (y1 - y0) * (NY - 1)), ia = ((Math.round(a / (2 * PI) * NA) % NA) + NA) % NA;
      if (iy >= 0 && iy < NY && r > tab[iy * NA + ia]) tab[iy * NA + ia] = r;
    }
    for (var pass = 0; pass < 4; pass++) {   /* 空いた升を近所で埋める */
      var t2 = tab.slice();
      for (j = 0; j < NY; j++) for (i = 0; i < NA; i++) if (!tab[j * NA + i]) {
        var m = 0; [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) { var jj = j + d[0], ii = (i + d[1] + NA) % NA; if (jj >= 0 && jj < NY) m = Math.max(m, tab[jj * NA + ii]); });
        t2[j * NA + i] = m;
      }
      tab = t2;
    }
    var f = function (y, a) {
      var fy = K.clamp((y - y0) / (y1 - y0) * (NY - 1), 0, NY - 1.001), fa = ((a / (2 * PI) * NA) % NA + NA) % NA;
      var jy = Math.floor(fy), ja = Math.floor(fa), ty = fy - jy, ta = fa - ja, jb = (ja + 1) % NA, r0, r1;
      r0 = tab[jy * NA + ja] * (1 - ta) + tab[jy * NA + jb] * ta; r1 = tab[(jy + 1) * NA + ja] * (1 - ta) + tab[(jy + 1) * NA + jb] * ta;
      return r0 * (1 - ty) + r1 * ty;
    };
    return (geo._surf = f);
  }
  var HTEX = {};
  function dataTex(key, uri, rep) {
    if (HTEX[key]) return HTEX[key];
    var t = new T.TextureLoader().load(uri); t.encoding = T.sRGBEncoding; t.anisotropy = 4; t._gjShared = true;
    if (rep) t.wrapS = T.RepeatWrapping;
    return (HTEX[key] = t);
  }
  function headTex(role, q) { return dataTex(role + '|' + q, root.GJ3_HD_ASSETS.heads[role].tex[q]); }

  /* 肌の材質：口（あご）を少し動かす uniform を差し込む。my は口の合わせ目の高さ */
  function skinMat(rough, my, tex) {
    var m = new T.MeshStandardMaterial({ vertexColors: !tex, map: tex || null, roughness: rough || 0.55, metalness: 0 });
    if (tex) m.morphTargets = true;
    var hq = !!K.HQ;
    var u = m.userData.jaw = { value: 0 }, um = { value: my == null ? -0.0435 : my };
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uJaw = u; sh.uniforms.uMY = um;
      if (tex) {
        /* 肌：やわらかな暖かい補助光（影側が灰色・黄ばみに沈まない）と、輪郭のほのかな透け（皮膚の下の赤み）。
           白塗りにはせず、陰影は残す */
        sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>',
          '#include <aomap_fragment>\n  { float facing = saturate(dot(normal, normalize(vViewPosition)));\n    float rimF = pow(1.0 - facing, 2.2);\n' +
          (hq ? '    reflectedLight.indirectDiffuse += diffuseColor.rgb * (0.15 + 0.30 * rimF) * vec3(1.0, 0.84, 0.74);\n    reflectedLight.directDiffuse *= vec3(1.0, 0.985, 0.965); }'
              /* 低画質はトーンマッピングなし・環境光が強く白っぽくなるので、暖かい桃色へ寄せて少し沈める */
              : '    reflectedLight.indirectDiffuse *= vec3(0.93, 0.84, 0.77);\n    reflectedLight.directDiffuse *= vec3(0.98, 0.92, 0.86);\n    reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.18 * rimF * vec3(1.0, 0.8, 0.7); }'));
      }
      sh.vertexShader = 'uniform float uJaw;\nuniform float uMY;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  float jw = smoothstep(uMY + 0.0035, uMY - 0.0035, position.y) * (1.0 - smoothstep(0.018, 0.04, abs(position.x))) * smoothstep(0.035, 0.07, position.z);\n  jw *= 1.0 - smoothstep(uMY - 0.0365, uMY - 0.0665, position.y);\n  transformed.y -= uJaw * jw * 0.0045;\n  transformed.z -= uJaw * jw * 0.0012;');
    };
    m.customProgramCacheKey = function () { return tex ? (hq ? 'gj3skinT' : 'gj3skinTL') : 'gj3skin'; };
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
  /* まつ毛：上まぶたのふちの点（anchors.eyes[].lash）から、外へ・上へ反る帯。まぶた（半球）の座標に置き、瞬きで一緒に下りる */
  function lashGeo(e, open, k) {
    var c = e.center, pts = e.lash, n = pts.length, pos = [], uv = [], idx = [], ca = Math.cos(-open), sa = Math.sin(-open), i;
    function put(x, y, z) { pos.push(x, y * ca - z * sa, y * sa + z * ca); }
    for (i = 0; i < n; i++) {
      var t = i / (n - 1), p = pts[i], ox = p[0] - c[0], oy = p[1] - c[1], oz = p[2] - c[2], l = Math.sqrt(ox * ox + oy * oy) || 1;
      var ln = (0.0012 + 0.0026 * Math.pow(t, 1.2)) * k, dx = ox / l * 0.55, dy = oy / l * 0.55 + 0.5, dz = 0.55, dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= dl; dy /= dl; dz /= dl;
      put(ox, oy, oz + 0.0002); put(ox + dx * ln, oy + dy * ln + ln * 0.35, oz + 0.0002 + dz * ln);
      uv.push(t * 3, 0, t * 3, 1);
      if (i < n - 1) idx.push(2 * i, 2 * i + 2, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 1);
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /* 虹彩：同心の輪で眼球の球面に沿わせ、角膜のふくらみぶん少し前へ（平らな三角形が白目に沈まないように） */
  function irisGeoH(R, ir) {
    var k = 'h' + R + '|' + ir; if (EYEG[k]) return EYEG[k];
    var nr = 5, ns = 24, pos = [0, 0, R + 0.00035], uv = [0.5, 0.5], idx = [], i, j;
    for (j = 1; j <= nr; j++) for (i = 0; i < ns; i++) {
      var r = ir * j / nr, a = i / ns * PI * 2, x = r * Math.cos(a), y = r * Math.sin(a), f = r / ir;
      pos.push(x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y)) + 0.0001 + 0.00025 * (1 - f * f)); uv.push(0.5 + 0.5 * x / ir, 0.5 + 0.5 * y / ir);
    }
    for (i = 0; i < ns; i++) idx.push(0, 1 + i, 1 + (i + 1) % ns);
    for (j = 0; j < nr - 1; j++) for (i = 0; i < ns; i++) { var a0 = 1 + j * ns + i, b0 = 1 + j * ns + (i + 1) % ns; idx.push(a0, a0 + ns, b0 + ns, a0, b0 + ns, b0); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); g._gjShared = true; return (EYEG[k] = g);
  }
  /* キャッチライト：瞳の右上に小さな光（照明によらず見える。まぶたの半球より内なので、まばたきでは隠れる） */
  var CATCHM = null;
  function catchGeo(R, ir, two) {
    var k = 'c' + R + '|' + ir + (two ? 'b' : ''); if (EYEG[k]) return EYEG[k];
    var g = new T.CircleGeometry(ir * (two ? 0.085 : 0.17), 12), p = g.attributes.position, cx = ir * (two ? -0.34 : 0.36), cy = ir * (two ? -0.36 : 0.4), i;
    for (i = 0; i < p.count; i++) { var x = p.getX(i) * 1.15 + cx, y = p.getY(i) + cy; p.setXYZ(i, x, y, Math.sqrt(Math.max(0, R * R - x * x - y * y)) + 0.00045); }
    g.computeVertexNormals(); g._gjShared = true; return (EYEG[k] = g);
  }
  var LASHM = null, IRISM = null;
  function makeEyesH(role, look, q) {
    var A = root.GJ3_HD_ASSETS, H = A.heads[role], grp = new T.Group(), lids = [];
    var white = new T.MeshStandardMaterial({ color: lin('#d8d0c8'), roughness: 0.3 });
    if (!IRISM) { IRISM = new T.MeshStandardMaterial({ map: dataTex('iris', A.tex.iris), roughness: 0.28 }); IRISM._gjShared = true; }
    if (!LASHM) { LASHM = new T.MeshStandardMaterial({ map: dataTex('lash', A.tex.lash, true), roughness: 0.7, alphaTest: 0.35, side: T.DoubleSide }); LASHM._gjShared = true; }
    var lidM = new T.MeshStandardMaterial({ color: lin(H.anchors.lid || look.tone), roughness: 0.6 });
    var seg = q === 'low' ? 16 : 28, es = (look.shape && look.shape.e) || 1, geo = heianGeo(role, q, look), gp = geo.attributes.position.array, gu = geo.attributes.uv.array;
    H.anchors.eyes.forEach(function (e0) {
      /* 人ごとの違い・幼子の変形（heianShape）を、眼球の中心と大きさにも同じようにかける */
      var e = e0;
      if (look.shape || look.extra) {
        var q3 = new Float32Array([e0.center[0], e0.center[1], e0.center[2], e0.center[0] + e0.radius, e0.center[1], e0.center[2], e0.center[0], e0.center[1] + e0.radius, e0.center[2]]);
        heianShape(H, q3, 3, look.shape, look.extra || 0);
        var sc3 = (Math.hypot(q3[3] - q3[0], q3[4] - q3[1], q3[5] - q3[2]) + Math.hypot(q3[6] - q3[0], q3[7] - q3[1], q3[8] - q3[2])) / 2 / e0.radius;
        e = { center: [q3[0], q3[1], q3[2]], radius: e0.radius, open: e0.open, lash: e0.lash, s: sc3 };
      }
      var eg = new T.Group(); eg.position.fromArray(e.center); eg.scale.setScalar(e.s || 1);
      /* まぶたの半球・眼球が、この網目のまぶたの皮膚を突き抜けないよう、要るだけ奥へ下げる（粗い網目は皮膚が目に近い） */
      var c = e.center, rho = e.radius * 1.03 * (e.s || 1) + 0.00015, back = 0, i, k, cand = [];
      for (i = 0; i < gp.length / 3; i++) {
        if (gu[i * 2] > 0.774 && gu[i * 2 + 1] < 0.35) continue;   /* 眼窩の内側（見えない面）は除く */
        var dx = gp[i * 3] - c[0], dy = gp[i * 3 + 1] - c[1];
        if (dx * dx + dy * dy <= 4e-4 && gp[i * 3 + 2] > c[2] - 0.004) cand.push(dx * dx + dy * dy, gp[i * 3 + 2]);
      }
      for (k = 0; k <= 30; k++) {
        var cz = c[2] - k * 0.0001, bad = false;
        for (i = 0; i < cand.length && !bad; i += 2) { var dz = cand[i + 1] - cz; if (dz >= 0 && cand[i] + dz * dz < rho * rho) bad = true; }
        back = k * 0.0001; if (!bad) break;
      }
      eg.position.z -= back;
      var R = e.radius;
      eg.add(new T.Mesh(new T.SphereGeometry(R, seg, seg * 0.7 | 0), white));
      eg.add(new T.Mesh(irisGeoH(R, R * (H.anchors.iris || 0.5)), IRISM));
      if (!CATCHM) { CATCHM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false, fog: false }); CATCHM._gjShared = true; }
      var cm = new T.Mesh(catchGeo(R, R * (H.anchors.iris || 0.5)), CATCHM); cm.renderOrder = 3; eg.add(cm);
      var cm2 = new T.Mesh(catchGeo(R, R * (H.anchors.iris || 0.5), true), CATCHM); cm2.renderOrder = 3; eg.add(cm2);
      var lid = new T.Mesh(new T.SphereGeometry(R * 1.03, seg, 10, 0, PI * 2, 0, PI / 2), lidM);
      if (e0.lash && e0.lash.length > 2) lid.add(new T.Mesh(lashGeo(e0, e0.open, H.anchors.child ? 0.55 : 1), LASHM));
      eg.add(lid); lids.push(lid);
      grp.add(eg);
    });
    return { g: grp, lids: lids, mats: [white, lidM], open: H.anchors.eyes[0].open };
  }
  function makeEyes(role, look, skin, q) {
    if (isHeian(role)) return makeEyesH(role, look, q);
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
  function hairShellGeo(role, q, child, style, hlook) {
    var hk = hlook ? '|' + (hlook.extra || 0) + '|' + (hlook.shape ? [hlook.shape.w, hlook.shape.e, hlook.shape.c].join(',') : '') : '';
    var key = 'shell|' + role + '|' + q + '|' + (child || 0) + '|' + style + hk; if (GEO[key]) return GEO[key];
    var skin = hlook ? heianGeo(role, q, hlook) : headGeo(role, q, { tone: '#ffffff', child: child }), P = skin.attributes.position, N = skin.attributes.normal, I = skin.index.array, n = P.count, i;
    var male = style === 'male';
    function edge(x, y, z) {   /* 生え際からの距離（正＝髪の内側, m）。新しい頭は額の生え際を丸い弧に */
      var ax = Math.abs(x), front = smooth(-0.01, 0.05, z);
      var hy = male ? 0.074 + (z - 0.06) * 0.5 - ax * 0.12 : hlook ? 0.074 - 8.5 * ax * ax + Math.max(0, z - 0.06) * 0.4 : 0.07 - ax * 0.42 + Math.max(0, z - 0.06) * 0.6;
      var side = male ? 0.03 + Math.max(0, z - 0.02) * 0.6 : (style === 'bob' ? -0.02 : 0.028);
      var back = male ? -0.055 : -0.08;
      var lim = K.lerp(K.lerp(back, side, smooth(-0.06, -0.02, z)), Math.max(hy, side), front);
      return y - lim;
    }
    var al = new Float32Array(n), map = new Int32Array(n).fill(-1), pos = [], nor = [], uv = [], col = [], idx = [];
    for (i = 0; i < n; i++) al[i] = hlook ? smooth(-0.004, 0.009, edge(P.getX(i), P.getY(i), P.getZ(i))) : smooth(-0.002, 0.006, edge(P.getX(i), P.getY(i), P.getZ(i)));
    function vid(j) {
      if (map[j] >= 0) return map[j];
      var x = P.getX(j), y = P.getY(j), z = P.getZ(j), nx = N.getX(j), ny = N.getY(j), nz = N.getZ(j);
      var th = (male ? 0.0022 : 0.003) + (male ? 0.003 : 0.007) * smooth(-0.02, 0.1, y) * (1 - 0.6 * smooth(0.02, 0.08, z));
      if (!male && Math.abs(x) > 0.06 && y < 0.06) th += 0.006 * smooth(0.06, 0.08, Math.abs(x));
      th *= 0.4 + 0.6 * al[j];
      pos.push(x + nx * th, y + ny * th, z + nz * th); nor.push(nx, ny, nz);
      if (hlook) uv.push((z + 0.12) * 30, Math.atan2(Math.abs(x), y + 0.005) / PI * 3.2);   /* 新しい頭：中央の分け目から左右へ下りる流れ */
      else { var a = Math.atan2(x, z + 0.02); uv.push(a / PI * 4, (y + 0.1) * 6); }
      var ring = hlook ? 1 + 0.9 * Math.exp(-Math.pow((y - 0.085 + 0.25 * Math.max(0, -z - 0.02)) / 0.012, 2)) * smooth(-0.07, 0.02, z) : 1;
      col.push(ring, ring, ring, al[j]);
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
  /* 毛のほつれの透明度（縦に長い細い毛が、ところどころ途切れる。くり返して貼る） */
  function fuzzAlpha() {
    return ctex('fuzzA', 128, 256, function (g, w, h) {
      var im = g.createImageData(w, h), d = im.data, r = K.rng(41), x, y, segs = [];
      for (x = 0; x < w; x++) { var L = []; for (var k = 0; k < 3; k++) { var s0 = r(); L.push([s0, s0 + 0.18 + r() * 0.5]); } segs.push(L); }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var v = (y + 0.5) / h, on = 0, i = (y * w + x) * 4;
        segs[x].forEach(function (sg) { var vv = v < sg[0] ? v + 1 : v; if (vv >= sg[0] && vv <= sg[1]) on = 1; });
        var a = on ? 230 : 0; d[i] = d[i + 1] = d[i + 2] = a; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    });
  }
  var FUZZM = {};
  function fuzzMat(hex) {
    if (FUZZM[hex]) return FUZZM[hex];
    var m = new T.MeshStandardMaterial({ color: lin(hex), roughness: 0.42, metalness: 0, map: hairTex(), alphaMap: fuzzAlpha(), alphaTest: 0.5, side: T.DoubleSide, vertexColors: true });
    m._gjShared = true; return (FUZZM[hex] = m);
  }
  function fuzzShellGeo(base) {
    if (base._fuzz) return base._fuzz;
    var g = base.clone(), p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, i;
    for (i = 0; i < p.count; i++) {
      var k = 0.0016 * c.getW(i);
      p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
      c.setW(i, Math.min(1, c.getW(i) * 1.4));
    }
    g._gjShared = true; return (base._fuzz = g);
  }
  var HAIRM = {};
  function hairMat(hex, gloss) {
    var k = hex + gloss; if (HAIRM[k]) return HAIRM[k];
    var m = new T.MeshStandardMaterial({ color: lin(hex), roughness: gloss ? 0.4 : 0.5, metalness: 0.0, bumpMap: hairTex(), bumpScale: 0.0007, side: T.DoubleSide, map: hairTex(), vertexColors: true, transparent: true });
    m._gjShared = true;
    return (HAIRM[k] = m);
  }

  /* 房の透明度の画像：真ん中は詰まり、縁と毛先では細い毛が 1 本ずつ途切れる（帯が板に見えないように）。
     u＝房の幅（0..1）、v＝根元 0 → 毛先 1（画像の上が毛先） */
  function strandAlpha() {
    return ctex('strandA', 128, 256, function (g, w, h) {
      var im = g.createImageData(w, h), d = im.data, r = K.rng(31), endC = [], keep = [], x, y;
      for (x = 0; x < w; x++) { endC.push(0.72 + 0.28 * Math.pow(r(), 0.6)); keep.push(r()); }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var u = (x + 0.5) / w, v = 1 - (y + 0.5) / h, e = Math.min(u, 1 - u) * 2, i = (y * w + x) * 4;
        var on = v < endC[x] && keep[x] > 1 - Math.min(1, e * 2.2 + 0.15) ? 1 : 0;
        var a = on ? 255 * (1 - 0.35 * K.clamp((v - endC[x] + 0.12) / 0.12, 0, 1)) : 0;
        d[i] = d[i + 1] = d[i + 2] = a; d[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, false);
  }
  /* 房の色の画像：細い毛の筋に、根元寄り（頭頂の高さ）の艶の帯を重ねる。画像の上が毛先 */
  function lockTex() {
    return ctex('lockC', 128, 256, function (g, w, h) {
      var r = K.rng(23), i;
      g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
      for (i = 0; i < 260; i++) { var x = r() * w, c = (70 + r() * 90) | 0; g.strokeStyle = 'rgba(' + c + ',' + c + ',' + c + ',' + (0.3 + r() * 0.4) + ')'; g.lineWidth = 0.5 + r(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 3, h); g.stroke(); }
      var gr = g.createLinearGradient(0, h * 0.6, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,240,225,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, h * 0.6, w, h * 0.4);
    }, false);
  }
  var LOCKM = {};
  function lockMat(hex) {
    if (LOCKM[hex]) return LOCKM[hex];
    var m = hairMat(hex, true).clone(); m.map = lockTex(); m.map.encoding = T.sRGBEncoding; m.alphaMap = strandAlpha(); m.alphaTest = 0.4; m._gjShared = true;
    return (LOCKM[hex] = m);
  }

  /* 頭 1 つを組み立てる。look: { role, tone, paint, lip, child, hair, brow, beard } → { g, skin, lids, jaw, mouth } */
  function buildHead(look, q) {
    var role = look.role, A = root.GJ3_HD_ASSETS.heads[role], g = new T.Group(), mats = [], hz = isHeian(role), fem = femRole(role);
    var sm = hz ? skinMat(0.52, A.anchors.mouth[1], headTex(role, q)) : skinMat(look.paint === 'oshiroi' ? 0.5 : 0.58); mats.push(sm);
    var skin = new T.Mesh(hz ? heianGeo(role, q, look) : headGeo(role, q, look), sm); skin.castShadow = true; skin.receiveShadow = true; g.add(skin);
    var eyes = makeEyes(role, look, skin, q); g.add(eyes.g); mats = mats.concat(eyes.mats);
    /* 口の奥（口が開いたときに透けないよう） */
    var mo = new T.Mesh(K.G.sph(8, 6), new T.MeshBasicMaterial({ color: 0x2a0f12 })); mo.scale.set(0.012, 0.004, 0.006); mo.position.set(0, hz ? A.anchors.mouth[1] - 0.001 : role === 'female' ? -0.043 : -0.045, hz ? 0.072 : 0.066); g.add(mo); mats.push(mo.material);
    var hk = look.hair || (fem ? 'long' : 'male');
    if (hk !== 'shaved' && hk !== 'none') {
      var shell = new T.Mesh(hairShellGeo(role, q, hz ? 0 : look.child || 0, !fem ? 'male' : hk === 'ama' || hk === 'bob' ? 'bob' : 'long', hz ? look : null), hairMat(look.hairCol || '#120f14', fem));
      shell.castShadow = true; shell.renderOrder = 1; g.add(shell);
      if (hz && q === 'high' && hk !== 'shaved') {   /* 寄ったときだけ、外へ毛先がほつれる殻を 1 枚（粗い網目から作るので軽い） */
        var fz = new T.Mesh(fuzzShellGeo(hairShellGeo(role, 'low', 0, hk === 'ama' || hk === 'bob' ? 'bob' : 'long', look)), fuzzMat(look.hairCol || '#1d1512'));
        fz.renderOrder = 1; g.add(fz);
      }
    }
    if (!fem) {
      var brow = look.brow !== false && partGeo(role, q, 'brow', look.hairCol || '#211b1c');
      if (brow) g.add(new T.Mesh(brow, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
      var bd = look.beard && partGeo(role, q, 'beard', look.hairCol || '#231d1d');
      if (bd) { var bm = new T.Mesh(bd, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); g.add(bm); }
      if (hk === 'male') {   /* 髻（もとどり）：冠の巾子・烏帽子の中に収まる */
        var mk = new T.Mesh(K.G.sph(12, 10), hairMat(look.hairCol || '#17131a', false)); mk.scale.set(0.022, 0.03, 0.022); mk.position.set(0, 0.13, -0.035); g.add(mk);
      }
    }
    return { g: g, skin: skin, lids: eyes.lids, jaw: sm.userData.jaw, mats: mats, anchors: A.anchors, open: eyes.open };
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
    /* out が関数のときは、その点での外向き（頭の表面の法線）に帯を寝かせる（房が顔から突き出た板にならない） */
    var radial = typeof out === 'function', up = new T.Vector3(0, 1, 0), prev = new T.Vector3(1, 0, 0), ov = radial ? new T.Vector3() : new T.Vector3(out[0], out[1], out[2]), P = [], S = [], N = [], W = [], j;
    for (j = 0; j <= nv; j++) {
      var t = j / nv, p = curve.getPoint(t), tg = curve.getTangent(t), sd;
      if (radial) { var o0 = out(p); ov.set(o0[0], o0[1], o0[2]).normalize(); sd = new T.Vector3().crossVectors(tg, ov); if (sd.length() < 1e-4) sd.copy(prev); else sd.normalize(); }
      else { sd = new T.Vector3().crossVectors(up, tg); if (sd.length() < 0.3) sd.copy(prev); else sd.normalize(); }
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
  /* 新しい頭の役：若い女性 lady / 大人の女性 woman / 尼君 ama / 少女・子ども girl。人ごとの少しの違い（shape） */
  var HROLE = { haha: 'woman', shonagon: 'woman', myobu: 'woman', otona: 'woman', amagimi: 'ama' };
  var HSHAPE = { koui: { w: 0.975, e: 1.0, c: 1.0 }, fujitsubo: { w: 0.99, e: 1.03, c: 0.99 }, kokiden: { w: 1.025, e: 0.965, c: 1.03 }, murasaki: { w: 1.0, e: 1.03, c: 0.98 },
    haha: { w: 0.98, e: 0.98, c: 1.02 }, shonagon: { w: 1.03, e: 0.97, c: 1.0 }, inuki: { w: 1.02, e: 0.98, c: 0.97 } };
  function heianRole(id, kind) {
    if (!isHeian('lady')) return null;
    if (kind === 'shojo' || kind === 'warawa' || kind === 'chigo') return isHeian('girl') ? 'girl' : null;
    if (kind === 'ama') return isHeian('ama') ? 'ama' : 'lady';
    var r = HROLE[id]; return r && isHeian(r) ? r : 'lady';
  }
  function headLookOf(id, kind, fem) {
    var L = { role: roleOf(id, kind) };
    var hr = L.role === 'female' && heianRole(id, kind);
    if (hr) {
      L.role = hr; L.tone = '#' + root.GJ3_HD_ASSETS.heads[hr].skin;
      L.hair = kind === 'ama' ? 'ama' : hr === 'girl' ? 'bob' : 'long';
      L.extra = kind === 'chigo' ? 0.9 : 0;
      L.shape = HSHAPE[id] || null; L.hairCol = '#1d1512';
      return L;
    }
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
    this.fem = kd.fem && id !== 'ichinomiya';
    /* 女房装束・小袿：重ねの色目を 6 枚に（隣り合う色のあいだを補って匂のぼかしに）。袖口・襟・裾に細い段で見せる */
    this.nLay = this.fem ? Math.min(cols.length, kd.layers || 3) : 2;
    if (this.fem && (look.kind === 'juni' || look.kind === 'kouchiki') && cols.length >= 3) {
      var ex = [], cc = new T.Color();
      for (var ci = 0; ci < cols.length - 1 && ex.length < 6; ci++) { ex.push(cols[ci]); if (ex.length < 6 && ci < 2) { cc.set(cols[ci]).lerp(new T.Color(cols[ci + 1]), 0.5); ex.push('#' + cc.getHexString()); } }
      while (ex.length < 6) ex.push(cols[Math.min(cols.length - 1, ex.length)]);
      cols = ex.slice(0, 6); this.nLay = 6;
    }
    this.cols = cols;
    this.child = { shojo: 1, warawa: 1, chigo: 1 }[look.kind] ? 1 : 0;
    this.seed = (opts.seed || 0) + id.length * 1.7;
    this.q = 'high'; this.tier = opts.quality === 'low' ? 'low' : 'high';   /* low：人数・網目を控えめに（頭は寄ったときだけ細かく） */
    this.far = !!opts.far;
    this.scale = kd.sc * (opts.scale || 1);
    this.trail = look.kind === 'juni' || look.kind === 'kouchiki' ? 1 : look.kind === 'ama' ? 0.55 : id === 'mikado' ? 0.7 : 0.35;
    this.hairStyle = hairStyleOf(look.kind, id);
    this.headLook = headLookOf(id, look.kind, this.fem);
    if ((id === 'ichinomiya' || id === 'wakamiya') && !femRole(this.headLook.role)) { this.headLook.role = 'female'; }
    if (opts.variant && isHeian(this.headLook.role) && !this.headLook.shape) { var vv = opts.variant; this.headLook.shape = { w: 1 + 0.02 * Math.sin(vv * 2.3), e: 1 + 0.025 * Math.cos(vv * 1.7), c: 1 + 0.02 * Math.sin(vv * 3.1 + 1) }; }
    /* 材質：装束（頂点色×絹の地紋）・髪 */
    this.mat = new T.MeshStandardMaterial({ vertexColors: true, map: silkTex(), bumpMap: silkBump(), bumpScale: 0.0004, roughness: 0.74, metalness: 0, side: T.DoubleSide });
    this.mat.emissive = new T.Color(0, 0, 0);
    this.hmat = hairMat(this.fem || this.child ? '#120f14' : '#17131a', true);
    if (isHeian(this.headLook.role)) this.hmat = lockMat('#1d1512');
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
    var self = this, c = this.cols, n = this.fem ? this.nLay : 2, layers = [], i;
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
    var n = fem ? this.nLay : 2, L = fem ? 0.36 : 0.39, i;
    var layers = []; for (i = 0; i < n; i++) layers.push(fem ? c[i] : (i ? (this.kind === 'kariginu' ? c[1] : '#f4efe2') : c[0]));
    if (this.kind === 'sou' || this.kind === 'ama') layers = [c[0], '#f2eee6'];
    /* 重力の向きを腕の座標へ（姿勢の目標値で） */
    var lf = side > 0 ? P.lf || 0 : P.rf || 0, a = (P.lean || 0) + lf, gy = -Math.cos(a), gz = -Math.sin(a);   /* 腕の座標での「下」 */
    var bag = (fem ? 0.2 : 0.15) * (this.child ? 0.8 : 1);
    var hi = this.tier !== 'low' && !this.far, seed = this.seed;
    /* 袖の面の 1 点：th＝腕のまわりの角度、vv＝肩 0 → 袖口 1。ひだ（縦のたるみ）・袖口への広がり・波打つ袖口の縁・袂の垂れ */
    function pt(th, vv, shrink, len, off, o) {
      /* 肩口（vv<0）：表の衣を首の方へ少し延ばし、胴の肩の線となだらかにつなぐ（袖の付け根の段差を消す） */
      var cap = vv < 0 ? -vv / 0.12 : 0; vv = Math.max(0, vv);
      var rx = K.lerp(0.055, fem ? 0.094 : 0.082, smooth(0, 0.55, vv)) - shrink - 0.01 * cap, rz = K.lerp(0.068, fem ? 0.14 : 0.127, smooth(0, 0.65, vv)) - shrink - 0.004 * cap;
      var fl = 1 + 0.07 * smooth(0.8, 1, vv);
      var fold = (0.011 * Math.sin(th * 4 + seed + side + vv * 1.6) + 0.006 * Math.sin(th * 7 + seed * 2 - vv * 2.2) + 0.0028 * Math.sin(th * 13 + side * 3 + seed)) * smooth(0.12, 0.9, vv);
      var x = (rx * fl + fold + off) * Math.sin(th) - 0.04 * cap * cap, z = (rz * fl + fold + off) * Math.cos(th), y = -len * vv + 0.043 * cap;
      /* 袂：腕の下側（重力の側）に平たい袋になって垂れる。腕を下ろすと袖口の先へ伸びる */
      var dn = Math.max(0, -Math.cos(th)), sgz = Math.abs(gz), drop = bag * smooth(0.15, 1, vv) * Math.pow(dn, 0.6);
      var hem = (0.012 * Math.sin(th * 3 + seed) + 0.006 * Math.sin(th * 5 + side * 2)) * smooth(0.82, 1, vv);
      o[0] = x * (1 - 0.35 * drop / (bag + 1e-6) * sgz) * side; o[1] = y - drop * (1 - sgz) * 0.6 + hem; o[2] = z - drop * sgz * 1.1;
      return o;
    }
    layers.forEach(function (hex, li) {
      /* 重ねが多いとき（6 枚）は段を細く。内の衣は袖口の近くだけなので粗く */
      var many = n > 4, col = lin(hex), len = L + li * (many ? 0.0085 : 0.014), shrink = li * (many ? 0.0031 : 0.005), v0 = li ? (many ? 0.8 : 0.55) : (fem ? -0.12 : 0);
      M.surf(li ? (many ? 20 : 24) : (hi ? 30 : 28), li ? (many ? 2 : 6) : (hi ? 14 : 13), function (u, v, o) { pt(u * PI * 2, K.lerp(v0, 1, v), shrink, len, 0, o); }, col, 3, 2, true);
    });
    /* 狩衣：袖口の袖括（そでぐくり）の紐を縁に通す */
    if (this.kind === 'kariginu') {
      var cord = lin(c[1] || '#d8cfb0');
      M.surf(28, 3, function (u, v, o) {
        var th = u * PI * 2, a2 = v * PI * 2, r0 = 0.005;
        pt(th, 1, 0, L, r0 * Math.cos(a2), o); o[1] += 0.006 + r0 * Math.sin(a2);
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
    var nl = fem ? this.nLay : 1, many = nl > 4;
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
              var st = many ? 0.017 : 0.026, vv = 0.04 + v * 0.96, w = openW(vv), th = sd * (w - (i) * st + u * st);
              S(th, vv, -0.0015 * i, o);
            }, col, 1, 4);
          });
        })(i);
      }
    }
    /* 裾の重なり：内の衣ほど外へ少しずつはみ出す */
    for (i = 1; i < nl; i++) {
      (function (i) {
        var col = lin(c[i]), k = 1 + (many ? 0.026 : 0.04) * i, w = hak ? openW(1) - i * (many ? 0.017 : 0.026) : 0;
        M.surf(many ? 60 : 88, many ? 1 : 2, function (u, v, o) {
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
      var hz = isHeian(this.headLook.role) && this.heads.low;
      if (hz) this._locksH(M, hs, r, fadeEnd);
      /* 鬢（びん）・額髪：顔の両脇に下がる房。耳を隠し、肩の前へ */
      var sideLen = hs === 'long' ? -0.36 : hs === 'ama' ? -0.19 : hs === 'ougi' ? -0.22 : hs === 'mid' ? -0.2 : 0;
      if (sideLen && !hz) [-1, 1].forEach(function (sd) {
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
  /* 新しい頭の房。頭の表面の表（surfTable）で、房を頭・耳の外へ沿わせる。角度 a：0＝正面、±π/2＝耳
   *   鬢削ぎ（びんそぎ）：分け目から頬へかかる房。顔まわりを柔らかく縁どる（若い女性はあごの高さ、少女は頬まで）
   *   長い髪：耳の後ろから肩の後ろへ（重ねた細い房。毛先は細り、透ける） */
  HFig.prototype._locksH = function (M, hs, r, fadeEnd) {
    var geo = heianGeo(this.headLook.role, 'low', this.headLook), R = surfTable(geo), white = lin('#ffffff');
    function hp(a, y, off) { var rr = R(y, a) + off; return [Math.sin(a) * rr, y, Math.cos(a) * rr - 0.01]; }
    function outw(p) { return [p.x, 0, p.z + 0.01]; }
    var girl = this.headLook.role === 'girl', ama = hs === 'ama', A = root.GJ3_HD_ASSETS.heads[this.headLook.role], ey = A.anchors.eyes[0].center[1];
    if (girl && (hs === 'ougi' || hs === 'mid')) {
      /* 目刺し（めざし）：子どもの前髪を眉の高さで切りそろえる（平安の童の髪。肩で切る振分髪と合わせて）。
         根元は髪の殻の下に隠し、生え際から額に沿って下ろす。毛先は細い毛に分かれる */
      var nf = 9, endY = ey + 0.0215;
      for (var f = 0; f < nf; f++) {
        var a = (f / (nf - 1) - 0.5) * 1.3, rf = r(), e2 = endY - 0.002 * rf - 0.004 * Math.pow(Math.abs(a) / 0.65, 2);
        var pf = [hp(a * 0.55, 0.09, 0.003), hp(a * 0.85, 0.074, 0.0045), hp(a, (0.074 + e2) / 2, 0.004), hp(a * 1.02, e2, 0.0035)];
        strip(M, pf, [0.012, 0.021, 0.022, 0.02], 0.0015, outw, 10, white, fadeEnd(0.1), 3);
      }
    }
    [-1, 1].forEach(function (sd) {
      if (!girl && !ama) {
        /* こめかみの細い後れ毛（若い女性・大人の女性） */
        for (var t2 = 0; t2 < 2; t2++) {
          var a0 = sd * (0.8 + t2 * 0.08), rt = r();
          var pw = [hp(a0, 0.066, 0.0035), hp(a0 + sd * 0.12, 0.045, 0.0055), hp(a0 + sd * 0.18, 0.015 - rt * 0.006, 0.006), hp(a0 + sd * 0.16, -0.012 - rt * 0.01, 0.0055)];
          strip(M, pw, [0.004, 0.006, 0.005, 0.002], 0.0006, outw, 10, white, fadeEnd(0.35), 2);
        }
      }
      /* 鬢削ぎ：前の 2 房（頬の外の縁をおおい、毛先はあごの線へ内に寄る） */
      var cut = girl ? -0.045 : ama ? -0.03 : -0.07;
      [0, 1].forEach(function (j) {
        var da = j * 0.16, rr = r(), end = cut - j * 0.018 - rr * 0.008;
        var pts = [hp(sd * (0.3 + da * 0.5), 0.088, 0.001), hp(sd * (0.74 + da), 0.066, 0.0035), hp(sd * (1.0 + da), 0.035, 0.0045), hp(sd * (1.08 + da), 0.0, 0.005),
          hp(sd * (1.05 + da), (end + 0.0) * 0.5, 0.004), hp(sd * (0.98 + da), end, 0.0035)];
        var w = girl ? 0.02 : 0.022;
        strip(M, pts, [0.006, w * 0.8, w, w * 0.95, w * 0.7, w * 0.25], function (v) { return 0.0022 * (1 - v * 0.6); }, outw, 14, white, fadeEnd(0.16), 4);
      });
      if (hs === 'ama' || hs === 'ougi' || hs === 'mid') {
        /* 尼削ぎ（肩で切りそろえる）・少女の髪（肩で扇のように広がる）・童の髪：耳の後ろから肩へ */
        var len = hs === 'ama' ? -0.17 : hs === 'ougi' ? -0.2 : -0.19, spread = hs === 'ougi' ? 1.55 : 1.0;
        for (var j3 = 0; j3 < 3; j3++) {
          var a3 = sd * (1.22 + j3 * 0.2), r3 = r(), x3 = sd * (0.072 + j3 * 0.006), z3 = -0.004 - j3 * 0.026;
          var pts3 = [hp(a3, 0.062, 0.003), hp(a3 + sd * 0.05, 0.0, 0.0045), [x3, -0.07, z3], [x3 * (1 + 0.3 * (spread - 1)), (len - 0.07) / 2, z3 - 0.006], [x3 * spread, len - r3 * 0.02, z3 - 0.012]];
          strip(M, pts3, [0.012, 0.03, 0.034, 0.036 * spread, 0.042 * spread], 0.004, outw, 12, white, fadeEnd(hs === 'ama' ? 0.03 : 0.08), 3);
        }
      }
      if (hs !== 'long') return;
      /* 長い髪：耳の後ろから肩の後ろへ、細い房を重ねる */
      for (var j = 0; j < 4; j++) {
        var a0 = sd * (1.3 + j * 0.16), rr2 = r(), x1 = sd * (0.085 + j * 0.008 + rr2 * 0.006), z1 = -0.02 - j * 0.02;
        var p0 = hp(a0, 0.06, 0.003), p1 = hp(a0 + sd * 0.05, 0.0, 0.004);
        var pts2 = [p0, p1, [x1, -0.08, z1 + 0.006], [x1 * 1.12, -0.17, z1], [x1 * 1.16, -0.3 - rr2 * 0.04, z1 - 0.01]];
        strip(M, pts2, [0.012, 0.028, 0.03, 0.03, 0.012], 0.004, outw, 14, white, fadeEnd(0.15), 3);
      }
    });
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
    var hzL = isHeian(this.headLook.role);
    /* 新しい頭：肩で広がり、背の上の方でゆるく束ねて（元結）、そこから床へ広がる */
    var widths = P.lie ? [0.14, 0.26, 0.32, 0.3, 0.12] : hzL ? [0.14, 0.21, 0.2, 0.115, 0.125, 0.17, 0.22, 0.26, 0.29, 0.31, 0.3] : [0.14, 0.18, 0.22, 0.25, 0.28, 0.3, 0.32, 0.34, 0.34, 0.3];
    /* 下地の一枚（房のすき間から下の衣が透けないように） */
    strip(M, spine.map(function (q) { return [q[0], q[1] - 0.002, q[2] + 0.002]; }), widths.map(function (w) { return w * 0.92; }), 0.004, [0, 1, -0.4], 36, white, function (u, v) { return 1 - smooth(0.8, 0.97, v); }, 4);
    for (j = 0; j < N; j++) {
      var f = (j + 0.5) / N - 0.5, len = 0.93 + r() * 0.07, wig = (r() - 0.5) * 0.02, lay = (j % 2) * 0.004 + r() * 0.002;
      var pts = spine.map(function (q, k) { var t = k / (spine.length - 1), wd = widths[Math.min(widths.length - 1, Math.round(t * (widths.length - 1)))]; return [q[0] + f * wd + wig * Math.sin(t * 9 + j), q[1] + lay * (1 - t * 0.6), q[2] - lay]; });
      var cut = Math.max(2, Math.round(pts.length * len)); pts = pts.slice(0, cut);
      strip(M, pts, pts.map(function (q, k) { var t = k / (pts.length - 1); return (widths[Math.min(widths.length - 1, Math.round(t * (widths.length - 1)))] / N) * 2.2; }), 0.004, [0, 1, -0.4], 36, white, function (u, v) { return 1 - smooth(0.86, 1, v); }, 3);
    }
    this.longHair = this._mesh(this.pivot, M.build(), this.hmat); this.longHair.renderOrder = 2;
    if (this.motoyui) { this.motoyui.geometry.dispose(); this.pivot.remove(this.motoyui); this.motoyui = null; }
    if (hzL && !P.lie && spine.length > 4) {   /* 元結（もとゆい）：束ねたところに白い紙の紐 */
      var tt = 0.3 * (spine.length - 1), k0 = Math.floor(tt), fr = tt - k0, q0 = spine[k0], q1 = spine[Math.min(spine.length - 1, k0 + 1)];
      var c0 = new T.Vector3(K.lerp(q0[0], q1[0], fr), K.lerp(q0[1], q1[1], fr), K.lerp(q0[2], q1[2], fr)), dir = new T.Vector3(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]).normalize();
      var bg = new T.CylinderGeometry(1, 1, 0.014, 18, 1, true); bg.scale(0.068, 1, 0.016);
      var bm = new T.Mesh(bg, new T.MeshStandardMaterial({ color: lin('#f3eee4'), roughness: 0.8, side: T.DoubleSide }));
      bm.position.copy(c0); bm.position.z -= 0.006; bm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir); this.pivot.add(bm); this.motoyui = bm;
    }
  };


  /* ---------- 小道具（檜扇・笏・数珠・文机・衾・抱いた幼子） ---------- */
  function fanTex(fem) {
    return ctex(fem ? 'hiougi' : 'kawahori', 256, 128, function (g, w, h) {
      var r = K.rng(fem ? 3 : 4), i;
      var gr = g.createLinearGradient(0, 0, 0, h);
      if (fem) { gr.addColorStop(0, '#f1e3b4'); gr.addColorStop(1, '#d9b96a'); } else { gr.addColorStop(0, '#f3ecdc'); gr.addColorStop(1, '#e2d6bb'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      if (fem) {   /* 金地に、すやり霞（白い角の丸い帯）・松の枝・桜の花（五弁）の絵 */
        for (i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,236,170,' + (0.15 + r() * 0.25) + ')'; g.fillRect(r() * w, r() * h, 3 + r() * 6, 3 + r() * 6); }   /* 金箔の切箔 */
        g.fillStyle = 'rgba(255,255,250,.72)';
        [[20, 26, 120], [150, 40, 96], [60, 92, 130]].forEach(function (b) { var x0 = b[0], y0 = b[1], L = b[2]; g.beginPath(); g.moveTo(x0 + 8, y0); g.lineTo(x0 + L - 8, y0); g.quadraticCurveTo(x0 + L, y0, x0 + L, y0 + 8); g.quadraticCurveTo(x0 + L, y0 + 16, x0 + L - 8, y0 + 16); g.lineTo(x0 + 8, y0 + 16); g.quadraticCurveTo(x0, y0 + 16, x0, y0 + 8); g.quadraticCurveTo(x0, y0, x0 + 8, y0); g.fill(); });
        g.strokeStyle = '#5b4632'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 120); g.bezierCurveTo(80, 96, 120, 108, 170, 78); g.stroke();   /* 松の枝 */
        g.fillStyle = '#3f6e4e'; for (i = 0; i < 9; i++) { var px = 60 + i * 13, py = 104 - i * 3 + (r() - 0.5) * 8; g.beginPath(); g.ellipse(px, py, 12, 5, -0.2, 0, PI * 2); g.fill(); }
        for (i = 0; i < 9; i++) {   /* 桜：五弁の花 */
          var fx = 30 + r() * 200, fy = 50 + r() * 60, fr = 4 + r() * 2;
          g.fillStyle = '#f2b8c6'; for (var pq = 0; pq < 5; pq++) { var an = pq / 5 * PI * 2; g.beginPath(); g.arc(fx + Math.cos(an) * fr, fy + Math.sin(an) * fr, fr * 0.75, 0, PI * 2); g.fill(); }
          g.fillStyle = '#d9606e'; g.beginPath(); g.arc(fx, fy, fr * 0.35, 0, PI * 2); g.fill();
        }
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
      var bh = buildHead(isHeian('girl') ? { role: 'girl', tone: '#' + root.GJ3_HD_ASSETS.heads.girl.skin, extra: 1.1, hair: 'bob' } : { role: 'female', tone: SKIN.child, child: 1.4, cheek: 0.3, lip: '#c05a5a', hair: 'bob' }, 'low');
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
      if (h.open != null) { open = h.open; low = low ? 0.45 : 0; }
      for (i = 0; i < h.lids.length; i++) h.lids[i].rotation.x = open + low + (shut - open - low) * b;
      /* 口：話し手だけ、音節ほどの速さで小さく開け閉め */
      var jw = this.spk > 0.05 ? this.spk * Math.max(0, Math.sin(t * 13 + Math.sin(t * 3.1) * 2)) * (0.6 + 0.4 * Math.sin(t * 2.3)) : 0;
      h.jaw.value = jw;
      var inf = h.skin.morphTargetInfluences;
      if (inf) { var neu = P.anim === 'weep' || this.pose === 'lie' || this.pose === 'bow' || this.pose === 'pray' || this.pose === 'write' ? 1 : 0; inf[0] += (neu - inf[0]) * (1 - Math.exp(-dt * 4)); }
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
