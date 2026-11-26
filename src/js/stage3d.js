/* 3D 舞台の本体 —— window.GENJI.Stage3D（API は docs/CONTRACT.md「舞台 API」）。
 * 吹抜屋台の俯瞰を基本に、focus(人物) で低い視点へなめらかに寄る。
 * 文字の窓（画面の下 4 割）に隠れないよう、絵の中心を上 6 割の真ん中へずらして描く。
 * 依存: THREE r128, stage3d-kit.js, stage3d-figures.js, stage3d-sets.js, stage3d-activities.js */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {}, T = root.THREE, K = G.S3K, F = G.S3F, SETS = G.S3S;
  var PI = Math.PI, doc = root.document;
  var S = { q: 'high', panel: 0.4, figs: {}, order: [], wind: 0, t: 0 };

  /* 光：空（上・下）の色、日／月の色と向き、地の色（絵巻の紙色）、灯 */
  var LIGHTS = {
    dawn:  { bg: '#ead9cf', hemi: ['#ffeee6', '#9a8a8e', 0.7], sun: ['#ffd6c0', 0.42, [-6, 7, 6]], amb: 0.1, exp: 0.8 },
    day:   { bg: '#eadfc2', hemi: ['#fffaf0', '#b3a586', 0.74], sun: ['#fff3dc', 0.42, [5, 10, 6]], amb: 0.1, exp: 0.76 },
    dusk:  { bg: '#e2b98e', hemi: ['#ffdcb8', '#86697a', 0.68], sun: ['#ffae6c', 0.5, [-8, 4.5, 4]], amb: 0.08, dark: 1, exp: 0.95, env: 'l' },
    night: { bg: '#20263c', hemi: ['#6f7ba6', '#262637', 0.62], sun: ['#93a4d6', 0.22, [3, 9, 5]], amb: 0.06, dark: 1, lamp: 1.1, exp: 0.95 },
    moon:  { bg: '#313c5c', hemi: ['#97a8d0', '#2e3046', 0.72], sun: ['#d3deff', 0.5, [-6, 9, 3]], amb: 0.06, dark: 1, lamp: 0.7, moon: 1, exp: 1.0 }
  };
  var KEIGO = { sonkei: '尊敬', kenjo: '謙譲', teinei: '丁寧' };
  /* 映り込み用の環境（外部の HDRI は使わず、紙の色の箱に明るい窓を描いたもの。鴻門の会 koumon-lighting.js と同じ考え） */
  var ENV = {};
  function envMap(dark) {
    var k = dark ? 'd' : 'l'; if (ENV[k] && ENV[k].r === S.renderer) return ENV[k].t;
    var faces = [], i;
    for (i = 0; i < 6; i++) {
      var c = K.canvas(64, 64, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, dark ? '#25283a' : '#d9c9a8'); gr.addColorStop(0.6, dark ? '#14131b' : '#8a7356'); gr.addColorStop(1, dark ? '#08070a' : '#3a2c20');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        if (i === 2) { g.fillStyle = dark ? '#2e3248' : '#efe4cc'; g.fillRect(0, 0, w, h); }
        if (i === 3) { g.fillStyle = dark ? '#080606' : '#4a3828'; g.fillRect(0, 0, w, h); }
        if (i === 0 || i === 4) { g.fillStyle = dark ? 'rgba(255,170,90,.55)' : 'rgba(255,248,230,.85)'; g.fillRect(10, 8, 44, 30); }
      });
      faces.push(c);
    }
    var cube = new T.CubeTexture(faces); cube.encoding = T.sRGBEncoding; cube.needsUpdate = true;
    var gen = new T.PMREMGenerator(S.renderer), tgt = gen.fromCubemap(cube); gen.dispose(); cube.dispose();
    if (ENV[k]) ENV[k].t.dispose();
    ENV[k] = { r: S.renderer, t: tgt.texture }; tgt.texture._gjShared = true;
    return tgt.texture;
  }

  function supported() {
    if (!T || !K || !K.ok || !F || !SETS || !doc) return false;
    if (S.sup != null) return S.sup;
    try { var c = doc.createElement('canvas'); S.sup = !!(root.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { S.sup = false; }
    return S.sup;
  }
  function div(cls, parent, tag) { var e = doc.createElement(tag || 'div'); e.className = cls; if (parent) parent.appendChild(e); return e; }

  /* ---------- 取り付け ---------- */
  function mount(el, opts) {
    if (S.el) unmount();
    if (!supported()) return false;
    opts = opts || {};
    /* 画質：high（PC）／low（小さい画面・少ないメモリ。高精細の人物は軽い設定で）／lite（簡素な人形だけ） */
    S.q = opts.quality === 'low' || opts.quality === 'lite' ? opts.quality : 'high';
    if (S.q === 'low' && root.navigator && root.navigator.deviceMemory && root.navigator.deviceMemory <= 2) S.q = 'lite';
    if (opts.panel != null) S.panel = opts.panel;
    S.el = el;
    S.wrap = div('gj3-root', el);
    S.cv = div('gj3-canvas', S.wrap, 'canvas');
    try {
      S.renderer = new T.WebGLRenderer({ canvas: S.cv, antialias: S.q === 'high', alpha: false, powerPreference: 'high-performance' });
    } catch (e) { S.sup = false; el.removeChild(S.wrap); S.el = null; return false; }
    S.renderer.outputEncoding = T.sRGBEncoding;
    K.HQ = S.q === 'high';
    if (K.HQ) { S.renderer.toneMapping = T.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.2; }
    S.renderer.shadowMap.enabled = S.q === 'high'; S.renderer.shadowMap.type = T.PCFSoftShadowMap;
    S.camera = new T.PerspectiveCamera(30, 1, 0.3, 400);
    S.cam = { t: new T.Vector3(), az: 0.4, el: 0.85, dist: 20 }; S.goal = { t: new T.Vector3(), az: 0.4, el: 0.85, dist: 20 };
    S.kumo = div('gj3-kumo', S.wrap); S.moon = div('gj3-moon', S.wrap); S.veil = div('gj3-veil', S.wrap);
    S.svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); S.svg.setAttribute('class', 'gj3-arrows'); S.wrap.appendChild(S.svg);
    S.legend = div('gj3-legend', S.wrap); S.legend.hidden = true;
    S.ui = div('gj3-act', S.wrap);
    S.onRes = function () { resize(); };
    root.addEventListener('resize', S.onRes);
    if (root.ResizeObserver) { S.ro = new root.ResizeObserver(S.onRes); S.ro.observe(el); }
    S.onVis = function () { S.hidden = doc.hidden; };
    doc.addEventListener('visibilitychange', S.onVis);
    if (root.IntersectionObserver) { S.io = new root.IntersectionObserver(function (es) { S.off = !es[0].isIntersecting; }); S.io.observe(S.wrap); }
    S.cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); S.lost = true; });
    S.cv.addEventListener('webglcontextrestored', function () { S.lost = false; });
    resize();
    S.running = true; S.last = 0; S.raf = root.requestAnimationFrame(frame);
    if (G.S3H && S.q !== 'lite') {
      G.S3H.onReady(hdSwap);
      root.setTimeout(function () {
        if (S.el === el && S.q !== 'lite') G.S3H.ready();
      }, 300);
    }
    return true;
  }
  function unmount() {
    if (!S.el) return;
    stopActivity();
    root.cancelAnimationFrame(S.raf); S.running = false;
    clearScene();
    root.removeEventListener('resize', S.onRes); doc.removeEventListener('visibilitychange', S.onVis);
    if (S.ro) S.ro.disconnect(); if (S.io) S.io.disconnect();
    K.disposeAll(); SETS._reset();
    for (var ek in ENV) { ENV[ek].t.dispose(); } ENV = {};
    S.renderer.dispose();
    if (S.wrap.parentNode) S.wrap.parentNode.removeChild(S.wrap);
    S.el = S.wrap = S.cv = S.renderer = S.scene = S.set = S.node = null; S.figs = {}; S.order = [];
  }
  function resize() {
    if (!S.renderer) return;
    var r = S.wrap.getBoundingClientRect();
    S.w = Math.max(1, Math.round(r.width)); S.h = Math.max(1, Math.round(r.height));
    var dpr = root.devicePixelRatio || 1;
    S.renderer.setPixelRatio(S.q === 'high' ? Math.min(2, dpr) : Math.min(1.5, Math.max(1, dpr)));
    S.renderer.setSize(S.w, S.h, false);
    S.camera.aspect = S.w / S.h;
    S.camera.fov = S.fovOver || (S.w / S.h < 0.8 ? 38 : 30);
    /* 絵の中心を、文字の窓より上に残る領域の真ん中へ */
    S.camera.setViewOffset(S.w, S.h, 0, S.h * S.panel / 2, S.w, S.h);
    S.camera.updateProjectionMatrix();
    S.svg.setAttribute('viewBox', '0 0 ' + S.w + ' ' + S.h);
    if (S.set) { fitWide(); K.fitLabels(S.set.g, S.camera, S.h); labelDensity(); }
    if (S.act && S.act.resize) S.act.resize();
  }
  function setQuality(q) {
    q = q === 'low' || q === 'lite' ? q : 'high'; if (q === S.q) return; S.q = q;
    if (!S.el) return;
    var el = S.el, node = S.node, panel = S.panel;
    unmount(); mount(el, { quality: q, panel: panel }); if (node) setScene(node);
  }
  function setPanel(f) { S.panel = K.clamp(+f || 0, 0, 0.6); resize(); }

  /* ---------- 舞台の組み替え ---------- */
  function clearScene() {
    var k;
    for (k in S.figs) S.figs[k].forEach(function (f) { f.dispose(); });
    S.figs = {}; S.order = []; S.speaker = null;
    if (S.set) K.dispose(S.set.g);
    if (S.scene) { S.scene.traverse(function (o) { if (o.geometry && !o.geometry._gjShared) o.geometry.dispose(); if (o.material && !o.material._gjShared && o.material.dispose) o.material.dispose(); if (o.shadow && o.shadow.map) o.shadow.map.dispose(); }); }
    S.set = null; S.scene = null; S.parts = null; S.rain = null; S.mistOn = 0; S.dimOn = 0;
    if (S.veil) S.veil.className = 'gj3-veil';
    arrows(null);
  }
  function load(node, opt) {
    opt = opt || {};
    clearScene();
    var spec = G.stageSpec || {}, lt = LIGHTS[node.light] ? node.light : 'day', L = LIGHTS[lt];
    var season = (spec.seasons || ['spring', 'summer', 'autumn', 'winter']).indexOf(node.season) >= 0 ? node.season : 'spring';
    S.light = lt; S.season = season; S.L = L;
    var env = { light: lt, season: season, low: S.q === 'low', dark: !!L.dark, noKumo: false };
    if (node.stage && SETS.STAGES.indexOf(node.stage) < 0 && !opt.custom) root.console && console.warn('[Stage3D] 知らない舞台: ' + node.stage);
    var set = S.set = opt.custom ? opt.custom(env) : SETS.build(node.stage, env, opt);
    var sc = S.scene = new T.Scene();
    sc.background = K.col(L.bg);
    sc.fog = new T.Fog(K.col(L.bg), 60, 240);
    sc.add(set.g);
    /* 高画質では映り込みの環境が回り込む光を担うので、半球光は弱める */
    var hemi = new T.HemisphereLight(K.col(L.hemi[0]), K.col(L.hemi[1]), L.hemi[2] * (K.HQ ? (L.dark && !L.env ? 0.4 : 0.5) : 1)); sc.add(hemi);
    if (!K.HQ) sc.add(new T.AmbientLight(0xffffff, L.amb));
    if (K.HQ) { sc.environment = envMap(L.env ? false : !!L.dark); S.renderer.toneMappingExposure = L.exp || 1; }
    var sun = S.sun = new T.DirectionalLight(K.col(L.sun[0]), L.sun[1]);
    sun.position.set(L.sun[2][0], L.sun[2][1], L.sun[2][2]).multiplyScalar(4);
    if (S.q === 'high' && !opt.noShadow) {
      var R = set.shadowR || 12, c = sun.shadow.camera;
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 160; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    }
    sc.add(sun); sc.add(sun.target);
    /* 顔の補助光：カメラの位置からやわらかく当てる（逆光・暗い室内でも話し手の顔が読めるように）。寄っているときは強める */
    S.fill = new T.DirectionalLight(0xfff0e4, 0); sc.add(S.fill); sc.add(S.fill.target); S.fillK = L.dark ? 0.55 : 0.32;
    (set.lamps || []).slice(0, 2).forEach(function (l) { if (!L.lamp) return; var p = new T.PointLight(0xffb060, L.lamp, 9, 1.6); p.position.set(l.x, l.y, l.z); sc.add(p); l.light = p; });
    /* 話し手の足もとの光の輪 */
    S.ring = new T.Mesh(K.G.plane(), K.mat('#ffe9b0', { basic: true, map: K.tex.glow(), transparent: true, depthWrite: false, add: true, fog: false, opacity: 0.999 }));
    S.ring.material = S.ring.material.clone(); S.ring.material.opacity = 0; S.ring.renderOrder = 4; S.ring.visible = false; sc.add(S.ring);
    S.wrap.setAttribute('data-light', lt); S.wrap.setAttribute('data-season', season); S.wrap.setAttribute('data-stage', set.stage || 'act');
    makeParticles();
    (node.cast || []).forEach(function (c) { addFig(typeof c === 'string' ? { id: c } : c); });
    applyTouches();
    fitWide(true);
    /* 人物の用意より先に話し手が指定されていたら、用意ができたところで寄る */
    if (S.wantSpeaker && S.figs[S.wantSpeaker] && !S.speaker) speak(S.wantSpeaker);
    K.fitLabels(set.g, S.camera, S.h); labelDensity();
    return set;
  }
  function labelDensity() {   // 幅の狭い画面では、主でない殿舎の札を小さく
    if (!S.set) return; var narrow = S.w < 560;
    S.set.g.traverse(function (o) { if (o.userData.minor && narrow) { o.scale.multiplyScalar(0.72); } });
  }
  function setScene(node) {
    if (!S.el) return Promise.resolve();
    stopActivity();
    node = node || {};
    S.node = { stage: node.stage, light: node.light, season: node.season, cast: (node.cast || []).slice() };
    load(S.node);
    return Promise.resolve();
  }

  /* ---------- 高精細の人物（stage3d-hd.js）が届いたら、いまの舞台の人物を差し替える ---------- */
  function hdSwap() {
    if (!S.scene || S.q === 'lite' || S.act) return;
    var k;
    for (k in S.figs) S.figs[k] = S.figs[k].map(function (f, i) {
      if (f.hd) return f;
      var n = F.make(k, { variant: i, seed: f.seed, pose: f.pose, quality: S.q, far: (S.set.figScale || 1) > 1.6 || S.figs[k].length > 1 && (S.set.figScale || 1) > 1.3 });
      if (!n.hd) return f;
      n.root.position.copy(f.root.position); n.root.rotation.copy(f.root.rotation); n.root.scale.multiplyScalar(S.set.figScale || 1);
      n.root.visible = f.root.visible; n.at = f.at; n.speak(k === S.speaker && i === 0);
      S.scene.add(n.root); f.dispose();
      return n;
    });
    applyTouches();
    if (S.focusAt) { var fa = S.focusAt; S.focusAt = null; focus(fa); }
  }

  /* ---------- 人物 ---------- */
  var AUTO = ['naka', 'nakaL', 'nakaR', 'shimo', 'shimoL', 'shimoR', 'kamiL', 'kamiR', 'kami', 'sunoko', 'to', 'niwa', 'misu'];
  var STANDS = { sunoko: 1, niwa: 1, to: 1, kaki: 1, kakiL: 1, kakiR: 1 };
  function addFig(c) {
    var set = S.set, id = c.id; if (!id || !set || S.figs[id]) return null;
    var used = {}; S.order.forEach(function (k) { used[S.figs[k][0].at] = 1; });
    var at = c.at && set.slots[c.at] ? c.at : null, i;
    if (!at) { if (id === 'mikado' && !used.kami) at = 'kami'; else for (i = 0; i < AUTO.length; i++) if (set.slots[AUTO[i]] && !used[AUTO[i]]) { at = AUTO[i]; break; } }
    at = at || 'naka';
    var sl = c.pos || set.slots[at] || [0, 0, 0, 0], same = 0;
    S.order.forEach(function (k) { if (S.figs[k][0].at === at) same++; });
    var kind = F.kindOf(id), pose = c.pose || ((set.standing || STANDS[at]) ? 'stand' : 'sit');
    /* 幼子（chigo）を、hold の人と同じ立ち位置に置いたとき：その人の腕の中の嬰児として扱い、別の人形は立てない */
    if (kind === 'chigo') for (i = 0; i < S.order.length; i++) {
      var hf = S.figs[S.order[i]][0];
      if (hf.at === at && hf.pose === 'hold' && !hf.held) { var px = heldProxy(id, S.order[i]); px.at = at; S.scene.add(px.root); S.figs[id] = [px]; S.order.push(id); return px; }
    }
    var n = F.GROUPS[id] || 1, list = [], fs = set.figScale || 1;
    for (i = 0; i < n; i++) {
      var f = F.make(id, { variant: i, seed: i * 3.1 + S.order.length, pose: pose, quality: S.q, lite: S.q === 'lite', far: fs > 1.6 || n > 1 && fs > 1.3 });
      f.root.scale.multiplyScalar(fs);
      var off = (i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.95 : 0) + same * 1.15, ry = sl[2] || 0, back = i ? 0.45 : 0;
      f.root.position.set(sl[0] + (Math.cos(ry) * off - Math.sin(ry) * back) * fs, sl[3] || 0, sl[1] + (-Math.sin(ry) * off - Math.cos(ry) * back) * fs);
      f.root.rotation.y = ry + (i ? (i % 2 ? -0.25 : 0.25) : 0);
      /* 同じ立ち位置の二人目以降（枕もと・連れ立つ人）は、その立ち位置の一人目の方へ半ば向き直る */
      if (same && !i) { var first = S.order.filter(function (k) { return S.figs[k][0].at === at && !S.figs[k][0].held; })[0], fh = first && headOf(first, new T.Vector3());
        if (fh) { var ta = Math.atan2(fh.x - f.root.position.x, fh.z - f.root.position.z), dd = ta - ry; while (dd > PI) dd -= PI * 2; while (dd < -PI) dd += PI * 2; f.root.rotation.y = ry + K.clamp(dd, -1.3, 1.3) * 0.6; } }
      f.at = at; S.scene.add(f.root); list.push(f);
    }
    S.figs[id] = list; S.order.push(id);
    return list[0];
  }
  function pose(id, p, instant) {
    var l = S.figs[id]; if (!l) return;
    if (p === 'stroke') { var t = touchFor(id); l.forEach(function (f, i) { f.setPose(p, instant, { touch: i ? null : t && t.p }); }); setContact(id, t && t.id); return; }
    l.forEach(function (f) { f.setPose(p, instant); });
    if (S.contact && (S.contact.a === id)) S.contact = null;
  }
  /* 抱かれた嬰児の代わり（舞台の上の人物の形だけ合わせる）：位置は抱く人に、頭は腕の中の嬰児の頭に */
  function heldProxy(id, hid) {
    var r = new T.Group();
    function holder() { return S.figs[hid] && S.figs[hid][0]; }
    var p = { id: id, held: hid, hd: true, pose: 'held', root: r, seed: 0,
      setPose: function () {}, speak: function () {},
      update: function () { var h = holder(); if (h) { r.position.copy(h.root.position); r.rotation.copy(h.root.rotation); r.scale.copy(h.root.scale); } },
      headWorld: function (v) { var h = holder(); if (!h) return v.copy(r.position); h.root.updateMatrixWorld(true); return (h.heldHead && h.heldHead(v)) || h.headWorld(v); },
      dispose: function () { if (r.parent) r.parent.remove(r); } };
    p.update();
    return p;
  }
  /* 撫でる（stroke）：いちばん近い子（いなければ近い人）の頭の上を、撫でる人の pivot の座標で返す */
  function touchFor(id) {
    var f = S.figs[id] && S.figs[id][0]; if (!f || f.held) return null;
    var best = null, bid = null, bd = 1e9, fp = f.root.position, sc = f.root.scale.x || 1, k;
    for (k in S.figs) if (k !== id) S.figs[k].forEach(function (o, i) {
      if (o.held || i) return;
      var kd = F.kindOf(k), child = kd === 'shojo' || kd === 'warawa' || kd === 'chigo';
      var d = Math.sqrt(Math.pow(o.root.position.x - fp.x, 2) + Math.pow(o.root.position.z - fp.z, 2)) / sc + (child ? 0 : 0.8);
      if (d < bd) { bd = d; best = o; bid = k; }
    });
    if (!best || bd > 1.5) return null;
    best.root.updateMatrixWorld(true); f.root.updateMatrixWorld(true);
    var h = best.headWorld(new T.Vector3()); h.y += 0.085 * best.root.scale.x * (best.headScale || 1);
    return { id: bid, p: f.pivot.worldToLocal(h) };
  }
  function setContact(a, b) { S.contact = b ? { a: a, b: b } : (S.contact && S.contact.a === a ? null : S.contact); }
  function applyTouches() { S.contact = null; S.order.forEach(function (k) { var f = S.figs[k][0]; if (f.pose === 'stroke') pose(k, 'stroke', true); }); }
  /* 寄るときに一緒に収める相手（撫でる・撫でられる二人） */
  function mateOf(id) {
    var c = S.contact; if (c && (c.a === id || c.b === id)) return c.a === id ? c.b : c.a;
    /* 触れ合うほどすぐそば（体が重なる距離）に座る人も一緒に収める（手前の人の体で寄りがふさがれないように） */
    var f = S.figs[id] && S.figs[id][0], best = null, bd = 0.8, k; if (!f) return null;
    for (k in S.figs) if (k !== id && S.figs[k].length === 1 && !S.figs[k][0].held) {
      var o = S.figs[k][0], d = Math.sqrt(Math.pow(o.root.position.x - f.root.position.x, 2) + Math.pow(o.root.position.z - f.root.position.z, 2)) / (f.root.scale.x || 1);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function speak(id) {
    var prev = S.speaker; S.wantSpeaker = id || null;
    S.speaker = id && S.figs[id] ? id : null;
    for (var k in S.figs) S.figs[k].forEach(function (f, i) { f.speak(k === S.speaker && i === 0); });
    /* 話し手の顔が読めるよう、その人に寄る。節が寄り（at）を指定した直後や遊びの最中は動かさない */
    /* （節が場所へ寄せた直後でも、話し手には寄る。別の人物へ寄せた直後だけは節の指定を優先） */
    if (S.speaker && S.speaker !== prev && !S.act && S.set && S.focusFig !== S.speaker && !(S.focusFig && Date.now() - (S.focusT || 0) < 150)) focus(S.speaker, true);
  }
  var _v = T ? new T.Vector3() : null, _v2 = T ? new T.Vector3() : null, _v3 = T ? new T.Vector3() : null;
  function headOf(id, v) { var l = S.figs[id]; if (!l) return null; l[0].root.updateMatrixWorld(true); return l[0].headWorld(v || new T.Vector3()); }

  /* ---------- カメラ ---------- */
  function tanF() { return Math.tan(S.camera.fov * PI / 360); }
  function fitDist(rh, rv) { var t = tanF(); return Math.max(rv / (t * (1 - S.panel)), rh / (t * S.camera.aspect)) * 1.04; }
  function fitWide(instant) {
    if (!S.set || (S.focusAt && !instant)) return;
    var c = S.set.cam; S.focusAt = null;
    S.goal.t.set(c.t[0], c.t[1], c.t[2]); S.goal.az = c.az; S.goal.el = c.el; S.goal.dist = fitDist(c.rh, c.rv);
    if (instant) snapCam();
  }
  function snapCam() { S.cam.t.copy(S.goal.t); S.cam.az = S.goal.az; S.cam.el = S.goal.el; S.cam.dist = S.goal.dist; }
  /* 寄りのカメラ：人物の顔が見える向きのうち、手前の柱・几帳・屏風に遮られない方位と高さを選ぶ */
  function blocked(cx, cy, cz, tx, ty, tz, skip) {
    var L = S.figOcc || S.set.occ || [], i, dx = tx - cx, dz = tz - cz, len2 = dx * dx + dz * dz || 1e-6;
    for (i = 0; i < L.length; i++) {
      var o = L[i], u = K.clamp(((o.x - cx) * dx + (o.z - cz) * dz) / len2, 0, 1);
      if (u > 0.96) continue;                                   /* 人物のすぐ後ろの物は遮らない */
      var px = cx + dx * u - o.x, pz = cz + dz * u - o.z, y = cy + (ty - cy) * u;
      if (px * px + pz * pz < o.r * o.r && y < o.top && y > (o.bot == null ? -9 : o.bot)) return true;
    }
    return false;
  }
  function focus(at, face) {
    if (!S.set || S.act) return;
    var c = S.set.cam, fs = S.set.figScale || 1, fd = S.set.focusDist || 5.2;
    S.focusFig = null; S.focusT = Date.now();
    if (!at || at === 'wide') { S.focusAt = null; S.goal.t.set(c.t[0], c.t[1], c.t[2]); S.goal.az = c.az; S.goal.el = c.el; S.goal.dist = fitDist(c.rh, c.rv); return; }
    var narrow = S.camera.aspect < 0.8 ? 1.25 : 1;
    if (S.figs[at]) {
      var f = S.figs[at][0], h = headOf(at, _v), ry = f.root.rotation.y, d = ry - c.az, sc = f.root.scale.x;
      while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2;
      S.focusAt = at; S.focusFig = at; S.focusT = Date.now();
      /* 顔が見える側へ回り込む。後ろ向きの人は斜め後ろ姿のまま（絵巻の後ろ姿） */
      var pref = c.az + K.clamp(Math.abs(d) < 1.9 ? d * 0.75 : -Math.sign(d) * (PI - Math.abs(d)) * 0.4, -1.0, 1.0);
      if (face) pref = ry + K.clamp(-d * 0.25, -0.5, 0.5);   /* 話し手：顔の正面側（少し斜め）から */
      var close = fs < 1.6 || !!face;   /* 遠景の舞台（後宮・北山）は全身の寄り。話し手へは胸から上 */
      /* 寄り：顔が読める胸から上（スマホでも顔が小さくならないよう、以前より詰める） */
      var rv = close ? 0.31 * sc : 1.4 * sc, rh = rv * 1.15;
      var ty = h.y - (close ? 0.1 : 0.5) * sc;
      /* 嬰児を抱く人・抱かれた嬰児：胸の嬰児まで収める */
      if (close && (f.pose === 'hold' || f.held)) { rv = 0.4 * sc; ty = h.y - (f.held ? 0.06 : 0.17) * sc; rh = rv * 1.15; }
      /* 撫でる・撫でられる二人（体が重なるほどそばの二人も）：二人の頭のあいだを中心に、二人とも収まる大きさ。二人を結ぶ線を、二人の顔の向きの平均の側（前）から見る */
      var mate = close && mateOf(at), mh = mate && headOf(mate, new T.Vector3());
      if (mh) {
        var mp = S.figs[mate][0].root.position, sep = Math.sqrt((mh.x - h.x) * (mh.x - h.x) + (mh.z - h.z) * (mh.z - h.z)), aa = Math.atan2(mp.x - f.root.position.x, mp.z - f.root.position.z);   /* 向きは体の位置で（礼・泣く姿勢では頭どうしが寄って向きが定まらない） */
        var mry = S.figs[mate][0].root.rotation.y, want = Math.atan2(Math.sin(ry) + Math.sin(mry), Math.cos(ry) + Math.cos(mry)), c1 = aa + PI / 2, c2 = aa - PI / 2, d1 = Math.abs(Math.atan2(Math.sin(c1 - want), Math.cos(c1 - want))), d2 = Math.abs(Math.atan2(Math.sin(c2 - want), Math.cos(c2 - want)));
        pref = d1 < d2 ? c1 : c2;
        rh = Math.max(rh, sep / 2 + 0.3 * sc); rv = Math.max(rv, Math.abs(mh.y - h.y) / 2 + 0.34 * sc);
        h = _v.set((h.x + mh.x) / 2, Math.max(h.y, mh.y), (h.z + mh.z) / 2); ty = (Math.min(headOf(at, _v2).y, mh.y) + h.y) / 2 - 0.16 * sc;
      }
      var dist = Math.max(close ? 0.9 : 4, fitDist(rh, rv));
      /* ほかの人物も遮る物として数える（頭の高さまで）。抱かれた嬰児・抱く人・撫でる相手は除く */
      S.figOcc = (S.set.occ || []).slice();
      for (var k2 in S.figs) if (k2 !== at && k2 !== mate && k2 !== f.held && !S.figs[k2][0].held) S.figs[k2].forEach(function (o) { var hp = headOf(k2, _v2); S.figOcc.push({ x: o.root.position.x, z: o.root.position.z, r: 0.3 * o.root.scale.x, top: hp ? hp.y + 0.12 * o.root.scale.x : 1.4 }); });
      var els = f.pose === 'lie' ? [1.2, 1.05, 1.35] : close ? [0.24, 0.36, 0.5, 0.66] : [0.42, 0.6],   /* 伏している人は上から見下ろす */ offs = mh ? [0, 0.18, -0.18, 0.36, -0.36] : [0, 0.18, -0.18, 0.36, -0.36, 0.55, -0.55, 0.8, -0.8], best = null, i, j;   /* 二人を収めるときは横からの向きを大きく崩さない */
      /* 遠い順に試し、どれも遮られるなら少しずつ近づく（顔は大きくなる） */
      [1, 0.8, 0.62].forEach(function (kd) {
        for (j = 0; j < els.length && !best; j++) for (i = 0; i < offs.length; i++) {
          var az = pref + offs[i], el = els[j], ce = Math.cos(el), dd = dist * kd * narrow;
          var cx = h.x + dd * Math.sin(az) * ce, cy = ty + dd * Math.sin(el), cz = h.z + dd * Math.cos(az) * ce;
          var sx = Math.cos(az) * 0.2 * sc, sz = -Math.sin(az) * 0.2 * sc;   /* 肩の幅ぶん左右も */
          if (!blocked(cx, cy, cz, h.x, h.y, h.z) && !blocked(cx, cy, cz, h.x, h.y - 0.3 * sc, h.z) && !blocked(cx, cy, cz, h.x, ty - 0.2 * sc, h.z) &&
              !blocked(cx, cy, cz, h.x + sx, h.y - 0.25 * sc, h.z + sz) && !blocked(cx, cy, cz, h.x - sx, h.y - 0.25 * sc, h.z - sz)) { best = [az, el, dd]; break; }
        }
      });
      if (!best) best = [pref, 0.75, dist * narrow];
      S.figOcc = null;
      S.goal.t.set(h.x, ty, h.z); S.goal.az = best[0]; S.goal.el = best[1]; S.goal.dist = best[2];
      var h0 = headOf(at, _v2); S.focusOff = new T.Vector3(h.x - h0.x, ty - h0.y, h.z - h0.z);   /* 頭から見た目標のずれ（二人を収めるときは二人のあいだ） */
    } else if (S.set.slots[at]) {
      var s = S.set.slots[at]; S.focusAt = at;
      S.goal.t.set(s[0], (s[3] || 0) + 0.6 * fs, s[1]); S.goal.az = c.az; S.goal.el = 0.5; S.goal.dist = fd * 1.5 * narrow;
    }
  }
  function applyCam(dt) {
    var c = S.cam, g = S.goal, k = 1 - Math.exp(-dt * 3.2);
    /* 人物に寄っている間は、その人の今の頭の位置へ目標を追う（姿勢の変化・置き直し・高精細版への差し替えのあとも外れない） */
    if (S.focusFig && S.figs[S.focusFig] && S.focusOff) { var hh = headOf(S.focusFig, _v3); if (hh) g.t.copy(hh).add(S.focusOff); }
    c.t.lerp(g.t, k); c.az += (g.az - c.az) * k; c.el += (g.el - c.el) * k; c.dist += (g.dist - c.dist) * k;
    var ce = Math.cos(c.el), cam = S.camera;
    cam.position.set(c.t.x + c.dist * Math.sin(c.az) * ce, c.t.y + c.dist * Math.sin(c.el), c.t.z + c.dist * Math.cos(c.az) * ce);
    cam.lookAt(c.t);
    if (S.fill) {
      S.fill.position.copy(cam.position); S.fill.position.y += 0.3; S.fill.target.position.copy(c.t);
      var want = (S.focusFig ? 1 : 0.35) * S.fillK * (K.HQ ? 1 : 0.8); S.fill.intensity += (want - S.fill.intensity) * k;
    }
  }

  /* ---------- 粒（花びら・紅葉・雪・雨） ---------- */
  var PCOL = { petals: ['#f6cdd6', '#fbe6ea', '#f0b9c6'], leaves: ['#c2452d', '#d98a3a', '#d9ae45'], snow: ['#ffffff', '#eef2f6'] };
  function makeParticles() {
    var n = S.q !== 'high' ? 70 : 220, g = new T.BufferGeometry();
    var P = S.parts = { n: n, pos: new Float32Array(n * 3), col: new Float32Array(n * 3), vel: new Float32Array(n * 3), life: new Float32Array(n), ph: new Float32Array(n), live: 0, rate: 0, kind: 'petals', until: 0 };
    for (var i = 0; i < n; i++) { P.pos[i * 3 + 1] = -999; P.ph[i] = Math.random() * 6.28; }
    g.setAttribute('position', new T.BufferAttribute(P.pos, 3)); g.setAttribute('color', new T.BufferAttribute(P.col, 3));
    var fs = S.set.figScale || 1;
    P.mat = new T.PointsMaterial({ size: 0.13 * (fs > 1.5 ? 3 : 1), map: K.tex.hira(), vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.2, fog: false });
    P.obj = new T.Points(g, P.mat); P.obj.frustumCulled = false; P.obj.renderOrder = 8; S.scene.add(P.obj);
    /* 季節のあしらい（庭の見える舞台でひかえめに） */
    var a = { spring: ['petals', 0.5], autumn: ['leaves', 0.35], winter: ['snow', 1.6] }[S.season];
    P.base = a && S.set.amb && !S.set.follow ? a : null;
    if (S.set.stage === 'kokyu' && P.base) P.base = [P.base[0], P.base[1] * 0.6];
  }
  function spawn(P, i, kind, wide) {
    var a = wide || S.set.amb || { x: 0, z: 0, r: 8, y: 6 }, c = PCOL[kind] || PCOL.petals, col = K.col(c[(Math.random() * c.length) | 0]);
    P.pos[i * 3] = a.x + (Math.random() - 0.5) * 2 * a.r; P.pos[i * 3 + 1] = a.y * (0.6 + Math.random() * 0.5); P.pos[i * 3 + 2] = a.z + (Math.random() - 0.5) * 2 * a.r;
    P.vel[i * 3] = (Math.random() - 0.3) * 0.5; P.vel[i * 3 + 1] = -(kind === 'snow' ? 0.7 : 0.9) - Math.random() * 0.5; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    P.col[i * 3] = col.r; P.col[i * 3 + 1] = col.g; P.col[i * 3 + 2] = col.b; P.life[i] = 12;
  }
  function updateParticles(dt) {
    var P = S.parts; if (!P) return;
    var burst = S.t < P.until, kind = burst ? P.kind : (P.base ? P.base[0] : null), rate = burst ? P.rate : (P.base ? P.base[1] * (S.q === 'low' ? 3 : 8) : 0), i, floor = (S.set.amb && S.set.amb.floor != null) ? S.set.amb.floor : -0.8;
    var area = burst && S.focusAt ? null : null, sc = (S.set.figScale || 1) > 1.5 ? 2.4 : 1;
    P.acc = (P.acc || 0) + rate * dt;
    for (i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { if (P.acc >= 1 && kind) { P.acc -= 1; spawn(P, i, kind, burst ? { x: S.cam.t.x, z: S.cam.t.z, r: (S.set.amb ? S.set.amb.r : 8), y: (S.set.amb ? S.set.amb.y : 6) } : null); } continue; }
      P.life[i] -= dt;
      var w = S.wind * 5 * sc;
      P.pos[i * 3] += (P.vel[i * 3] + Math.sin(S.t * 1.7 + P.ph[i]) * 0.5 + w) * dt * sc;
      P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt * sc;
      P.pos[i * 3 + 2] += (P.vel[i * 3 + 2] + Math.cos(S.t * 1.3 + P.ph[i]) * 0.4) * dt * sc;
      if (P.pos[i * 3 + 1] < floor || P.life[i] <= 0) { P.life[i] = 0; P.pos[i * 3 + 1] = -999; }
    }
    if (P.acc > 3) P.acc = 3;
    P.obj.geometry.attributes.position.needsUpdate = true; P.obj.geometry.attributes.color.needsUpdate = true;
    /* 雨 */
    if (S.rain) {
      var R = S.rain, p = R.pos, a = S.set.amb || { x: 0, z: 0, r: 8, y: 6 }, top = a.y * 1.2;
      for (i = 0; i < R.n; i++) {
        p[i * 6 + 1] -= R.sp * dt; p[i * 6 + 4] -= R.sp * dt; p[i * 6] += S.wind * 6 * dt; p[i * 6 + 3] += S.wind * 6 * dt;
        if (p[i * 6 + 4] < -0.7) { var x = S.cam.t.x + (Math.random() - 0.5) * 2.4 * a.r, z = S.cam.t.z + (Math.random() - 0.5) * 2.4 * a.r, y = top * (0.5 + Math.random()); p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z; p[i * 6 + 3] = x + 0.05; p[i * 6 + 4] = y - R.len; p[i * 6 + 5] = z; }
      }
      R.obj.geometry.attributes.position.needsUpdate = true;
    }
  }
  function startRain() {
    if (S.rain || !S.scene) return;
    var n = S.q === 'low' ? 90 : 260, fs = (S.set.figScale || 1) > 1.5 ? 3 : 1, R = S.rain = { n: n, pos: new Float32Array(n * 6), sp: 15 * fs, len: 0.7 * fs }, g = new T.BufferGeometry();
    for (var i = 0; i < n; i++) R.pos[i * 6 + 4] = -5 - Math.random() * 3;
    g.setAttribute('position', new T.BufferAttribute(R.pos, 3));
    R.obj = new T.LineSegments(g, new T.LineBasicMaterial({ color: S.L.dark ? 0xb8c4dc : 0x8f9aa6, transparent: true, opacity: 0.55, fog: false }));
    R.obj.frustumCulled = false; R.obj.renderOrder = 9; S.scene.add(R.obj);
  }

  /* ---------- 効果 ---------- */
  function fx(name) {
    if (!S.scene) return;
    var P = S.parts;
    if (name === 'shake') S.shake = 0.55;
    else if (name === 'petals' || name === 'leaves') { P.kind = name; P.rate = S.q === 'low' ? 14 : 40; P.until = S.t + 7; }
    else if (name === 'rain') { startRain(); S.veil.classList.add('gj3-rainy'); }
    else if (name === 'mist') { S.mistOn = 1; S.veil.classList.add('gj3-misty'); }
    else if (name === 'dim') { S.dimOn = 1; S.veil.classList.add('gj3-dim'); }
    else if (name === 'flash') { S.veil.classList.remove('gj3-flash'); void S.veil.offsetWidth; S.veil.classList.add('gj3-flash'); }
    else if (name === 'wind') { S.windT = 5; if (P && S.season !== 'summer') { P.kind = S.season === 'spring' ? 'petals' : S.season === 'winter' ? 'snow' : 'leaves'; P.rate = S.q === 'low' ? 10 : 26; P.until = S.t + 5; } }
    else if (name === 'clear' || name == null) {
      S.mistOn = 0; S.dimOn = 0; S.windT = 0; S.veil.className = 'gj3-veil'; if (P) P.until = 0;
      if (S.rain) { S.scene.remove(S.rain.obj); S.rain.obj.geometry.dispose(); S.rain.obj.material.dispose(); S.rain = null; }
    }
  }

  /* ---------- 敬意の矢印（SVG。色と凡例は stage3d.css） ---------- */
  function arrows(list) {
    S.arrowList = list && list.length ? list.slice() : null;
    if (!S.svg) return;
    while (S.svg.firstChild) S.svg.removeChild(S.svg.firstChild);
    S.arrowEls = [];
    S.legend.hidden = !S.arrowList; S.legend.innerHTML = '';
    if (!S.arrowList) return;
    var seen = {}, NS = 'http://www.w3.org/2000/svg';
    S.arrowList.forEach(function (a, i) {
      var kind = KEIGO[a.kind] ? a.kind : 'sonkei', g = doc.createElementNS(NS, 'g'); g.setAttribute('class', 'gj3-arrow gj3-arrow-' + kind);
      var halo = doc.createElementNS(NS, 'path'); halo.setAttribute('class', 'gj3-arrow-halo');
      var p = doc.createElementNS(NS, 'path'); p.setAttribute('class', 'gj3-arrow-line');
      var hd = doc.createElementNS(NS, 'path'); hd.setAttribute('class', 'gj3-arrow-head');
      var tx = doc.createElementNS(NS, 'text'); tx.setAttribute('class', 'gj3-arrow-text'); tx.textContent = KEIGO[kind];
      g.appendChild(halo); g.appendChild(p); g.appendChild(hd); g.appendChild(tx); S.svg.appendChild(g);
      S.arrowEls.push({ a: a, g: g, halo: halo, p: p, hd: hd, tx: tx, i: i });
      if (!seen[kind]) { seen[kind] = 1; var li = div('gj3-legend-item gj3-legend-' + kind, S.legend, 'span'); li.innerHTML = '<i></i>' + KEIGO[kind] + '語'; }
    });
    if (S.arrowList.some(function (a) { return a.from === 'kataribe'; })) { var n = div('gj3-legend-item gj3-legend-note', S.legend, 'span'); n.textContent = '手前から＝語り手（作者）'; }
  }
  function scr(v) { v.project(S.camera); return [(v.x + 1) / 2 * S.w, (1 - v.y) / 2 * S.h, v.z]; }
  function updateArrows() {
    if (!S.arrowEls || !S.arrowEls.length) return;
    var bottom = S.h * (1 - S.panel) - 6, nOut = 0;
    S.arrowEls.forEach(function (e) {
      var b = headOf(e.a.to, _v), a, A, B;
      if (!b) { e.g.style.display = 'none'; return; }
      B = scr(_v); B[1] -= 4;
      a = e.a.from !== 'kataribe' && headOf(e.a.from, _v2);
      if (a) A = scr(_v2);
      else { A = [K.clamp(B[0] + (nOut % 2 ? 90 : -70) - nOut * 14, 24, S.w - 24), bottom]; nOut++; }
      var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy);
      if (L < 12 || B[2] > 1) { e.g.style.display = 'none'; return; }
      e.g.style.display = '';
      var ux = dx / L, uy = dy / L, t0 = a ? 16 : 0, t1 = 18, bend = Math.min(70, L * 0.22) * (e.i % 2 ? -1 : 1);
      var x0 = A[0] + ux * t0, y0 = A[1] + uy * t0, x1 = B[0] - ux * t1, y1 = B[1] - uy * t1, mx = (x0 + x1) / 2 - uy * bend, my = (y0 + y1) / 2 + ux * bend - (a ? Math.min(40, L * 0.15) : 0);
      var d = 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
      e.p.setAttribute('d', d); e.halo.setAttribute('d', d);
      var hx = x1 - mx, hy = y1 - my, hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl;
      var s = 11, px = -hy, py = hx, tx = x1 + hx * s, ty = y1 + hy * s;
      e.hd.setAttribute('d', 'M' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ' L' + (x1 + px * s * 0.62).toFixed(1) + ' ' + (y1 + py * s * 0.62).toFixed(1) + ' L' + (x1 - px * s * 0.62).toFixed(1) + ' ' + (y1 - py * s * 0.62).toFixed(1) + 'Z');
      e.tx.setAttribute('x', ((x0 + 2 * mx + x1) / 4).toFixed(1)); e.tx.setAttribute('y', ((y0 + 2 * my + y1) / 4 - 7).toFixed(1));
    });
  }

  /* ---------- 毎フレーム ---------- */
  function frame(now) {
    if (!S.running) return;
    S.raf = root.requestAnimationFrame(frame);
    if (S.hidden || S.off || S.lost || !S.scene || !S.wrap.offsetParent && root.getComputedStyle(S.wrap).position !== 'fixed' && !S.wrap.offsetWidth) { S.last = 0; return; }
    var dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 0.016; S.last = now;
    draw(dt);
  }
  function draw(dt) {
    var t0 = root.performance ? performance.now() : 0, k, set = S.set;
    S.t += dt; var t = S.t;
    if (S.windT > 0) S.windT -= dt;
    S.wind += ((S.windT > 0 ? 1 : 0) - S.wind) * (1 - Math.exp(-dt * 2));
    for (k in S.figs) S.figs[k].forEach(function (f) { f.update(dt, t); if (f.lod) f.lod(S.camera.position); });
    var wa = 1 + S.wind * 9;
    (set.sway || []).forEach(function (s) { s.o.rotation[s.ax] = Math.sin(t * (0.8 + S.wind * 2.2) + s.ph) * s.amp * wa + (s.ax === 'x' ? S.wind * s.amp * 4 : S.wind * s.amp * 3); });
    (set.drift || []).forEach(function (d) { d.o.position.x = d.x + Math.sin(t * d.sp * 0.5 + d.x) * 2.5; d.o.material.opacity = 0.8; });
    (set.lamps || []).forEach(function (l) { var fl = 0.9 + Math.sin(t * 11 + l.x) * 0.06 + Math.sin(t * 23) * 0.04; l.s.scale.set(0.7 * fl, 0.7 * fl, 1); if (l.light) l.light.intensity = S.L.lamp * fl; });
    if (S.act && S.act.frame) S.act.frame(dt, t); else applyCam(dt);
    if (S.shake > 0) { S.shake -= dt; var a = S.shake * 0.16 * (set.figScale || 1); S.camera.position.x += Math.sin(t * 61) * a; S.camera.position.y += Math.cos(t * 53) * a * 0.7; }
    /* 話し手の光の輪 */
    var sp = S.speaker && S.figs[S.speaker] && S.figs[S.speaker][0], rm = S.ring.material;
    rm.opacity += ((sp ? 0.5 : 0) - rm.opacity) * (1 - Math.exp(-dt * 5));
    if (sp) { var fs = set.figScale || 1; S.ring.position.set(sp.root.position.x, sp.root.position.y + 0.03, sp.root.position.z); S.ring.scale.set(2.6 * fs, 1, 2.6 * fs); }
    S.ring.visible = rm.opacity > 0.01;
    /* 霞 */
    var fogFar = S.mistOn ? 60 * Math.max(1, (set.figScale || 1)) + S.cam.dist : 240;
    S.scene.fog.far += (fogFar - S.scene.fog.far) * (1 - Math.exp(-dt * 1.5)); S.scene.fog.near = S.mistOn ? S.cam.dist * 0.55 : 60;
    updateParticles(dt);
    S.renderer.render(S.scene, S.camera);
    updateArrows();
    S.ms = root.performance ? performance.now() - t0 : 0;
  }

  /* ---------- 遊び（wataru・kaimami） ---------- */
  function stopActivity() {
    var a = S.act; if (!a) return;
    S.act = null; a.dead = true;
    if (a.cleanup) a.cleanup();
    if (S.ui) S.ui.innerHTML = '';
    if (S.wrap) S.wrap.classList.remove('gj3-playing');
    S.fovOver = 0;
  }
  function activity(kind, cfg, cb) {
    stopActivity();
    cfg = cfg || {}; cb = cb || {};
    var A = G.S3A && G.S3A[kind], act = { dead: false, kind: kind };
    var back = S.node;
    function finish(result) {
      if (act.dead) return;
      stopActivity();
      if (back && S.el) { load(back); }
      resize();
      if (cb.done) cb.done(result);
    }
    if (!A || !S.el) { root.setTimeout(function () { if (!act.dead) { act.dead = true; if (cb.done) cb.done({ ok: true, skipped: true, kind: kind }); } }, 0); return { stop: function () { act.dead = true; } }; }
    S.act = act; S.wrap.classList.add('gj3-playing');
    try { A(ctx, act, cfg, cb, finish); }
    catch (e) { root.console && console.error('[Stage3D] activity', e); finish({ ok: true, skipped: true, kind: kind, error: String(e) }); }
    return { stop: function () { if (S.act === act) { stopActivity(); if (back && S.el) load(back); resize(); } else act.dead = true; } };
  }
  /* 遊びの部品に渡す手がかり */
  var ctx = { S: S, load: load, addFig: addFig, resize: resize, div: div, scr: scr, headOf: headOf, LIGHTS: LIGHTS, fx: fx,
    say: function (cb, m) { if (!m) return Promise.resolve(); try { return Promise.resolve(cb && cb.say ? cb.say(typeof m === 'string' ? { x: m } : m) : null); } catch (e) { return Promise.resolve(); } } };

  /* 確認用：1 コマ描いて、明るさのばらつきと描画時間を返す（tests/stage-smoke.cjs が使う） */
  function probe() {
    if (!S.scene) return null;
    var t0 = performance.now(); draw(0.016); var ms = performance.now() - t0;
    var gl = S.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, n = 24, px = new Uint8Array(4), i, j, sum = 0, sq = 0, c = 0, mn = 255, mx = 0;
    for (j = 1; j < n; j++) for (i = 1; i < n; i++) {
      gl.readPixels((w * i / n) | 0, (h * j / n) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var l = (px[0] * 2 + px[1] * 3 + px[2]) / 6; sum += l; sq += l * l; c++; if (l < mn) mn = l; if (l > mx) mx = l;
    }
    var info = S.renderer.info;
    return { ms: ms, mean: sum / c, sd: Math.sqrt(Math.max(0, sq / c - sum * sum / c / c)), min: mn, max: mx, calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, texs: info.memory.textures, figs: S.order.length };
  }

  G.Stage3D = {
    supported: supported, mount: mount, unmount: unmount, resize: resize, setQuality: setQuality, setPanel: setPanel,
    setScene: setScene, focus: focus, speak: speak, pose: pose, fx: fx, arrows: arrows, activity: activity,
    _probe: probe, _state: S
  };
})(typeof window !== 'undefined' ? window : globalThis);
