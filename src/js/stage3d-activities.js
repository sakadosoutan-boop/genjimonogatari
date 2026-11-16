/* 3D の遊び —— 渡殿を渡る（wataru）と垣間見（kaimami）。window.GENJI.S3A[kind](ctx, act, cfg, cb, finish)
 * stage3d.js の activity() から呼ばれる。act.frame(dt, t) を置くと、その間のカメラはここが動かす。
 * 操作のボタンは ctx.S.ui（文字の窓より上の領域）の中に gj3- クラスで作る。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {}, T = root.THREE, PI = Math.PI;
  var A = G.S3A = G.S3A || {};
  if (!T) return;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* 画面をなぞって見回す。返り値の off() で外す。onDrag(dx, dy) は画面の幅に対する割合 */
  function dragLook(S, onDrag) {
    var cv = S.cv, id = null, lx = 0, ly = 0;
    function down(e) { id = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(id); } catch (x) {} }
    function move(e) { if (e.pointerId !== id) return; onDrag((e.clientX - lx) / Math.max(1, S.w), (e.clientY - ly) / Math.max(1, S.h)); lx = e.clientX; ly = e.clientY; e.preventDefault(); }
    function up(e) { if (e.pointerId === id) id = null; }
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    return function () { cv.style.touchAction = ''; cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); };
  }
  function keys(map) {
    function kd(e) { if (map[e.key]) { map[e.key](true, e); } }
    function ku(e) { if (map[e.key]) { map[e.key](false, e); } }
    root.addEventListener('keydown', kd); root.addEventListener('keyup', ku);
    return function () { root.removeEventListener('keydown', kd); root.removeEventListener('keyup', ku); };
  }
  function button(ctx, cls, html, parent) { var b = ctx.div(cls, parent, 'button'); b.type = 'button'; b.innerHTML = html; return b; }

  /* ================= 渡殿を渡る ================= */
  A.wataru = function (ctx, act, cfg, cb, finish) {
    var S = ctx.S, K = G.S3K, SETS = G.S3S, node = S.node || {};
    var narrow = cfg.stage === 'watadono';   // 廊ひとつ分を近くで歩く
    var set = ctx.load({ stage: 'kokyu', light: node.light || 'day', season: node.season || 'summer', cast: [] }, { custom: function (env) { return SETS.walk(env, cfg); }, noShadow: true });
    var P = set.path, s0 = narrow ? P.len * 0.40 : 0, s1 = narrow ? P.len * 0.74 : P.len, span = s1 - s0;
    var s = s0, yaw = 0, pitch = 0, bob = 0, blockT = 0, hold = false, auto = false, busy = true, ended = false;
    var events = (cfg.events || []).slice().sort(function (a, b) { return a.at - b.at; }), ei = 0, doors = [];
    var speed = span / (narrow ? 22 : 30);
    S.fovOver = S.w / S.h < 0.8 ? 62 : 50; ctx.resize();

    /* 小さな地図：いまどこか、あとどれだけか */
    var ui = S.ui, map = ctx.div('gj3-map gj3-plate', ui), mc = ctx.div('', map, 'canvas'), cap = ctx.div('gj3-map-cap', map);
    mc.width = 264; mc.height = 196;
    var g2 = mc.getContext('2d'), PL = SETS.PLAN, bx0 = -30, bx1 = 30, bz0 = -30, bz1 = 14, sc = Math.min(mc.width / (bx1 - bx0), mc.height / (bz1 - bz0));
    function mx(x) { return (x - bx0) * sc; } function mz(z) { return (z - bz0) * sc; }
    function drawMap() {
      g2.clearRect(0, 0, mc.width, mc.height);
      PL.halls.forEach(function (h) {
        var me = /kiritsubo|shigei/.test(h.id) || /桐壺/.test(h.name), go = /清涼殿/.test(h.name), ko = /弘徽殿/.test(h.name);
        g2.fillStyle = me ? '#c9a9d6' : go ? '#e9c46a' : ko ? '#d9534f' : '#d8cdb0'; g2.strokeStyle = '#5c3f2a'; g2.lineWidth = 1;
        g2.fillRect(mx(h.x - h.w / 2), mz(h.z - h.d / 2), h.w * sc, h.d * sc); g2.strokeRect(mx(h.x - h.w / 2), mz(h.z - h.d / 2), h.w * sc, h.d * sc);
      });
      g2.strokeStyle = 'rgba(181,67,46,.45)'; g2.lineWidth = 3; g2.setLineDash([5, 4]); g2.beginPath();
      PL.route.forEach(function (q, i) { if (i) g2.lineTo(mx(q[0]), mz(q[1])); else g2.moveTo(mx(q[0]), mz(q[1])); }); g2.stroke(); g2.setLineDash([]);
      var q = P.at(s); g2.fillStyle = '#b5432e'; g2.beginPath(); g2.arc(mx(q.x / set.SC), mz(q.z / set.SC), 6, 0, PI * 2); g2.fill();
      g2.strokeStyle = '#fff'; g2.lineWidth = 2; g2.stroke();
      var left = Math.max(0, Math.round((s1 - s) / (SETS.KEN || 3)));
      cap.innerHTML = ended ? '<b>着いた</b>' : (narrow ? '奥の戸口まで ' : '清涼殿まで ') + 'あと <b>' + left + '</b> 間';
    }
    var go = button(ctx, 'gj3-go', '進む<small>押し続ける</small>', ui);
    var au = button(ctx, 'gj3-auto gj3-plate', '自動で歩く', ui); au.setAttribute('data-a3', 'auto');
    var hint = ctx.div('gj3-hint gj3-plate', ui); hint.textContent = '「進む」を押し続けて歩く。画面をなぞると見回せる';
    var shade = ctx.div('gj3-shade', ui);
    function setHold(v) { hold = v; go.classList.toggle('gj3-on', v); if (v) hint.style.opacity = 0; }
    go.addEventListener('pointerdown', function (e) { e.preventDefault(); setHold(true); try { go.setPointerCapture(e.pointerId); } catch (x) {} });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { go.addEventListener(n, function () { setHold(false); }); });
    go.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    au.addEventListener('click', function () { auto = !auto; au.classList.toggle('gj3-on', auto); au.textContent = auto ? '止まる' : '自動で歩く'; hint.style.opacity = 0; });
    var offDrag = dragLook(S, function (dx, dy) { yaw = clamp(yaw - dx * 2.6, -1.9, 1.9); pitch = clamp(pitch - dy * 1.4, -0.5, 0.45); });
    var offKeys = keys({ ArrowUp: function (d, e) { setHold(d); e.preventDefault(); }, w: setHold, ' ': function (d, e) { if (!busy) { setHold(d); e.preventDefault(); } },
      ArrowLeft: function (d) { if (d) yaw = clamp(yaw + 0.25, -1.9, 1.9); }, ArrowRight: function (d) { if (d) yaw = clamp(yaw - 0.25, -1.9, 1.9); } });
    act.cleanup = function () { offDrag(); offKeys(); };

    /* 戸・汚れなど、その場で置くもの */
    function across(at, h, th, col, y) {
      var q = P.at(at), m = K.bx(set.dynRoot, set.wd + 0.2, h, th, K.mat(col), q.x, y, q.z);
      m.rotation.y = Math.atan2(q.dx, q.dz); return m;
    }
    function clearDoors() { doors.forEach(function (m) { set.dynRoot.remove(m); }); doors = []; shade.classList.remove('gj3-on'); }
    function stage(ev) {
      var k = ev.kind, PH = SETS.PH || 2.6;
      if (k !== 'door' && k !== 'block' && doors.length) { clearDoors(); yaw = 0; }   // 次の出来事で戸は開く
      if (k === 'door') doors.push(across(s + 4.2, PH, 0.14, '#4a2f1c', PH / 2));
      else if (k === 'block') { doors.push(across(s - 4.5, PH, 0.14, '#4a2f1c', PH / 2)); shade.classList.add('gj3-on'); yaw = PI * 0.92; }
      else if (k === 'dirt') { for (var i = 0; i < 7; i++) { var q = P.at(s + 1.6 + i * 0.55), d = K.bx(set.dynRoot, 0.5 + (i % 3) * 0.3, 0.012, 0.4 + (i % 2) * 0.3, K.mat('#3b2a1c'), q.x + q.dz * ((i % 3) - 1) * 0.7, 0.012, q.z - q.dx * ((i % 3) - 1) * 0.7); d.rotation.y = i; } pitch = -0.42; }
      else if (k === 'whisper') { yaw = (ei % 2 ? 1 : -1) * 1.1; ctx.fx('dim'); }
      else if (doors.length) { clearDoors(); yaw = 0; }
    }
    function fire(ev) {
      busy = true; setHold(false); go.disabled = true;
      stage(ev);
      if (ev.fx && cb.meter) try { cb.meter(ev.fx); } catch (x) {}
      ctx.say(cb, { w: ev.w, x: ev.x }).then(function () {
        if (act.dead) return;
        if (ev.kind === 'whisper' || ev.kind === 'dirt') { yaw = 0; pitch = 0; }
        busy = false; go.disabled = false;
      });
    }
    act.frame = function (dt) {
      var moving = !busy && !ended && (hold || auto), blocked = false;
      doors.forEach(function (m) { var q = P.at(s + 1.2); if (Math.abs(m.position.x - q.x) + Math.abs(m.position.z - q.z) < 1.4) blocked = true; });
      /* 戸に行く手をふさがれても、しばらくすると何事もなかったように開く（進めなくならないように） */
      if (blocked && !busy) { blockT += dt; if (blockT > 3.5) { clearDoors(); blockT = 0; } } else blockT = 0;
      if (moving && !blocked) { s = Math.min(s1, s + speed * dt); bob += dt * 7; }
      if (!hold && !busy) { yaw += (0 - yaw) * (1 - Math.exp(-dt * 0.6)); }
      var q = P.at(s), d = P.dir(s, 1.4), a = Math.atan2(d[0], d[1]) + yaw, cam = S.camera, eye = 1.36 + Math.sin(bob) * 0.025;
      cam.position.set(q.x, eye, q.z);
      cam.lookAt(q.x + Math.sin(a) * Math.cos(pitch), eye + Math.sin(pitch), q.z + Math.cos(a) * Math.cos(pitch));
      S.cam.t.set(q.x, 1, q.z); S.cam.dist = 8;
      drawMap();
      if (busy || ended) return;
      var f = (s - s0) / span;
      if (ei < events.length && f >= events[ei].at) { fire(events[ei++]); return; }
      if (s >= s1 - 0.001 && ei >= events.length) {
        ended = true; busy = true; go.disabled = true; clearDoors(); drawMap();
        ctx.say(cb, cfg.outro).then(function () { finish({ ok: true, kind: 'wataru' }); });
      }
    };
    drawMap();
    ctx.say(cb, cfg.intro).then(function () { if (!act.dead) busy = false; });
  };

  /* ================= 垣間見 ================= */
  A.kaimami = function (ctx, act, cfg, cb, finish) {
    var S = ctx.S, node = S.node || {}, targets = (cfg.targets || []).slice();
    var cast = (node.cast || []).filter(function (c) { var id = typeof c === 'string' ? c : c.id; return id !== 'genji' && id !== 'koremitsu'; });
    var has = {}; cast.forEach(function (c) { has[typeof c === 'string' ? c : c.id] = 1; });
    var DEF = { amagimi: { at: 'kami', pose: 'pray' }, otona: { at: 'nakaR', pose: 'sit' }, warawabe: { at: 'shimo', pose: 'stand' }, murasaki: { at: 'naka', pose: 'stand' }, shonagon: { at: 'kamiR', pose: 'sit' }, inuki: { at: 'shimoR', pose: 'stand' } };
    targets.forEach(function (t) { if (!has[t.id]) { cast.push({ id: t.id, at: (DEF[t.id] || {}).at, pose: (DEF[t.id] || {}).pose }); has[t.id] = 1; } });
    var set = ctx.load({ stage: 'soubou', light: node.light || 'dusk', season: node.season || 'spring', cast: cast }, { kaimami: true, noShadow: true });
    var fence = set.fence || { z: 6.2, eye: 1.2 };
    S.fovOver = S.w / S.h < 0.8 ? 44 : 34; ctx.resize();
    ctx.fx('mist');
    var x = 0.4, tx = 0.4, pitch = 0, tp = 0, found = {}, nFound = 0, busy = true, idle = 0, dwell = 0, cur = null, autoT = null, done = false;
    /* 走り来たる女子は、ほかの人を見つけたあとで走ってくる */
    var runner = S.figs.murasaki && targets.some(function (t) { return t.id === 'murasaki'; }) ? S.figs.murasaki[0] : null, runT = -1, runTo = null, runFrom = null;
    if (runner) { runTo = runner.root.position.clone(); var d0 = set.slots.to || [6, -0.6]; runFrom = new T.Vector3(d0[0], runTo.y, d0[1]); runner.root.visible = false; }
    function avail(t) { return !found[t.id] && S.figs[t.id] && (t.id !== 'murasaki' || !runner || runT >= 1); }

    var ui = S.ui; ctx.div('gj3-vig', ui);
    var ret = ctx.div('gj3-reticle', ui);
    ret.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><circle class="gj3-ring" cx="50" cy="50" r="46" stroke-dasharray="289" stroke-dashoffset="289"/></svg>';
    var ring = ret.querySelector('.gj3-ring');
    var note = ctx.div('gj3-note gj3-plate', ui), hint = ctx.div('gj3-hint gj3-plate', ui);
    var cl = button(ctx, 'gj3-chev gj3-l', '‹', ui), cr = button(ctx, 'gj3-chev gj3-r', '›', ui);
    var au = button(ctx, 'gj3-auto gj3-plate', '手がかり', ui); au.setAttribute('data-a3', 'auto');
    hint.textContent = '画面を左右になぞって、垣のすき間からのぞく。輪の中に人をとらえる';
    function upNote() { note.innerHTML = 'あと <b>' + (targets.length - nFound) + '</b>'; }
    upNote();
    function nearest() { var best = null, bd = 1e9; targets.forEach(function (t) { if (!avail(t)) return; var p = S.figs[t.id][0].root.position, d = Math.abs(p.x - x); if (d < bd) { bd = d; best = t; } }); return best; }
    function nudge(dir) { tx = clamp(tx + dir * 1.1, -4.2, 5.6); idle = 0; hint.style.opacity = 0; }
    cl.addEventListener('click', function () { nudge(-1); }); cr.addEventListener('click', function () { nudge(1); });
    au.addEventListener('click', function () { var t = nearest(); if (t) { autoT = t; hint.style.opacity = 0; } });
    var offDrag = dragLook(S, function (dx, dy) { tx = clamp(tx - dx * 7.5, -4.2, 5.6); tp = clamp(tp - dy * 0.8, -0.3, 0.4); idle = 0; autoT = null; hint.style.opacity = 0; });
    var offKeys = keys({ ArrowLeft: function (d) { if (d) nudge(-1); }, ArrowRight: function (d) { if (d) nudge(1); } });
    act.cleanup = function () { offDrag(); offKeys(); };
    var v = new T.Vector3();

    function discover(t) {
      busy = true; found[t.id] = 1; nFound++; upNote(); ring.setAttribute('stroke-dashoffset', 289); ret.classList.remove('gj3-hit'); autoT = null;
      if (t.gen && cb.gen) try { cb.gen(t.gen); } catch (e) {}
      ctx.say(cb, { w: 'kataribe', x: t.x, src: 'gen' })
        .then(function () { return t.yaku ? ctx.say(cb, { x: '（' + (t.label || '') + '）' + t.yaku }) : null; })
        .then(function () {
          if (act.dead) return;
          if (nFound >= targets.length) { done = true; return ctx.say(cb, cfg.outro).then(function () { finish({ ok: true, kind: 'kaimami', found: nFound }); }); }
          if (runner && runT < 0 && targets.every(function (q) { return q.id === 'murasaki' || found[q.id]; })) { runT = 0; runner.root.visible = true; runner.setPose('run'); }
          busy = false; idle = 0;
        });
    }
    act.frame = function (dt) {
      if (runner && runT >= 0 && runT < 1) {
        runT = Math.min(1, runT + dt / 2.2);
        runner.root.position.lerpVectors(runFrom, runTo, runT * runT * (3 - 2 * runT));
        if (runT >= 1) runner.setPose('stand');
      }
      var cam = S.camera, eye = fence.eye != null ? fence.eye : 1.2, cz = fence.z + 0.55;
      if (autoT && S.figs[autoT.id]) {   // 手がかり：その人の頭が輪の真ん中に来る向きへ
        var hp = ctx.headOf(autoT.id, v);
        if (hp) { tx = clamp(hp.x, -4.2, 5.6); tp = clamp(((hp.y - eye) / Math.max(0.5, cz - hp.z) * 6 + 0.25) / 6, -0.3, 0.4); }
      }
      pitch += (tp - pitch) * (1 - Math.exp(-dt * 4));
      x += (tx - x) * (1 - Math.exp(-dt * 4));
      cam.position.set(x, eye, cz);
      cam.lookAt(x, eye - 0.25 + pitch * 6, cz - 6);
      S.cam.t.set(x, 1, 0); S.cam.dist = 7;
      if (busy || done) return;
      /* 輪の中にとらえているか */
      var cx = S.w / 2, cy = S.h * (1 - S.panel) / 2, r = ret.offsetWidth * 0.62, hit = null, hd = 1e9;
      targets.forEach(function (t) {
        if (!avail(t)) return;
        var p = ctx.headOf(t.id, v); if (!p) return; var q = ctx.scr(p);
        if (q[2] > 1) return; var d = Math.sqrt(Math.pow(q[0] - cx, 2) + Math.pow(q[1] - cy, 2));
        if (d < r && d < hd) { hd = d; hit = t; }
      });
      if (hit !== cur) { cur = hit; dwell = 0; }
      ret.classList.toggle('gj3-hit', !!hit);
      if (hit) { dwell += dt; idle = 0; ring.setAttribute('stroke-dashoffset', 289 * (1 - Math.min(1, dwell / 0.9))); if (dwell >= 0.9) { discover(hit); return; } }
      else { ring.setAttribute('stroke-dashoffset', 289); idle += dt; }
      /* しばらく見つからなければ、どちらにいるかを示す */
      var n = idle > 5 ? nearest() : null, px = n ? S.figs[n.id][0].root.position.x : 0;
      cl.classList.toggle('gj3-show', !!n && px < x - 0.3); cr.classList.toggle('gj3-show', !!n && px > x + 0.3);
    };
    ctx.say(cb, cfg.intro).then(function () { if (!act.dead) busy = false; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
