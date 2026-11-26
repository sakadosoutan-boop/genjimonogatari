/* 物語の進行（GENJI.Engine）：ノードを順にたどり、状態・保存・学習モードを受け持つ。
 * 画面は GENJI.UI、帳面は GENJI.Study、遊びは GENJI.Games、舞台は GENJI.stage（3D か絵巻）に任せる。
 * 舞台は docs/CONTRACT.md の API だけを呼ぶ。Stage3D が無い・例外を出すときは Stage2D に落として進み続ける。
 * 保存は localStorage['genji:v1']（使えなくても遊べる）。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  var KEY = 'genji:v1';
  var SCORED = { read: 1, subject: 1, keigo: 1, kokoro: 1, waka: 1 };   // 読解率に数える問い（judge は数えない）
  var stage3dFailed = false;
  var UI, meta, st = null, cur = null, mode = 'boot', epoch = 0;
  var IDX = {}, lastScene = null, cardNext = null, pendingSay = null, activity = null, screenNow = null, hops = 0, eraseArmed = false;

  /* ---------- 保存 ---------- */
  function blankMeta() {
    return { v: 1, settings: { view: '3d', big: false, instant: false, ruby: true, sound: false, classroom: true }, ch: {}, last: null };
  }
  function storage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function loadMeta() {
    meta = blankMeta();
    try {
      var s = storage(), raw = s && s.getItem(KEY), p = raw ? JSON.parse(raw) : null;
      if (p && typeof p === 'object') {
        if (p.settings && typeof p.settings === 'object') Object.keys(meta.settings).forEach(function (k) { if (typeof p.settings[k] === typeof meta.settings[k]) meta.settings[k] = p.settings[k]; });
        if (p.ch && typeof p.ch === 'object' && !Array.isArray(p.ch)) meta.ch = p.ch;
        if (typeof p.last === 'string') meta.last = p.last;
      }
    } catch (e) { meta = blankMeta(); }
    Object.keys(meta.ch).forEach(function (id) { chMeta(id); });
  }
  function saveMeta() {
    try { var s = storage(); if (s) s.setItem(KEY, JSON.stringify(meta)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  function chMeta(id) {
    var c = meta.ch[id];
    if (!c || typeof c !== 'object') c = meta.ch[id] = {};
    ['gen', 'cleared', 'endings', 'missed', 'stat'].forEach(function (k) { if (!c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) c[k] = {}; });
    if (!c.save || typeof c.save !== 'object') c.save = null;
    return c;
  }
  function persist() {
    if (!st) return;
    chMeta(st.ch).save = mode === 'end' ? null : st;
    meta.last = st.ch;
    saveMeta();
  }
  function classroom() { return meta.settings.classroom !== false; }

  /* ---------- 帖の索引（id のないノードは「段id#番号」で指す） ---------- */
  function index(chId) {
    var ch = G.chapters[chId];
    if (!ch) return null;
    if (IDX[chId] && IDX[chId].ch === ch) return IDX[chId];
    var ix = IDX[chId] = { ch: ch, keys: [], map: {}, first: {} };
    (ch.acts || []).forEach(function (act, ai) {
      (act.nodes || []).forEach(function (n, i) {
        var key = n.id || (act.id + '#' + i);
        if (ix.map[key]) key = act.id + '#' + i;
        ix.map[key] = { n: n, act: act, ai: ai, i: i, key: key };
        ix.keys.push(key);
        if (i === 0) ix.first[act.id] = key;
      });
    });
    return ix;
  }
  function entry(key) { var ix = st && index(st.ch); return ix && ix.map[key] || null; }
  function nextOf(key) {
    var ix = index(st.ch), e = ix.map[key];
    if (!e) return null;
    if (e.n.next && ix.map[e.n.next]) return e.n.next;
    var at = ix.keys.indexOf(key);
    return ix.keys[at + 1] || null;
  }
  function chapterNow() { return st ? G.chapters[st.ch] : null; }

  /* ---------- 状態 ---------- */
  function freshState(chId, key) {
    var ch = G.chapters[chId], ix = index(chId), m = {};
    (ch.meters || []).forEach(function (x) { m[x.id] = typeof x.init === 'number' ? x.init : (x.min || 0); });
    return { ch: chId, node: key || ix.keys[0], act: null, meters: m, flags: {}, q: 0, ok: 0, picks: [], log: [], phase: null, met: {}, hinted: {}, astat: {}, seed: Math.floor(Math.random() * 1e9) };
  }
  function hydrate(chId, saved) {
    var s = freshState(chId), ix = index(chId);
    if (!saved || typeof saved !== 'object' || !ix.map[saved.node]) return null;
    s.node = saved.node;
    ['q', 'ok', 'seed'].forEach(function (k) { if (typeof saved[k] === 'number' && isFinite(saved[k])) s[k] = saved[k]; });
    ['flags', 'met', 'hinted', 'astat'].forEach(function (k) { if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) s[k] = saved[k]; });
    if (saved.meters && typeof saved.meters === 'object') Object.keys(s.meters).forEach(function (k) { if (typeof saved.meters[k] === 'number') s.meters[k] = saved.meters[k]; });
    if (Array.isArray(saved.picks)) s.picks = saved.picks.filter(function (p) { return p && typeof p === 'object'; });
    if (Array.isArray(saved.log)) s.log = saved.log.filter(Array.isArray);
    var p = saved.phase, n = ix.map[s.node].n;
    if (p && typeof p === 'object' && p.node === s.node && (n.t === 'ask') && /^(retry|feedback|react)$/.test(p.kind)) {
      if (p.kind !== 'retry' || (Array.isArray(p.wrong) && p.wrong.every(function (i) { return n.o[i] && !n.o[i].ok; }))) s.phase = p;
    }
    return s;
  }
  function meterList() {
    var ch = chapterNow();
    return (ch.meters || []).map(function (m) { return { id: m.id, name: m.name, desc: m.desc, tone: m.tone, min: m.min || 0, max: typeof m.max === 'number' ? m.max : 10, val: st.meters[m.id] }; });
  }
  /** 選択肢やノードの効果（メーターの増減・フラグ）を当てる。reason は「なぜ動いたか」の一言（画面の小さな札に出す）。 */
  function apply(o, reason) {
    if (!o) return;
    var ch = chapterNow(), moved = [];
    if (o.fx) Object.keys(o.fx).forEach(function (k) {
      var def = (ch.meters || []).filter(function (m) { return m.id === k; })[0];
      if (!def || typeof o.fx[k] !== 'number') return;
      var max = typeof def.max === 'number' ? def.max : 10, was = st.meters[k] || 0;
      st.meters[k] = Math.max(def.min || 0, Math.min(max, was + o.fx[k]));
      var d = st.meters[k] - was;
      if (d) moved.push({ id: k, name: def.name, tone: def.tone, delta: d });
    });
    if (moved.length) {
      UI.meters(meterList(), classroom());
      moved.forEach(function (x) { UI.bumpMeter(x.id, x.delta); });
      if (UI.meterNote) UI.meterNote(moved, reason ? clip(reason, 22) : '');
    }
    if (o.set) Object.keys(o.set).forEach(function (k) { st.flags[k] = o.set[k]; });
  }
  function clip(s, n) { s = G.plain(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
  function test(n) {
    if (n.f && !st.flags[n.f]) return false;
    if (n.m && !Object.keys(n.m).every(function (k) { return (st.meters[k] || 0) >= n.m[k]; })) return false;
    return !!(n.f || n.m);
  }
  /** 履歴に一行。kind：省くと文、'act'＝段の見出し、'q'＝問い（extra＝種類）、'a'＝自分の答え（extra＝1 正・0 誤・-1 決断）。 */
  function logLine(w, x, gen, kind, extra) {
    var l = [w || '', x, gen ? 1 : 0];
    if (kind) { l.push(kind); if (extra !== undefined) l.push(extra); }
    // 再開したときに同じ見出し・問いを重ねない
    if (kind === 'q' && st.log.slice(-4).some(function (m) { return m[3] === 'q' && m[1] === x; })) return;
    st.log.push(l);
    if (st.log.length > 160) st.log.shift();
  }

  /* ---------- 舞台（3D／絵巻の切り替えと、落ちたときの受け皿） ---------- */
  function can3d() {
    if (stage3dFailed) return false;
    if (!G.Stage3D) return !!(G.loadStage3D && root.WebGLRenderingContext);
    try { return !!(typeof G.Stage3D.mount === 'function' && G.Stage3D.supported && G.Stage3D.supported()); }
    catch (e) { return false; }
  }
  function quality() {
    var small = (root.innerWidth || 1024) < 720, mem = root.navigator && root.navigator.deviceMemory;
    return small || (mem && mem <= 4) ? 'low' : 'high';
  }
  function useStage(S) {
    var host = UI.el().stage;
    if (G.stage) { try { G.stage.unmount(); } catch (e) {} }
    host.innerHTML = '';
    G.stage = S;
    if (S && S.mount(host, { quality: quality() }) === false) throw new Error('舞台を開始できませんでした');
  }
  function mountStage(want) {
    if (G.stage === want) return false;
    try { useStage(want); }
    catch (e) {
      if (want === G.Stage3D) stage3dFailed = true;
      warn('舞台を用意できませんでした。絵巻モードに切り替えます。', e);
      try { useStage(want === G.Stage2D ? null : G.Stage2D); } catch (e2) { G.stage = null; }
    }
    return true;
  }
  function withStage(ready) {
    var my = epoch;
    function proceed() {
      // 表紙に戻った、別の帖を開いた、または遊びに入った場合は舞台を奪わない。
      if (my !== epoch || activity || !st) return;
      var wanted = meta.settings.view !== '2d' && G.Stage3D && can3d() ? G.Stage3D : G.Stage2D;
      ready(mountStage(wanted));
    }
    if (meta.settings.view === '2d' || G.Stage3D || !can3d()) return proceed();
    UI.toast('3D の舞台を準備しています');
    return G.loadStage3D().catch(function (e) {
      if (stage3dFailed) return;
      stage3dFailed = true;
      warn('3D を読み込めませんでした。絵巻モードで続けます。', e);
      if (my === epoch && meta.settings.view !== '2d') UI.toast('絵巻モードで続けます');
    }).then(proceed);
  }
  function warn(msg, e) { if (root.console && root.console.warn) root.console.warn('[GENJI] ' + msg, e && e.message ? e.message : ''); }
  /** 3D が例外を出したら絵巻に落とす。成功したら true。 */
  function fallback(e) {
    if (!G.Stage2D || G.stage === G.Stage2D) return false;
    stage3dFailed = true;
    warn('3D の舞台でエラーが起きたので、絵巻モードに切り替えます。', e);
    try { useStage(G.Stage2D); if (lastScene) G.Stage2D.setScene(lastScene); } catch (e2) { G.stage = null; return false; }
    if (UI.toast) UI.toast('絵巻モードに切り替えました');
    return true;
  }
  function stg(name, a, b, c) {
    var S = G.stage;
    if (!S || typeof S[name] !== 'function') return undefined;
    try { return S[name](a, b, c); }
    catch (e) {
      if (fallback(e) && name !== 'setScene') { try { return G.stage[name](a, b, c); } catch (e2) {} }
    }
    return undefined;
  }
  function applyScene(n) {
    lastScene = n;
    var r;
    try { r = G.stage && G.stage.setScene ? G.stage.setScene(n) : null; } catch (e) { fallback(e); r = null; }
    var wait = Promise.resolve(r).catch(function (e) { fallback(e); });
    // 舞台の用意が返ってこなくても、物語は止めない
    var limit = new Promise(function (res) { setTimeout(res, 4000); });
    return Promise.race([wait, limit]);
  }
  function povId(w) { var ch = chapterNow(); return w === 'you' ? (ch && ch.pov) || null : w || null; }

  /* ---------- 進行 ---------- */
  function go(key, resuming) {
    if (!st) return;
    var e = key && entry(key);
    if (!e) return finish(null);
    if (++hops > 400) { warn('分岐が堂々めぐりになっています：' + key); return finish(null); }
    var ch = chapterNow(), cm = chMeta(st.ch);
    if (st.act && st.act !== e.act.id && !resuming) cm.cleared[st.act] = 1;      // 段を読み終えた
    if (st.act !== e.act.id && !st.log.some(function (l) { return l[3] === 'act' && l[1] === e.act.title; })) logLine('', e.act.title, 0, 'act');
    st.act = e.act.id;
    st.node = key; cur = e.n;
    if (!resuming) st.phase = null;
    UI.top({ ch: ch.title, act: e.act.title });
    var n = e.n, t = n.t || 'say';
    if (t === 'if') return go(test(n) ? n.go : (n.el || nextOf(key)));
    if (t === 'set') { apply(n); return go(nextOf(key)); }
    if (t === 'go') return go(n.to);
    hops = 0;
    if (t !== 'end') persist();
    if (t === 'scene') return doScene(n, key);
    if (t === 'say') return doSay(n);
    if (t === 'gen') return doGen(n, key);
    if (t === 'ask') return doAsk(n, key, resuming);
    if (t === 'game') return doGame(n, key);
    if (t === 'end') return finish(n.e);
    go(nextOf(key));     // 知らない種類のノードは読み飛ばす
  }
  function doScene(n, key) {
    mode = 'scene';
    var my = epoch;
    UI.panel(false); UI.cutin(null);
    stg('arrows', null);
    UI.fade(n.fade, function () {
      if (my !== epoch || !st || st.node !== key) return;
      withStage(function () {
        applyScene(n).then(function () {
          if (my !== epoch || !st || st.node !== key) return;
          if (n.caption) UI.caption(n.caption);
          if (n.card) { mode = 'card'; cardNext = nextOf(key); UI.card(n.card); }
          else go(nextOf(key));
        });
      });
    });
  }
  function meet(w) {
    var ch = chapterNow(), id = w === 'you' ? null : w;
    if (!id || !ch.cutin || !ch.cutin[id] || st.met[id]) return;
    st.met[id] = 1;
    UI.cutin(id, ch.cutin[id]);
  }
  function doSay(n) {
    mode = 'say';
    if (n.pose) Object.keys(n.pose).forEach(function (k) { stg('pose', k, n.pose[k]); });
    if (n.at) stg('focus', n.at);
    stg('speak', povId(n.w));
    if (n.fx) stg('fx', n.fx);
    if (n.sfx) UI.sfx(n.sfx);
    meet(n.w);
    logLine(povId(n.w), n.x, n.src === 'gen');
    UI.say({ w: n.w, pov: chapterNow().pov, x: n.x, src: n.src, b: n.b, instant: meta.settings.instant });
  }
  function bind(gid, quiet) {
    var ch = chapterNow(), cm = chMeta(st.ch);
    if (!G.Study.findGen(ch, gid)) return false;
    var isNew = !cm.gen[gid];
    cm.gen[gid] = 1;
    saveMeta();
    if (isNew && !quiet) UI.toast('原文帳に綴じました');
    return true;
  }
  function doGen(n, key) {
    var ch = chapterNow(), g = G.Study.findGen(ch, n.g);
    if (!g) return go(nextOf(key));
    mode = 'gen';
    stg('speak', null);
    bind(n.g, true);
    logLine('', g.text, true);
    UI.gen(ch, g);
  }

  /* ---------- 問い ---------- */
  function optLabel(o) { return o ? (o.c && !o.x ? ((G.chars[o.c] || {}).name || o.c) : G.plain(o.x || '')) : ''; }
  function askOrder(n, key) {
    return G.Games.shuffle(n.o.map(function (o, i) { return i; }), key + ':' + st.seed);
  }
  function doAsk(n, key, resuming) {
    mode = 'ask';
    stg('arrows', null);
    if (n.at) stg('focus', n.at);
    stg('speak', povId(n.w));
    meet(n.w);
    var p = st.phase;
    logLine('', n.q, 0, 'q', n.k);
    if (resuming && p && p.kind === 'react') return showReact();
    UI.ask(n, { order: askOrder(n, key), pov: chapterNow().pov, hinted: !!st.hinted[key], wrong: p && p.kind === 'retry' ? p.wrong : null });
    if (resuming && p && p.kind === 'feedback') showFeedback(n);
  }
  function showFeedback(n) {
    var p = st.phase;
    mode = 'feedback';
    UI.askFeedback(n, { choice: p.choice, ok: p.ok, retried: p.retried });
    if (n.k === 'keigo' || (n.arrows && n.arrows.length)) stg('arrows', n.arrows || null);
  }
  function showReact() {
    var p = st.phase;
    mode = 'react';
    stg('arrows', null);
    stg('speak', povId(p.rw));
    UI.say({ w: p.rw, pov: chapterNow().pov, x: p.r, instant: meta.settings.instant });
  }
  function pick(i) {
    var n = cur, key = st && st.node;
    if (mode !== 'ask' || !n || n.t !== 'ask') return;
    var o = n.o[i], p = st.phase;
    if (!o || (p && p.kind === 'retry' && p.wrong.indexOf(i) !== -1)) return;
    var to;
    if (!SCORED[n.k]) {
      // 決断：正誤を数えない。選んだ道へ進む
      st.picks.push({ k: n.k, q: G.plain(n.q), a: optLabel(o) });
      logLine(chapterNow().pov, optLabel(o), 0, 'a', -1);
      apply(o, 'あなたの決断');
      to = o.go || nextOf(key);
      if (o.r) { st.phase = { node: key, kind: 'react', after: to, r: o.r, rw: o.rw || null }; logLine(o.rw, o.r); persist(); return showReact(); }
      return go(to);
    }
    var retried = !!(p && p.kind === 'retry'), cm = chMeta(st.ch);
    if (!o.ok && classroom() && !retried) {
      // 授業モードの一度目：答えを見せず、ヒントを添えて選び直す（読解率は、この一度目で数える）
      st.phase = { node: key, kind: 'retry', wrong: [i], first: i };
      cm.missed[key] = (cm.missed[key] || 0) + 1;
      logLine(chapterNow().pov, optLabel(o), 0, 'a', 0);
      persist();
      return UI.askRetry(n, [i]);
    }
    var right = n.o.filter(function (x) { return x.ok; })[0], firstOk = !!o.ok && !retried;
    st.q++; if (firstOk) st.ok++;
    var as = st.astat[st.act] = Array.isArray(st.astat[st.act]) ? st.astat[st.act] : [0, 0];
    as[0]++; if (firstOk) as[1]++;
    cm.stat[st.act] = as.slice();
    if (!o.ok && !retried) cm.missed[key] = (cm.missed[key] || 0) + 1;
    // 授業モードで二度目も読み違えたときは、本文の読み（正解）の道で物語を進める
    var eff = classroom() && !o.ok && right ? right : o;
    apply(eff, firstOk ? '読み解いた' : '読み違えた');
    to = eff.go || nextOf(key);
    var first = retried ? n.o[p.first] : o;
    st.picks.push({ k: n.k, q: G.plain(n.q), a: optLabel(first), ok: firstOk, right: optLabel(right) });
    if (st.picks.length > 60) st.picks.shift();
    logLine(chapterNow().pov, optLabel(o), 0, 'a', o.ok ? (retried ? 2 : 1) : 0);
    st.phase = { node: key, kind: 'feedback', choice: i, ok: !!o.ok, retried: retried, after: to, r: eff.r || null, rw: eff.rw || null };
    persist();
    showFeedback(n);
  }
  function hint() {
    if (mode !== 'ask' || !cur || !cur.hint) return;
    st.hinted[st.node] = 1;
    persist();
    UI.showHint();
  }

  /* ---------- 遊び ---------- */
  function doGame(n, key) {
    mode = 'game';
    var my = epoch;
    stg('speak', null);
    if (G.Games.has(n.g)) {
      return G.Games.run(n.g, n.cfg, UI.gameHost(), { classroom: classroom(), seed: key + ':' + st.seed }).then(function (res) {
        if (my === epoch && st && st.node === key) endGame(n, key, res, false);
      });
    }
    UI.panel(false);
    var finished = false;
    var cb = {
      pov: chapterNow().pov,
      say: function (m) {
        if (!m || !m.x || my !== epoch) return Promise.resolve();
        return new Promise(function (res) {
          mode = 'actsay';
          if (m.w) meet(m.w);
          logLine(povId(m.w), m.x, m.src === 'gen');
          pendingSay = res;
          UI.say({ w: m.w, pov: cb.pov, x: m.x, src: m.src, instant: meta.settings.instant });
        });
      },
      meter: function (fx) { if (my === epoch && st) { apply({ fx: fx }); persist(); } },
      gen: function (gid) { if (my === epoch && st) bind(gid); },
      done: function (result) {
        if (finished || my !== epoch || !st || st.node !== key) return;
        finished = true;
        endGame(n, key, result, true);
      }
    };
    function start() { return G.stage && typeof G.stage.activity === 'function' ? G.stage.activity(n.g, n.cfg, cb) : null; }
    try { activity = start(); if (!activity && !finished) throw new Error('activity がありません'); }
    catch (e) {
      // 3D の遊びが始められないときは、絵巻の簡易版で必ず完走できるようにする
      if (fallback(e)) { try { activity = start(); } catch (e2) { activity = null; } }
      if (!activity && !finished) cb.done({ ok: true, skipped: true });
    }
  }
  function endGame(n, key, result, staged) {
    var ok = !(result === false || (result && result.ok === false));
    activity = null; pendingSay = null;
    var to = (ok || classroom()) ? (n.go || nextOf(key)) : (n.el || nextOf(key));   // 授業モードでは遊びに失敗はない
    if (!staged || !lastScene) return go(to);
    var my = epoch;
    mode = 'scene';
    UI.panel(false);
    applyScene(lastScene).then(function () { if (my === epoch && st && st.node === key) go(to); });
  }
  function stopActivity() {
    if (activity && activity.stop) { try { activity.stop(); } catch (e) {} }
    activity = null;
    if (pendingSay) { var r = pendingSay; pendingSay = null; r(); }
  }

  /** Enter・Space・タップ・「次へ」。 */
  function advance() {
    if (!st) return;
    if (mode === 'card') { UI.card(null); var to = cardNext; cardNext = null; return go(to); }
    if (mode === 'say' || mode === 'react' || mode === 'actsay') { if (UI.finishTyping()) return; }
    if (mode === 'say' || mode === 'gen') return go(nextOf(st.node));
    if (mode === 'react') return go(st.phase.after);
    if (mode === 'feedback') {
      var p = st.phase;
      stg('arrows', null);
      if (p.r) { st.phase = { node: st.node, kind: 'react', after: p.after, r: p.r, rw: p.rw }; logLine(p.rw, p.r); persist(); return showReact(); }
      return go(p.after);
    }
    if (mode === 'actsay' && pendingSay) {
      var res = pendingSay; pendingSay = null;
      mode = 'game';
      UI.panel(false);          // 次の文が来なければ、舞台の操作に戻る
      res();
    }
  }

  /* ---------- 結末 ---------- */
  function finish(eid) {
    var ch = chapterNow(), cm = chMeta(st.ch), e = eid && ch.endings ? ch.endings[eid] : null;
    stopActivity();
    stg('arrows', null); stg('speak', null);
    if (st.act) cm.cleared[st.act] = 1;
    if (eid && e) cm.endings[eid] = 1;
    mode = 'end';
    cm.save = null;
    cm.q = (cm.q || 0) + st.q; cm.ok = (cm.ok || 0) + st.ok;
    saveMeta();
    screenNow = 'end';
    UI.ending({ ch: ch, ending: e, q: st.q, ok: st.ok, picks: st.picks, meters: meterList(), furikaeri: ch.furikaeri || [],
      acts: (ch.acts || []).map(function (a) { var x = st.astat[a.id]; return { id: a.id, title: a.title, q: x ? x[0] : 0, ok: x ? x[1] : 0 }; }),
      bound: (ch.genbun || []).filter(function (g) { return cm.gen[g.id]; }).length, genTotal: (ch.genbun || []).length });
  }

  /* ---------- 表紙・目次・開始 ---------- */
  function whereOf(chId) {
    var cm = chMeta(chId), ix = index(chId), e = cm.save && ix && ix.map[cm.save.node];
    return e ? e.act.title : '';
  }
  function hasSave(chId) { var cm = chMeta(chId), ix = index(chId); return !!(cm.save && ix && ix.map[cm.save.node]); }
  function leave() {
    epoch++;
    stopActivity();
    if (root.GJ_BGM) root.GJ_BGM.stop();
    if (st && mode !== 'end' && mode !== 'title') persist();
    UI.closeModal(); UI.card(null); UI.cutin(null); UI.caption(null); UI.textHidden(false);
    stg('arrows', null);
  }
  function showTitle() {
    leave();
    mode = 'title'; screenNow = 'title'; st = null; cur = null;
    var last = meta.last && G.chapters[meta.last] && hasSave(meta.last) ? { id: meta.last, title: G.chapters[meta.last].title, where: whereOf(meta.last) } : null;
    UI.title({ classroom: classroom(), last: last, chapters: (G.chapterOrder || []).map(function (id) {
      var c = G.chapters[id], cm = chMeta(id), pc = G.chars && G.chars[c.pov];
      return { id: id, no: c.no, title: c.title, sub: c.sub, povNote: c.povNote, total: (c.acts || []).length, color: pc && pc.look && pc.look.colors ? pc.look.colors[0] : null,
        rate: cm.q ? Math.round((cm.ok || 0) / cm.q * 100) : null,
        cleared: (c.acts || []).filter(function (a) { return cm.cleared[a.id]; }).length, endings: Object.keys(cm.endings).length, hasSave: hasSave(id) };
    }) });
    if (root.GJ_BGM) root.GJ_BGM.sync(meta.settings.sound);
  }
  function actOpen(ch, cm, i) { return classroom() || i === 0 || !!cm.cleared[ch.acts[i].id] || !!cm.cleared[ch.acts[i - 1].id]; }
  function showChapter(chId) {
    var ch = G.chapters[chId];
    if (!ch) return showTitle();
    leave();
    mode = 'title'; screenNow = 'chapter:' + chId; st = null; cur = null;
    var cm = chMeta(chId), ix = index(chId), here = hasSave(chId) ? ix.map[cm.save.node].act.id : null;
    UI.chapter({ ch: ch, hasSave: hasSave(chId), where: whereOf(chId), classroom: classroom(),
      acts: (ch.acts || []).map(function (a, i) {
        var x = Array.isArray(cm.stat[a.id]) ? cm.stat[a.id] : null;
        return { id: a.id, title: a.title, scope: a.scope, minutes: a.minutes, cleared: !!cm.cleared[a.id], open: actOpen(ch, cm, i), here: a.id === here, q: x ? x[0] : 0, ok: x ? x[1] : 0 };
      }),
      endings: Object.keys(cm.endings).map(function (e) { return ch.endings && ch.endings[e] ? G.plain(ch.endings[e].title) : e; }) });
  }
  function begin(state, resuming) {
    epoch++;
    st = state; cur = null; hops = 0; lastScene = null; screenNow = null;
    meta.last = st.ch;
    UI.hideScreen(); UI.closeModal();
    UI.meters(meterList(), classroom());
    mode = 'scene';
    UI.panel(false);
    return withStage(function () {
      var ix = index(st.ch), at = ix.keys.indexOf(st.node), sc = null, my = epoch;
      // 途中から始めるときは、その前の場面をまず舞台に組む
      for (var i = at; i >= 0 && !sc; i--) if (ix.map[ix.keys[i]].n.t === 'scene') sc = ix.map[ix.keys[i]].n;
      if (sc && ix.map[st.node].n !== sc) return applyScene(sc).then(function () { if (my === epoch && st) go(st.node, resuming); });
      go(st.node, resuming);
    });
  }
  function start(chId, actId) {
    var ix = index(chId);
    if (!ix || !ix.keys.length) return;
    var ch = G.chapters[chId], cm = chMeta(chId), key = ix.keys[0];
    if (actId) {
      var ai = (ch.acts || []).map(function (a) { return a.id; }).indexOf(actId);
      if (ai < 0 || !actOpen(ch, cm, ai) || !ix.first[actId]) return;
      key = ix.first[actId];
    }
    leave();
    begin(freshState(chId, key), false);
  }
  function continueSave(chId) {
    chId = chId || meta.last;
    var s = chId && G.chapters[chId] ? hydrate(chId, chMeta(chId).save) : null;
    if (!s) return chId && G.chapters[chId] ? start(chId) : showTitle();
    leave();
    begin(s, true);
  }

  /* ---------- 設定・メニュー ---------- */
  function stageName() { return G.stage && G.stage === G.Stage3D ? '3D' : G.stage ? '絵巻（軽量）' : 'なし'; }
  function openSettings(push) {
    eraseArmed = false;
    UI.modal({ id: 'settings', title: '設定', html: UI.settingsHTML(meta.settings, { can3d: can3d(), now: stageName() }), push: push });
  }
  function refresh() {
    UI.applySettings(meta.settings);
    saveMeta();
    if (UI.modalId() === 'settings') UI.modalBody(UI.settingsHTML(meta.settings, { can3d: can3d(), now: stageName() }));
    else if (screenNow === 'title') showTitle();
    if (st) UI.meters(meterList(), classroom());
  }
  function setMode(on) {
    meta.settings.classroom = !!on;
    refresh();
    if (screenNow && screenNow.indexOf('chapter:') === 0 && UI.modalId() !== 'settings') showChapter(screenNow.slice(8));
  }
  function setView(v) {
    meta.settings.view = v === '2d' ? '2d' : '3d';
    refresh();
    // 進行中の遊びは、その舞台で最後まで続ける。
    if (st && lastScene && mode !== 'scene' && mode !== 'end' && !activity) withStage(function (changed) {
      if (changed) applyScene(lastScene);
      if (UI.modalId() === 'settings') refresh();
    });
  }
  var ACT = {
    advance: advance, next: advance, card: advance,
    pick: function (b) { pick(+b.getAttribute('data-i')); },
    hint: hint,
    title: showTitle,
    chapter: function (b) { showChapter(b.getAttribute('data-ch')); },
    start: function (b) { start(b.getAttribute('data-ch')); },
    jump: function (b) { start(b.getAttribute('data-ch'), b.getAttribute('data-act')); },
    'continue': function (b) { continueSave(b.getAttribute('data-ch')); },
    quit: showTitle,
    toc: function () { if (st) showChapter(st.ch); },
    menu: function () { UI.modal({ id: 'menu', title: st ? chapterNow().title + '　' + (entry(st.node) ? entry(st.node).act.title : '') : 'メニュー', html: UI.menuHTML({ sound: meta.settings.sound, rate: st && st.q ? 'この読みの読解率 ' + Math.round(st.ok / st.q * 100) + '％（' + st.ok + '／' + st.q + ' 問・一度目の答え）' : '' }) }); },
    book: function (b) { var id = (b && b.getAttribute('data-ch')) || (st && st.ch); if (id) G.Study.openBook(id, cur && cur.t === 'gen' ? cur.g : null); },
    zukan: function () { G.Study.openZukan(); },
    chars: function (b) { var id = (b && b.getAttribute('data-ch')) || (st && st.ch); if (id) G.Study.openChars(id); },
    log: function () { UI.modal({ id: 'log', title: '履歴　これまでの文と答え', html: UI.logHTML(st ? st.log : [], chapterNow() && chapterNow().pov), push: UI.modalId() === 'menu', wide: true, scroll: 'end' }); },
    howto: function () { UI.modal({ id: 'howto', title: '遊び方', html: UI.howtoHTML(), push: !!UI.modalId() }); },
    sound: function () {
      meta.settings.sound = !meta.settings.sound;
      refresh();
      if (screenNow === 'title' && root.GJ_BGM) root.GJ_BGM.sync(meta.settings.sound);
      if (UI.modalId() === 'menu') ACT.menu();
      if (meta.settings.sound) UI.sfx('on');
      UI.toast(meta.settings.sound ? '効果音を入れました' : '効果音を切りました');
    },
    copy: function () {
      UI.copyText(UI.summaryText()).then(function (ok) { UI.toast(ok ? '学習記録をコピーしました' : 'コピーできませんでした。印刷を使ってください'); });
    },
    print: function () { try { root.print(); } catch (e) {} },
    settings: function () { openSettings(UI.modalId() === 'menu'); },
    set: function (b) { var k = b.getAttribute('data-k'); if (k in meta.settings) { meta.settings[k] = !meta.settings[k]; refresh(); if (k === 'sound') { if (meta.settings.sound) UI.sfx('on'); if (screenNow === 'title' && root.GJ_BGM) root.GJ_BGM.sync(meta.settings.sound); } } },
    mode: function (b) { setMode(b.getAttribute('data-v') === '1'); },
    view: function (b) { setView(b.getAttribute('data-v')); },
    erase: function (b) {
      if (!eraseArmed) { eraseArmed = true; b.textContent = 'もう一度押すと、すべての記録を消します'; return; }
      var s = meta.settings; meta = blankMeta(); meta.settings = s; saveMeta();
      UI.closeModal(); showTitle(); UI.toast('記録を消しました');
    },
    meter: function (b) { var m = meterList().filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (m) UI.toast(m.name + '：' + (m.desc || '') + (classroom() ? '（授業モードでは参考）' : '')); },
    hide: function () { UI.textHidden(true); },
    reveal: function () { UI.textHidden(false); },
    closemodal: function () { UI.closeModal(); },
    modalback: function () { UI.modalBack(); }
  };
  function handle(name, el, ev) { if (ACT[name]) ACT[name](el, ev); }

  /** 場面リンク：#帖id または #帖id/段id */
  function fromHash() {
    var h = String((root.location && root.location.hash) || '').replace(/^#/, '').split('/');
    if (!h[0] || !G.chapters[h[0]]) return false;
    if (h[1] && index(h[0]).first[h[1]]) { start(h[0], h[1]); return !!st; }
    showChapter(h[0]);
    return true;
  }
  function boot() {
    UI = G.UI;
    UI.init(handle);
    loadMeta();
    UI.applySettings(meta.settings);
    mountStage(G.Stage2D);
    root.addEventListener('resize', function () { stg('resize'); });
    root.addEventListener('pagehide', function () { if (st && mode !== 'end') persist(); });
    if (!fromHash()) showTitle();
    return G.Engine;
  }

  G.Engine = {
    KEY: KEY, boot: boot, start: start, continueSave: continueSave, title: showTitle, chapter: showChapter, advance: advance, pick: pick,
    /** 原文帳が使う：その帖で開けてよい段。 */
    bookInfo: function (chId) { return { all: classroom(), bound: chMeta(chId).gen }; },
    stageName: stageName,
    _state: function () { return st; }, _mode: function () { return mode; }, _meta: function () { return meta; }, _cur: function () { return cur; },
    _go: function (key) { if (st) { stopActivity(); epoch++; go(key); } }, _index: index
  };
  if (root.document && !root.GENJI_NO_AUTOBOOT) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
