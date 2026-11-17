/* 画面（GENJI.UI）：表紙・帖の目次・文字の窓・選択肢・メーター・初登場の帯・設定・履歴・結末とふり返り・効果音。
 * ここは「描くだけ」。物語の進行と状態は engine.js が持ち、ボタン（data-gj="…"）は init に渡された handler へ返す。
 * DOM は #gj-stage（舞台）と #gj-ui（その上の文字と操作）。クラス名は gj-。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  var el = {}, handler = function () {}, typing = null, modalStack = [], timers = {}, lastFocus = null;
  var ASK = { read: '読み解け', subject: '主語は誰か', keigo: '敬意の方向', kokoro: '心情を読む', judge: '決断', waka: '和歌' };
  var BUBBLE = { hush: 'ささやき', anger: '怒り', think: '心の内', waka: '和歌', cry: '涙' };
  var NUM = '一二三四五六七八九';
  // 文字送り：一字ずつの間（ミリ秒）と、約物のあとの「間」
  var TYPE = { base: 34, pause: { '、': 150, '，': 150, '。': 300, '！': 300, '？': 300, '」': 140, '』': 140, '…': 90, '—': 60, '―': 60, '　': 90 } };

  function esc(s) { return G.esc(s); }
  function rich(s) { return G.rich(s); }
  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function charOf(id) { return (G.chars && G.chars[id]) || { name: id || '', seal: '・' }; }
  function colorOf(id) { var c = charOf(id); return (c.look && c.look.colors && c.look.colors[0]) || '#8a7a9a'; }
  function kanji(n) { return n <= 10 ? '一二三四五六七八九十'.charAt(n - 1) : n <= 19 ? '十' + NUM.charAt(n - 11) : (NUM.charAt(Math.floor(n / 10) - 1) + '十' + (n % 10 ? NUM.charAt(n % 10 - 1) : '')); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : null; }
  function bar(v, max, cls) { var p = max ? Math.max(0, Math.min(100, v / max * 100)) : 0; return '<span class="gj-bar' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><i style="width:' + p.toFixed(0) + '%"></i></span>'; }

  /* ---------- 組み立て ---------- */
  var TOOLS = [['toc', '目次', 'wide'], ['book', '原文帳', ''], ['chars', '人物', 'wide'], ['zukan', '図鑑', 'wide'], ['log', '履歴', ''], ['settings', '設定', 'wide'], ['sound', '音', 'wide']];
  function init(h) {
    handler = h || handler;
    var stage = document.getElementById('gj-stage'), ui = document.getElementById('gj-ui');
    if (!stage) { stage = document.createElement('div'); stage.id = 'gj-stage'; document.body.appendChild(stage); }
    if (!ui) { ui = document.createElement('div'); ui.id = 'gj-ui'; document.body.appendChild(ui); }
    ui.className = 'gj-ui';
    ui.innerHTML =
      '<header class="gj-top"><button type="button" class="gj-ib gj-burger" data-gj="menu" aria-label="メニュー（目次・人物・図鑑・設定・表紙へ）"><i></i></button>' +
        '<div class="gj-top-t"><b></b><span></span></div><div class="gj-meters" role="group" aria-label="メーター"></div>' +
        '<nav class="gj-tools" aria-label="帳面と設定">' + TOOLS.map(function (t) {
          return '<button type="button" class="gj-tool' + (t[2] ? ' ' + t[2] : '') + '" data-gj="' + t[0] + '"' + (t[0] === 'sound' ? ' aria-pressed="false"' : '') + '>' + (t[0] === 'sound' ? '<i class="gj-snd" aria-hidden="true"></i><span>音 切</span>' : t[1]) + '</button>';
        }).join('') + '</nav></header>' +
      '<div class="gj-notes" aria-live="polite"></div>' +
      '<div class="gj-cutin" aria-live="polite"></div><div class="gj-caption" aria-live="polite"></div>' +
      '<button type="button" class="gj-card" data-gj="card" hidden></button>' +
      '<section class="gj-panel" aria-label="本文の窓" hidden><div class="gj-panel-tools"><button type="button" class="gj-mini" data-gj="hide" title="文字を隠して舞台を見る（H キー）">文字を隠す</button></div><div class="gj-panel-body" tabindex="-1"></div><div class="gj-more" aria-hidden="true">▼ 続き</div></section>' +
      '<button type="button" class="gj-reveal" data-gj="reveal" hidden><span>文字を表示</span></button>' +
      '<main class="gj-screen" hidden></main>' +
      '<div class="gj-fade" aria-hidden="true"></div>' +
      '<div class="gj-modal" hidden><div class="gj-modal-box" role="dialog" aria-modal="true"><header><button type="button" class="gj-mini" data-gj="modalback" hidden>← 戻る</button><h3></h3><button type="button" class="gj-ib gj-x" data-gj="closemodal" aria-label="閉じる">×</button></header><div class="gj-modal-body"></div></div></div>' +
      '<div class="gj-toast" role="status" aria-live="polite"></div>';
    el = { root: ui, stage: stage, top: ui.querySelector('.gj-top'), meters: ui.querySelector('.gj-meters'), cutin: ui.querySelector('.gj-cutin'), caption: ui.querySelector('.gj-caption'),
      notes: ui.querySelector('.gj-notes'), card: ui.querySelector('.gj-card'), panel: ui.querySelector('.gj-panel'), body: ui.querySelector('.gj-panel-body'), reveal: ui.querySelector('.gj-reveal'),
      screen: ui.querySelector('.gj-screen'), fade: ui.querySelector('.gj-fade'), modal: ui.querySelector('.gj-modal'), toast: ui.querySelector('.gj-toast'), sound: ui.querySelector('[data-gj="sound"]') };
    ui.addEventListener('click', onClick);
    ui.addEventListener('input', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-st') && G.Study) G.Study.handle(t.getAttribute('data-st'), t); });
    document.addEventListener('keydown', onKey);
    el.body.addEventListener('scroll', checkMore);
    return el;
  }
  function onClick(e) {
    var t = e.target, st = t.closest('[data-st]'), b = t.closest('[data-gj]');
    if (st && !st.disabled && st.tagName !== 'INPUT') { if (G.Study) G.Study.handle(st.getAttribute('data-st'), st, e); return; }
    if (b) { if (!b.disabled) handler(b.getAttribute('data-gj'), b, e); return; }
    if (t === el.modal) return handler('closemodal', el.modal, e);
    // 本文の窓の余白を押すと送る（ボタンや原文の層の上は除く）
    if (el.panel.contains(t) && el.body.querySelector('[data-tap]') && !t.closest('button,a,input,.gj-gen')) handler('advance', el.panel, e);
  }
  function onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var tag = e.target && e.target.tagName, k = e.key;
    if (k === 'Escape') { if (!el.modal.hidden) handler('closemodal'); else if (!el.reveal.hidden) handler('reveal'); return; }
    if (!el.modal.hidden || !el.screen.hidden) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag || '')) return;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      if (tag === 'BUTTON' || tag === 'A') return;              // フォーカスのあるボタンは、そのまま押される
      e.preventDefault(); handler('advance');
    } else if (/^[1-9]$/.test(k)) {
      var opts = el.body.querySelectorAll('.gj-opt'), o = opts[+k - 1];
      if (o && !o.disabled && !el.panel.hidden) { e.preventDefault(); press(o); o.click(); }
    } else if (k === 'h' || k === 'H') handler(el.reveal.hidden ? 'hide' : 'reveal');
    else if ((k === 'l' || k === 'L') && el.screen.hidden) handler('log');
  }
  /** キーで選んだときも、押した手応えを見せる。 */
  function press(b) { if (reduced()) return; b.classList.add('gj-press'); setTimeout(function () { b.classList.remove('gj-press'); }, 160); }
  function checkMore() {
    var b = el.body, more = b.scrollHeight - b.clientHeight - b.scrollTop > 6;
    el.panel.classList.toggle('gj-has-more', more);
  }
  function setBody(html, cls) {
    stopTyping();
    el.panel.hidden = false;
    el.panel.className = 'gj-panel' + (cls ? ' ' + cls : '');
    el.body.innerHTML = html;
    el.body.scrollTop = 0;
    checkMore();
    return el.body;
  }
  function focusNext() {
    var b = el.body.querySelector('.gj-next');
    if (b && b.focus) try { b.focus({ preventScroll: true }); } catch (e) {}
  }
  function nav(action, label, left) {
    return '<div class="gj-nav">' + (left || '<span class="gj-taphint">タップ／Enter で次へ</span>') + '<button type="button" class="gj-btn gold gj-next" data-gj="' + action + '">' + (label || '次へ') + '<i class="gj-next-a" aria-hidden="true"></i></button></div>';
  }

  /* ---------- 設定の反映 ---------- */
  function applySettings(s) {
    var c = el.root.classList, d = document.documentElement.classList;
    d.toggle('gj-big', !!s.big);
    d.toggle('gj-noruby', s.ruby === false);
    c.toggle('gj-classroom', s.classroom !== false);
    Sound.on = !!s.sound;
    if (el.sound) { el.sound.setAttribute('aria-pressed', String(!!s.sound)); el.sound.querySelector('span').textContent = s.sound ? '音 入' : '音 切'; el.sound.title = s.sound ? '効果音を切る' : '効果音を入れる'; }
  }

  /* ---------- 上の帯・メーター ---------- */
  function top(info) {
    el.top.querySelector('.gj-top-t b').textContent = info ? info.ch : '';
    var a = info ? String(info.act || '') : '', sp = a.split(/[　\s]+/);
    el.top.querySelector('.gj-top-t span').innerHTML = sp.length > 1 ? '<em>' + esc(sp[0]) + '</em>' + esc(sp.slice(1).join(' ')) : esc(a);
  }
  function meters(list, classroom) {
    el.meters.innerHTML = (list || []).map(function (m) {
      var span = (m.max - m.min) || 1, p = Math.max(0, Math.min(100, (m.val - m.min) / span * 100));
      return '<button type="button" class="gj-meter t-' + esc(m.tone || 'good') + '" data-gj="meter" data-id="' + esc(m.id) + '" title="' + esc(m.name + '：' + (m.desc || '')) + '" aria-label="' + esc(m.name + ' ' + m.val + '／' + m.max) + '">' +
        '<span>' + esc(m.name) + '</span><b><i style="width:' + p.toFixed(0) + '%"></i></b><em>' + m.val + '</em></button>';
    }).join('');
    el.meters.classList.toggle('ref', !!classroom);
  }
  function bumpMeter(id, delta) {
    var m = el.meters.querySelector('[data-id="' + id + '"]');
    if (!m || reduced()) return;
    m.classList.remove('bump', 'up', 'down'); void m.offsetWidth; m.classList.add('bump', delta < 0 ? 'down' : 'up');
  }
  /** メーターが動いた：どれが・どちらへ・なぜ、を小さな札で一瞬だけ見せる。 */
  function meterNote(items, reason) {
    if (!items || !items.length || !el.notes) return;
    var n = document.createElement('div');
    n.className = 'gj-note';
    n.innerHTML = items.map(function (x) {
      return '<span class="gj-note-m t-' + esc(x.tone || 'good') + '"><b>' + esc(x.name) + '</b><em>' + (x.delta > 0 ? '＋' : '−') + Math.abs(x.delta) + '</em><i aria-hidden="true">' + (x.delta > 0 ? '▲' : '▼') + '</i></span>';
    }).join('') + (reason ? '<small>' + esc(reason) + '</small>' : '');
    el.notes.appendChild(n);
    while (el.notes.children.length > 3) el.notes.removeChild(el.notes.firstChild);
    setTimeout(function () { n.classList.add('out'); }, 2800);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3400);
  }

  /* ---------- 表紙（帖が増えても並ぶ） ---------- */
  function screen(html, cls) {
    stopTyping();
    el.screen.hidden = false;
    el.screen.className = 'gj-screen ' + (cls || '');
    el.screen.innerHTML = html;
    el.screen.scrollTop = 0;
    el.root.classList.add('gj-at-screen');
    el.panel.hidden = true; el.card.hidden = true; el.reveal.hidden = true;
    el.root.classList.remove('gj-text-hidden');
    var h = el.screen.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) {} }
  }
  function hideScreen() { el.screen.hidden = true; el.screen.innerHTML = ''; el.root.classList.remove('gj-at-screen'); }
  function modeSwitch(classroom) {
    return '<div class="gj-mode" role="group" aria-label="学習モード">' +
      '<button type="button" class="gj-seg" data-gj="mode" data-v="1" aria-pressed="' + !!classroom + '"><b><i class="gj-seg-d" aria-hidden="true"></i>授業モード</b><small>全段を開ける・誤答はヒントで読み直し</small></button>' +
      '<button type="button" class="gj-seg" data-gj="mode" data-v="0" aria-pressed="' + !classroom + '"><b><i class="gj-seg-d" aria-hidden="true"></i>挑戦モード</b><small>メーターが物語に効く・異聞の結末も</small></button></div>';
  }
  function kumo() {
    // 金雲（すやり霞）の飾り。表紙と札で使う
    return '<svg class="gj-kumo" viewBox="0 0 320 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 Q20 8 46 16 Q60 4 86 12 Q104 2 128 14 L196 14 Q214 4 236 12 Q258 0 280 12 Q300 6 320 18 L320 28 Q296 38 270 30 Q252 40 226 30 L128 30 Q108 40 86 30 Q64 38 44 30 Q20 38 0 30 Z"/></svg>';
  }
  function title(m) {
    var k = '<div class="gj-title"><div class="gj-title-head">' + kumo() + '<p class="gj-title-kicker">古典探究　読みながら、舞台に立つ</p><h1><ruby>源氏物語<rt>げんじものがたり</rt></ruby></h1>' +
      '<p class="gj-title-lead">帖を選んで、物語の中へ。要所で原文に立ち止まり、<wbr>主語と敬語を手がかりに読み解きます。</p><div class="gj-kasane" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>';
    if (m.last) k += '<button type="button" class="gj-resume" data-gj="continue" data-ch="' + esc(m.last.id) + '"><span class="gj-resume-k">しおり</span><span class="gj-resume-b"><b>続きから　' + esc(m.last.title) + '</b><small>' + esc(m.last.where || '') + '</small></span><i class="gj-next-a" aria-hidden="true"></i></button>';
    k += '<h2 class="gj-h">学習モード<small>' + (m.classroom ? '授業で使うときはこちら。全段を自由に開けます' : '一人で物語を通すときに') + '</small></h2>' + modeSwitch(m.classroom);
    k += '<h2 class="gj-h">帖を選ぶ<small>' + m.chapters.length + ' 帖</small></h2>';
    if (!m.chapters.length) k += '<p class="gj-empty">帖のデータがまだ読み込まれていません。</p>';
    k += '<div class="gj-chapters">' + m.chapters.map(function (c) {
      var done = c.total && c.cleared >= c.total;
      return '<button type="button" class="gj-chap' + (done ? ' done' : '') + '" data-gj="chapter" data-ch="' + esc(c.id) + '" style="--c:' + esc(c.color || '#7d4f9e') + '">' +
        '<span class="gj-chap-t">' + esc(c.title) + '</span>' +
        '<span class="gj-chap-no">第' + kanji(c.no || 1) + '帖' + (c.hasSave ? '<i class="gj-chip-s">途中</i>' : '') + (done ? '<i class="gj-chip-s done">読了</i>' : '') + '</span>' +
        '<span class="gj-chap-b"><b>' + esc(c.sub || '') + '</b><small>' + esc(c.povNote || '') + '</small>' +
        '<span class="gj-chap-p">' + (c.total ? bar(c.cleared, c.total) + '<em>段 ' + c.cleared + '／' + c.total + '</em>' : '') + (c.rate != null ? '<em>読解 ' + c.rate + '％</em>' : '') + (c.endings ? '<em>結末 ' + c.endings + '</em>' : '') + '</span></span></button>';
    }).join('') + '</div>';
    k += '<div class="gj-title-foot"><button type="button" class="gj-btn" data-gj="zukan">図鑑</button><button type="button" class="gj-btn" data-gj="howto">遊び方</button><button type="button" class="gj-btn" data-gj="settings">設定</button></div>' +
      '<p class="gj-title-note">記録はこの端末のブラウザにだけ保存されます。原文の引用は紫の明朝、創作の地の文・台詞は墨色で区別しています。</p></div>';
    screen(k, 'gj-s-title');
  }
  function chapter(m) {
    var c = m.ch, nAct = 0;
    var k = '<div class="gj-chapter"><button type="button" class="gj-mini" data-gj="title">← 表紙へ</button>' +
      '<div class="gj-chapter-head">' + kumo() + '<span class="gj-chap-no">第' + kanji(c.no || 1) + '帖</span><h1>' + esc(c.title) + '</h1><p class="gj-chapter-sub">' + esc(c.sub || '') + '</p></div>' +
      '<p class="gj-pov">' + (G.Study ? G.Study.sealHTML(c.pov) : '') + esc(c.povNote || '') + '</p>' +
      '<p class="gj-intro">' + rich(c.intro || '') + '</p><div class="gj-chapter-go">' +
      (m.hasSave ? '<button type="button" class="gj-btn gold" data-gj="continue" data-ch="' + esc(c.id) + '">続きから<small>' + esc(m.where || '') + '</small></button>' : '') +
      '<button type="button" class="gj-btn' + (m.hasSave ? '' : ' gold') + '" data-gj="start" data-ch="' + esc(c.id) + '">はじめから読む</button></div>' +
      '<h2 class="gj-h">目次<small>' + (m.classroom ? '授業モード：どの段からでも開けます' : '挑戦モード：前の段を読むと次が開きます') + '</small></h2><ol class="gj-acts">' + m.acts.map(function (a) {
        var t = String(a.title || ''), sp = t.split(/[　\s]+/), head = sp.length > 1 ? sp[0] : '', name = sp.length > 1 ? sp.slice(1).join(' ') : t;
        if (head) nAct++;
        var st = a.here ? '<i class="gj-st here">しおり</i>' : a.cleared ? '<i class="gj-st done">読了</i>' : a.open ? '' : '<i class="gj-st lock">前の段を読むと開く</i>';
        return '<li><button type="button" class="gj-act' + (a.cleared ? ' done' : '') + (a.here ? ' here' : '') + '" data-gj="jump" data-ch="' + esc(c.id) + '" data-act="' + esc(a.id) + '"' + (a.open ? '' : ' disabled') + '>' +
          '<span class="gj-act-n">' + esc(head || '・') + '</span><b>' + esc(name) + '</b>' +
          '<span class="gj-act-m">' + (a.scope ? '<i class="gj-scope">' + esc(a.scope) + '</i>' : '') + (a.minutes ? '<small>約' + a.minutes + '分</small>' : '') +
          (a.q ? '<small class="gj-act-r">読解 ' + pct(a.ok, a.q) + '％</small>' : '') + st + '</span></button></li>';
      }).join('') + '</ol>' +
      '<div class="gj-title-foot"><button type="button" class="gj-btn" data-gj="book" data-ch="' + esc(c.id) + '">原文帳</button><button type="button" class="gj-btn" data-gj="chars" data-ch="' + esc(c.id) + '">人物</button><button type="button" class="gj-btn" data-gj="zukan">図鑑</button></div>' +
      (m.endings && m.endings.length ? '<p class="gj-title-note">見た結末：' + m.endings.map(esc).join('、') + '</p>' : '') + '</div>';
    screen(k, 'gj-s-chapter');
  }
  /** 結末とふり返り。授業のまとめに使えるよう、コピーと印刷ができる。 */
  function ending(m) {
    var e = m.ending || {}, rate = pct(m.ok, m.q);
    var k = '<div class="gj-end"><div class="gj-end-head">' + kumo() + '<p class="gj-end-kind ' + esc(e.kind || 'true') + '">' + (e.kind === 'ibun' ? '異聞の結末' : e.kind ? '物語の結末' : '読了') + '</p>' +
      '<h1>' + rich(e.title || m.ch.title) + '</h1><p class="gj-end-ch">' + esc(m.ch.title) + '　' + esc(m.ch.sub || '') + '</p></div><div class="gj-end-x">' + rich(e.x || '') + '</div>' +
      '<div class="gj-end-stats"><div class="main"><small>読解率（一度目の答え）</small><b>' + (rate == null ? '—' : rate + '<s>％</s>') + '</b><span>' + (m.q ? m.ok + '／' + m.q + ' 問' : '設問なし') + '</span></div>' +
      '<div><small>綴じた原文</small><b>' + m.bound + '<s>／' + m.genTotal + '</s></b><span>段</span></div>' +
      (m.meters || []).map(function (x) { return '<div class="t-' + esc(x.tone || 'good') + '"><small>' + esc(x.name) + '</small><b>' + x.val + '<s>／' + x.max + '</s></b>' + bar(x.val - (x.min || 0), (x.max - (x.min || 0)) || 1) + '</div>'; }).join('') + '</div>';
    if (m.acts && m.acts.some(function (a) { return a.q; })) k += '<h2 class="gj-h">段ごとの読解<small>一度目の答えで数えます</small></h2><ul class="gj-end-acts">' + m.acts.filter(function (a) { return a.q; }).map(function (a) {
      return '<li><span>' + esc(a.title) + '</span>' + bar(a.ok, a.q) + '<b>' + a.ok + '／' + a.q + '</b></li>';
    }).join('') + '</ul>';
    if (m.picks && m.picks.length) k += '<h2 class="gj-h">あなたの読みと決断<small>○ 一度目で読めた　△ 読み直した　◇ 決断</small></h2><ol class="gj-picks">' + m.picks.map(function (p) {
      var c = p.k === 'judge' ? 'judge' : p.ok ? 'ok' : 'ng';
      return '<li class="' + c + '"><i class="gj-pk" aria-label="' + (c === 'ok' ? '一度目で正しく読めた' : c === 'ng' ? '読み直した' : '決断') + '">' + (c === 'ok' ? '○' : c === 'ng' ? '△' : '◇') + '</i><div><small>' + esc(ASK[p.k] || '') + '</small><p>' + esc(p.q) + '</p><b>' + esc(p.a) + '</b>' + (p.k !== 'judge' && !p.ok && p.right ? '<span>本文の読み：' + esc(p.right) + '</span>' : '') + '</div></li>';
    }).join('') + '</ol>';
    if (m.furikaeri && m.furikaeri.length) k += '<h2 class="gj-h">ふり返り<small>話し合ってみよう・書いてみよう</small></h2><ol class="gj-furikaeri">' + m.furikaeri.map(function (f) { return '<li><p>' + rich(f) + '</p><div class="gj-write" aria-hidden="true"></div></li>'; }).join('') + '</ol>';
    k += '<div class="gj-end-out"><button type="button" class="gj-btn" data-gj="copy">学習記録をコピー</button><button type="button" class="gj-btn" data-gj="print">印刷する</button><span class="gj-title-note">ノートや提出用の文書に貼りつけられます。</span></div>';
    k += '<div class="gj-title-foot"><button type="button" class="gj-btn gold" data-gj="chapter" data-ch="' + esc(m.ch.id) + '">目次へ</button><button type="button" class="gj-btn" data-gj="book" data-ch="' + esc(m.ch.id) + '">原文帳で読み直す</button><button type="button" class="gj-btn" data-gj="title">表紙へ</button></div></div>';
    screen(k, 'gj-s-end');
    ending.last = m;
  }
  /** 学習記録（コピー用のプレーンテキスト）。 */
  function summaryText(m) {
    m = m || ending.last; if (!m) return '';
    var e = m.ending || {}, L = [], rate = pct(m.ok, m.q);
    L.push('源氏物語「' + m.ch.title + '」　学習記録');
    L.push('結末：' + G.plain(e.title || '読了') + (e.kind === 'ibun' ? '（異聞）' : ''));
    L.push('読解率（一度目の答え）：' + (rate == null ? '—' : rate + '％（' + m.ok + '／' + m.q + '問）') + '　綴じた原文：' + m.bound + '／' + m.genTotal + '段');
    (m.acts || []).filter(function (a) { return a.q; }).forEach(function (a) { L.push('　' + G.plain(a.title) + '：' + a.ok + '／' + a.q); });
    if (m.picks && m.picks.length) {
      L.push('', '■ わたしの読みと決断');
      m.picks.forEach(function (p, i) {
        var mk = p.k === 'judge' ? '◇' : p.ok ? '○' : '△';
        L.push((i + 1) + '. ' + mk + '［' + (ASK[p.k] || '') + '］' + p.q, '　→ ' + p.a + (p.k !== 'judge' && !p.ok && p.right ? '（本文の読み：' + p.right + '）' : ''));
      });
    }
    if (m.furikaeri && m.furikaeri.length) {
      L.push('', '■ ふり返りの問い');
      m.furikaeri.forEach(function (f, i) { L.push((i + 1) + '. ' + G.plain(f), '　わたしの考え：', ''); });
    }
    return L.join('\n');
  }
  function copyText(text) {
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(t);
      return ok;
    }
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        return root.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
      }
    } catch (e) {}
    return Promise.resolve(fallback());
  }

  /* ---------- 文字の窓：台詞 ---------- */
  function speakerHTML(w, povId, extra) {
    if (!w) return extra ? '<div class="gj-who none">' + extra + '</div>' : '';
    var id = w === 'you' && povId ? povId : w, c = charOf(id), me = w === 'you' || (povId && w === povId);
    return '<div class="gj-who" style="--c:' + esc(colorOf(id)) + '">' + (G.Study ? G.Study.sealHTML(id) : '') + '<b>' + esc(c.name) + '</b>' + (me ? '<small class="gj-you">あなた</small>' : '') + (extra || '') + '</div>';
  }
  function stopTyping() { if (typing) { clearTimeout(typing.id); typing = null; } }
  function cue() { var n = el.body.querySelector('.gj-text'); if (n && !n.querySelector('.gj-cue')) n.insertAdjacentHTML('beforeend', '<i class="gj-cue" aria-hidden="true">▼</i>'); el.panel.classList.add('gj-typed'); }
  /** 文字送りの途中なら全文を出して true を返す。 */
  function finishTyping() {
    if (!typing) return false;
    var t = typing; stopTyping();
    t.node.innerHTML = t.html;
    cue(); checkMore();
    return true;
  }
  function typeUnits(node, us, html) {
    var i = 0;
    node.classList.add('gj-typing');
    function tick() {
      if (!typing) return;
      i++;
      node.innerHTML = G.Study.unitsHTML(us, i) + '<span class="gj-caret" aria-hidden="true"></span>';
      if (i >= us.length) { stopTyping(); node.innerHTML = html; node.classList.remove('gj-typing'); cue(); checkMore(); return; }
      var u = us[i - 1], wait = TYPE.base + (TYPE.pause[u.b] || 0) + (u.r ? 20 : 0);
      if (node.scrollHeight > 0 && i % 12 === 0) checkMore();
      typing.id = setTimeout(tick, wait);
    }
    typing = { node: node, units: us, html: html, id: setTimeout(tick, 60) };
  }
  /** 和歌を上の句・下の句の二行に組む。文の中の「…」から歌を探し、拍の見積もりで分ける。 */
  function wakaSplit(x) {
    var s = String(x || ''), a = s.indexOf('「'), b = s.indexOf('」', a + 1);
    if (a < 0 || b < 0) return null;
    var inner = s.slice(a + 1, b), tail = '', sp = inner.indexOf('　');
    if (sp > 0) { tail = inner.slice(sp + 1); inner = inner.slice(0, sp); }
    var us = G.Study.units(inner);
    if (us.length < 18 || us.length > 48 || /[、。！？]/.test(G.plain(inner))) return null;
    var small = /[ゃゅょャュョぁぃぅぇぉ]/, hira = /[ぁ-ゖ]/, kanjiRe = /[一-龠々〆ヵヶ]/, parts = 'にをはもぞやかてばどのへと';
    var mora = [], sum = 0;
    us.forEach(function (u) { sum += u.r ? String(u.r).replace(/[ゃゅょャュョぁぃぅぇぉ]/g, '').length : small.test(u.b) ? 0 : kanjiRe.test(u.b) ? 2 : 1; mora.push(sum); });
    var target = 17 * sum / 31, best = -1, bestD = 99;
    for (var i = 4; i < us.length - 5; i++) {
      var prev = us[i], next = us[i + 1];
      if (!next || (!prev.r && kanjiRe.test(prev.b) && hira.test(next.b) && !next.r) || small.test(next.b)) continue;
      var d = Math.abs(mora[i] - target) - (parts.indexOf(prev.b) >= 0 && !prev.r ? .35 : 0);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > 2.2) return null;
    return { lead: s.slice(0, a), kami: us.slice(0, best + 1), shimo: us.slice(best + 1), tail: tail, after: s.slice(b + 1) };
  }
  function say(m) {
    var narr = !m.w, gen = m.src === 'gen';
    var cls = 'gj-say' + (gen ? ' gen' : '') + (narr ? ' narr' : ' line') + (m.b ? ' b-' + m.b : '');
    var tags = (gen ? '<span class="gj-tag gen" title="原文そのままの引用">原文</span>' : '') + (m.b && BUBBLE[m.b] ? '<span class="gj-tag bub b-' + m.b + '">' + BUBBLE[m.b] + '</span>' : '') + (m.label ? '<span class="gj-tag note">' + esc(m.label) + '</span>' : '');
    var wk = m.b === 'waka' ? wakaSplit(m.x) : null;
    setBody('<div class="' + cls + '" data-tap="1">' + speakerHTML(m.w, m.pov, tags) + '<div class="gj-text" lang="ja"></div></div>' + nav('next'), 'gj-p-say' + (narr ? ' gj-p-narr' : ''));
    var node = el.body.querySelector('.gj-text');
    if (wk) {
      var U = G.Study.unitsHTML;
      node.innerHTML = (wk.lead ? '<span class="gj-waka-lead">' + rich(wk.lead) + '</span>' : '') +
        '<span class="gj-waka"><span class="gj-waka-l">' + U(wk.kami) + '</span><span class="gj-waka-l shimo">' + U(wk.shimo) + '</span></span>' +
        (wk.tail ? '<span class="gj-waka-tail">' + rich(wk.tail) + '</span>' : '') + (wk.after ? '<span class="gj-waka-after">' + rich(wk.after) + '</span>' : '');
      if (!reduced() && !m.instant) node.classList.add('gj-waka-in');
      cue(); checkMore(); focusNext();
      return;
    }
    var us = G.Study.units(m.x), html = G.Study.unitsHTML(us);
    if (m.instant || reduced() || us.length < 3) { node.innerHTML = html; cue(); checkMore(); }
    else typeUnits(node, us, html);
    focusNext();
  }
  function gen(ch, g) {
    setBody(G.Study.genHTML(ch, g, { compact: true }) + nav('next', '原文帳に綴じて次へ', '<span class="gj-taphint">綴じた段は、上の「原文帳」でいつでも読めます</span>'), 'gj-p-gen');
    focusNext();
  }

  /* ---------- 文字の窓：問い ---------- */
  function optHTML(n, o, i, k) {
    var inner = n.k === 'subject' && o.c
      ? (G.Study ? G.Study.plate(o.c) : esc(charOf(o.c).name)) + (o.x ? '<span class="gj-opt-x">' + rich(o.x) + '</span>' : '')
      : '<span class="gj-opt-x">' + rich(o.x) + '</span>';
    return '<button type="button" class="gj-opt" data-gj="pick" data-i="' + i + '"' + (n.k === 'subject' && o.c ? ' style="--c:' + esc(colorOf(o.c)) + '"' : '') + '><span class="gj-opt-n">' + NUM.charAt(k) + '</span>' + inner + '<span class="gj-opt-m" aria-hidden="true"></span></button>';
  }
  function legendHTML() {
    var K = (G.Study && G.Study.keigoName) || { sonkei: '尊敬', kenjo: '謙譲', teinei: '丁寧' };
    return '<div class="gj-legend" aria-label="敬語の色">' + Object.keys(K).map(function (k) { return '<span class="k-' + k + '"><i></i>' + K[k] + '</span>'; }).join('') + '<small>矢印は「敬う人 → 敬われる人」</small></div>';
  }
  function ask(n, m) {
    var k = '<div class="gj-ask k-' + esc(n.k) + (n.stem ? ' has-stem' : '') + '"><div class="gj-ask-h"><span class="gj-tag k-' + esc(n.k) + '">' + (ASK[n.k] || '問い') + '</span>' +
      (n.w ? speakerHTML(n.w, m.pov) : '') + '<p class="gj-ask-q">' + rich(n.q) + '</p></div>' +
      (n.stem ? '<div class="gj-stem-wrap"><span class="gj-stem-k">問う原文</span><div class="gj-stem" lang="ja">' + rich(n.stem) + '</div></div>' : '') +
      '<div class="gj-ask-main">' + (n.k === 'keigo' ? legendHTML() : '') + '<div class="gj-opts' + (n.k === 'subject' ? ' subject' : '') + '">' + m.order.map(function (i, kk) { return optHTML(n, n.o[i], i, kk); }).join('') + '</div>' +
      '<div class="gj-fb-slot"></div>' +
      (n.hint ? '<div class="gj-hint" hidden><b>着眼点</b><p>' + rich(n.hint) + '</p></div>' : '') +
      '<div class="gj-nav gj-ask-nav">' + (n.hint ? '<button type="button" class="gj-btn gj-hint-b" data-gj="hint"><i aria-hidden="true">？</i>ヒント（着眼点）</button>' : '<span></span>') +
      '<span class="gj-keyhint">' + (n.k === 'judge' ? 'あなたなら、どうする？　' : '') + '1〜' + m.order.length + ' キーでも選べます</span></div></div></div>';
    setBody(k, 'gj-p-ask' + (n.k === 'judge' ? ' gj-p-judge' : ''));
    if (m.hinted) showHint();
    if (m.wrong && m.wrong.length) askRetry(n, m.wrong);
    else { var f = el.body.querySelector('.gj-opt'); if (f && f.focus && !('ontouchstart' in root)) try { f.focus({ preventScroll: true }); } catch (e) {} }
  }
  function showHint() {
    var h = el.body.querySelector('.gj-hint'); if (!h) return;
    h.hidden = false;
    if (!reduced()) { h.classList.remove('gj-in'); void h.offsetWidth; h.classList.add('gj-in'); }
    var b = el.body.querySelector('[data-gj="hint"]'); if (b) { b.innerHTML = '<i aria-hidden="true">？</i>着眼点を見ている'; b.classList.add('on'); }
    if (h.scrollIntoView) h.scrollIntoView({ block: 'nearest' });
    checkMore();
  }
  /** 授業モードの一度目：答えは見せず、選んだ札を閉じてヒントを出す。 */
  function askRetry(n, wrong) {
    wrong.forEach(function (i) { var b = el.body.querySelector('.gj-opt[data-i="' + i + '"]'); if (b) { b.disabled = true; b.classList.add('ng', 'tried'); } });
    var slot = el.body.querySelector('.gj-fb-slot');
    if (slot) slot.innerHTML = '<div class="gj-fb retry" role="status"><div class="gj-fb-h"><i class="gj-fb-i" aria-hidden="true">↺</i>もう一度、本文に戻ろう</div><p>' + (n.stem ? '問う原文の【しるし】のある語を、もう一度読みましょう。' : '') + (n.hint ? '下の着眼点を手がかりに、' : '') + '残りの選択肢から選び直してください。</p></div>';
    sfx('retry');
    showHint();
    var first = el.body.querySelector('.gj-opt:not([disabled])');
    if (first && first.focus) try { first.focus({ preventScroll: true }); } catch (e) {}
  }
  /** 解説を読みやすく：長い文は二文ずつの段落に分ける。 */
  function expHTML(x) {
    var s = String(x || '');
    if (G.plain(s).length < 110) return '<p class="gj-exp">' + rich(s) + '</p>';
    // 「。」のあとで切る（閉じ括弧が続くときはその後ろで）。古い Safari のため後読みの正規表現は使わない
    var parts = [], cur = '';
    for (var i = 0; i < s.length; i++) { cur += s.charAt(i); if (s.charAt(i) === '。' && !/[」』）]/.test(s.charAt(i + 1))) { parts.push(cur); cur = ''; } }
    if (cur) parts.push(cur);
    var out = [], buf = '';
    parts.forEach(function (p, i) { buf += p; if (i % 2 === 1) { out.push(buf); buf = ''; } });
    if (buf) out.push(buf);
    return '<div class="gj-exp">' + out.map(function (p) { return '<p>' + rich(p) + '</p>'; }).join('') + '</div>';
  }
  /** 答えたあと：正解と解説。keigo は「誰から誰へ・どの種類」の帯を出す。 */
  function askFeedback(n, m) {
    Array.prototype.forEach.call(el.body.querySelectorAll('.gj-opt'), function (b) {
      var i = +b.getAttribute('data-i');
      b.disabled = true;
      if (n.o[i].ok) b.classList.add('ok'); else if (i === m.choice) b.classList.add('ng');
      if (i === m.choice) b.classList.add('chosen');
    });
    var opts = el.body.querySelector('.gj-opts'); if (opts) opts.classList.add('answered');
    var head = m.ok ? (m.retried ? '読み直して、たどり着いた' : n.k === 'kokoro' ? '本文に根拠のある読み' : '読み解いた') : '本文の読みを確かめよう';
    var icon = m.ok ? (m.retried ? '○' : '◎') : '△';
    var right = n.o.filter(function (o) { return o.ok; }).map(function (o) { return o.c && !o.x ? charOf(o.c).name : G.plain(o.x || ''); });
    var k = '<div class="gj-fb ' + (m.ok ? 'ok' : 'ng') + (m.retried ? ' retried' : '') + '" role="status"><div class="gj-fb-h"><i class="gj-fb-i" aria-hidden="true">' + icon + '</i>' + head + '</div>' +
      (!m.ok && right.length ? '<p class="gj-fb-right">本文の読み：<b>' + right.map(esc).join('／') + '</b></p>' : '') +
      (n.arrows && n.arrows.length && G.Study ? '<div class="gj-arrows"><span class="gj-arrows-k">敬意の方向</span>' + n.arrows.map(G.Study.arrowHTML).join('') + '</div>' : '') +
      (n.exp ? expHTML(n.exp) : '') +
      (n.bunpo && G.bunpo && G.bunpo[n.bunpo] ? '<button type="button" class="gj-chip link" data-st="zukan" data-id="' + esc(n.bunpo) + '"><i class="gj-zk-i" aria-hidden="true">図</i>図鑑で確かめる：' + rich(G.bunpo[n.bunpo].title) + '</button>' : '') + '</div>';
    var slot = el.body.querySelector('.gj-fb-slot');
    if (slot) slot.innerHTML = k;
    var hint = el.body.querySelector('.gj-hint'); if (hint) hint.hidden = true;
    var navEl = el.body.querySelector('.gj-ask-nav');
    if (navEl) navEl.outerHTML = nav('next', '次へ', '<span class="gj-taphint">解説を読んだら、次へ</span>');
    var fb = el.body.querySelector('.gj-fb');
    if (fb && fb.scrollIntoView) {
      // 選んだ札が見えるところまで戻し、その下に解説が続くことを示す
      var ch = el.body.querySelector('.gj-opt.chosen') || fb;
      ch.scrollIntoView({ block: 'nearest' });
      setTimeout(function () { if (fb.isConnected) { fb.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); checkMore(); } }, reduced() ? 0 : 420);
    }
    sfx(m.ok ? 'ok' : 'ng');
    checkMore(); focusNext();
  }
  /** DOM の遊び（並べ・結び）を入れる場所。 */
  function gameHost() { return setBody('<div class="gj-game-host"></div>', 'gj-p-game').firstChild; }
  function panel(on) { el.panel.hidden = !on; if (!on) stopTyping(); }
  function textHidden(on) {
    el.root.classList.toggle('gj-text-hidden', !!on);
    el.reveal.hidden = !on;
  }

  /* ---------- 帯・札・暗転・お知らせ ---------- */
  function cutin(id, info) {
    clearTimeout(timers.cutin); clearTimeout(timers.cutout);
    if (!info) { el.cutin.classList.remove('on', 'out'); return; }
    el.cutin.style.setProperty('--c', colorOf(id));
    el.cutin.innerHTML = (G.Study ? G.Study.sealHTML(id) : '') + '<div class="gj-cutin-b"><span class="gj-cutin-k">初登場</span><b>' + esc(info[0] || '') + '</b><small>' + esc(info[1] || '') + '</small>' + (info[2] ? '<small class="alt">' + esc(info[2]) + '</small>' : '') + '<p>' + esc(info[3] || '') + '</p></div>';
    el.cutin.classList.remove('out'); void el.cutin.offsetWidth;
    el.cutin.classList.add('on');
    var hold = reduced() ? 3400 : 4200;
    timers.cutin = setTimeout(function () { el.cutin.classList.add('out'); timers.cutout = setTimeout(function () { el.cutin.classList.remove('on', 'out'); }, 500); }, hold);
  }
  function caption(text) {
    clearTimeout(timers.caption);
    if (!text) { el.caption.classList.remove('on'); return; }
    el.caption.innerHTML = '<i aria-hidden="true"></i><span>' + rich(text) + '</span>';
    el.caption.classList.remove('on'); void el.caption.offsetWidth;
    el.caption.classList.add('on');
    timers.caption = setTimeout(function () { el.caption.classList.remove('on'); }, 5200);
  }
  function card(info) {
    if (!info) { el.card.hidden = true; return; }
    var t = String(info.title || ''), m = /^(序|終|第[一二三四五六七八九十〇]+段)[　\s]+(.+)$/.exec(G.plain(t));
    el.card.hidden = false;
    el.card.innerHTML = '<span class="gj-card-in">' + kumo() + (m ? '<span class="gj-card-no">' + esc(m[1]) + '</span><b>' + rich(t.replace(/^(序|終|第[一二三四五六七八九十〇]+段)[　\s]+/, '')) + '</b>' : '<b>' + rich(t) + '</b>') +
      (info.sub ? '<small>' + rich(info.sub) + '</small>' : '') + '<i class="gj-card-go">タップ／Enter で始める</i></span>';
    el.panel.hidden = true;
    sfx('page');
    try { el.card.focus({ preventScroll: true }); } catch (e) {}
  }
  function fade(kind, fn) {
    if (!kind || reduced()) return fn();
    el.fade.className = 'gj-fade on k-' + kind;
    setTimeout(function () { try { fn(); } finally { setTimeout(function () { el.fade.className = 'gj-fade'; }, 80); } }, 420);
  }
  function toast(text) {
    clearTimeout(timers.toast);
    el.toast.textContent = text; el.toast.classList.add('on');
    timers.toast = setTimeout(function () { el.toast.classList.remove('on'); }, 2600);
  }

  /* ---------- モーダル（原文帳・図鑑・設定など）。push で重ね、閉じると一つ戻る ---------- */
  function drawModal() {
    var m = modalStack[modalStack.length - 1];
    var was = !el.modal.hidden;
    el.modal.hidden = !m;
    el.root.classList.toggle('gj-modal-open', !!m);
    if (!m) { if (was && lastFocus && lastFocus.isConnected) try { lastFocus.focus({ preventScroll: true }); } catch (e) {} return; }
    if (!was) lastFocus = document.activeElement;
    el.modal.querySelector('h3').textContent = m.title || '';
    el.modal.querySelector('.gj-modal-box').className = 'gj-modal-box' + (m.wide ? ' wide' : '') + ' m-' + (m.id || 'x');
    var body = el.modal.querySelector('.gj-modal-body');
    body.innerHTML = m.html;
    el.modal.querySelector('[data-gj="modalback"]').hidden = modalStack.length < 2;
    body.scrollTop = m.scroll === 'end' ? body.scrollHeight : 0;
    var x = el.modal.querySelector('[data-gj="closemodal"]');
    try { x.focus({ preventScroll: true }); } catch (e) {}
  }
  function modal(m) {
    if (!m.push || (modalStack.length && modalStack[modalStack.length - 1].id === m.id)) modalStack = m.push ? modalStack.slice(0, -1) : [];
    modalStack.push(m);
    drawModal();
  }
  function modalBody(html, keepScroll) {
    var m = modalStack[modalStack.length - 1]; if (!m) return;
    var body = el.modal.querySelector('.gj-modal-body'), y = body.scrollTop;
    m.html = html; body.innerHTML = html;
    if (keepScroll) body.scrollTop = y;
  }
  function modalId() { var m = modalStack[modalStack.length - 1]; return m ? m.id : null; }
  function modalBack() { modalStack.pop(); drawModal(); }
  function closeModal() { modalStack = []; drawModal(); }

  function menuHTML(m) {
    m = m || {};
    var B = function (a, t, s) { return '<button type="button" class="gj-mbtn" data-gj="' + a + '"><b>' + t + '</b><small>' + s + '</small></button>'; };
    return '<div class="gj-menu">' +
      B('toc', '目次', '段をえらぶ') + B('book', '原文帳', '綴じた原文を重ね読み') + B('log', '履歴', 'これまでの文と答え') + B('chars', '人物', '登場人物と襲の色') +
      B('zukan', '図鑑', '敬語・助動詞・しきたり') + B('settings', '設定', '文字・舞台・モード') +
      '<button type="button" class="gj-mbtn" data-gj="sound" aria-pressed="' + !!m.sound + '"><b>効果音　' + (m.sound ? '入' : '切') + '</b><small>押すと' + (m.sound ? '切ります' : '入れます') + '</small></button>' + B('howto', '遊び方', '操作とキー') +
      '<button type="button" class="gj-mbtn wide" data-gj="quit"><b>表紙へ戻る</b><small>続きは自動で保存されます</small></button></div>' +
      (m.rate ? '<p class="gj-title-note gj-menu-rate">' + esc(m.rate) + '</p>' : '');
  }
  function sw(key, on, label, note) {
    return '<button type="button" class="gj-switch" role="switch" aria-checked="' + !!on + '" data-gj="set" data-k="' + key + '"><span><b>' + label + '</b><small>' + note + '</small></span><i></i></button>';
  }
  function settingsHTML(s, info) {
    return '<div class="gj-settings"><h4 class="gj-sh">学習モード</h4>' + modeSwitch(s.classroom !== false) +
      '<h4 class="gj-sh">舞台</h4><div class="gj-mode" role="group" aria-label="舞台"><button type="button" class="gj-seg" data-gj="view" data-v="3d" aria-pressed="' + (s.view !== '2d') + '"' + (info.can3d ? '' : ' disabled') + '><b><i class="gj-seg-d" aria-hidden="true"></i>3D の舞台</b><small>' + (info.can3d ? '人物と殿舎を立体で' : 'この端末では使えません') + '</small></button>' +
      '<button type="button" class="gj-seg" data-gj="view" data-v="2d" aria-pressed="' + (s.view === '2d') + '"><b><i class="gj-seg-d" aria-hidden="true"></i>絵巻（軽量）</b><small>古い端末・電池の節約に</small></button></div>' +
      '<h4 class="gj-sh">文字と音</h4>' +
      sw('big', s.big, '文字を大きく', '教室のスクリーンに映すとき') + sw('instant', s.instant, '文字をすぐに表示', '一文字ずつ出さない') +
      sw('ruby', s.ruby !== false, 'ルビを表示', '読みがなを出す') + sw('sound', s.sound, '効果音', '琴・鐘・風・雨など（はじめは切）') +
      '<p class="gj-title-note">キー操作：Enter／スペース＝次へ　1〜4＝選択肢　H＝文字を隠す　L＝履歴　Esc＝閉じる</p>' +
      '<button type="button" class="gj-btn danger" data-gj="erase">記録を消す</button><p class="gj-title-note">今の舞台：' + esc(info.now) + '</p></div>';
  }
  function howtoHTML() {
    var R = function (k, x) { return '<div><dt>' + k + '</dt><dd>' + x + '</dd></div>'; };
    return '<dl class="gj-howto">' +
      R('進める', '文字の窓をタップ、または「次へ」。Enter・スペースキーでも進みます。文字が出ている途中で押すと、まず全文が出ます。') +
      R('原文と創作', '<span class="gj-tag gen">原文</span> の札がついた紫の文は、源氏物語の原文そのままの引用です。墨色の地の文・台詞は、場面をつかむための創作です。') +
      R('問い', '解釈・主語・敬意の方向・心情・決断・和歌の 6 種類。授業モードでは、一度目に読み違えると答えは出さず、着眼点（ヒント）を見て選び直せます。読解率は一度目の答えで数えます。') +
      R('敬意の方向', '<span class="gj-legend inline"><span class="k-sonkei"><i></i>尊敬</span><span class="k-kenjo"><i></i>謙譲</span><span class="k-teinei"><i></i>丁寧</span></span> 答えたあと、舞台の人物の間に矢印が出ます。') +
      R('帳面', '上の「原文帳」に読んだ原文が綴じられます。現代語訳・語注・品詞分解・敬語の層を重ねて読めます。「履歴」で、これまでの文と自分の答えを読み返せます。') +
      R('舞台を見る', '「文字を隠す」（H キー）で、文字の窓を隠して舞台だけを眺められます。') +
      R('キー', 'Enter／スペース＝次へ　1〜4＝選択肢　H＝文字を隠す　L＝履歴　Esc＝閉じる') + '</dl>';
  }
  /** 履歴：これまでの文と、自分の答え。log の一行は [話し手, 文, 原文か, 種類?, 正誤?]。 */
  function logHTML(log, pov) {
    if (!log || !log.length) return '<p class="gj-empty">まだ何もありません。物語を読み進めると、ここに文と答えが残ります。</p>';
    return '<div class="gj-log">' + log.map(function (l) {
      var kind = l[3];
      if (kind === 'act') return '<h4 class="gj-log-act">' + rich(l[1]) + '</h4>';
      if (kind === 'q') return '<div class="gj-log-q"><span class="gj-tag k-' + esc(l[4] || 'read') + '">' + esc(ASK[l[4]] || '問い') + '</span>' + rich(l[1]) + '</div>';
      if (kind === 'a') {
        var c = l[4] === 1 ? 'ok' : l[4] === 2 ? 're' : l[4] === 0 ? 'ng' : 'judge';
        return '<div class="gj-log-a ' + c + '"><i aria-hidden="true">' + ({ ok: '◎', re: '○', ng: '△', judge: '◇' })[c] + '</i><span>' + (c === 'judge' ? 'あなたの決断' : 'あなたの答え') + '</span><b>' + rich(l[1]) + '</b><small>' + ({ ok: '読み解いた', re: '読み直して正解', ng: '読み違え', judge: '' })[c] + '</small></div>';
      }
      var w = l[0];
      return '<div class="gj-log-l' + (l[2] ? ' gen' : '') + (w ? '' : ' narr') + '">' + (w ? '<span class="gj-log-w" style="--c:' + esc(colorOf(w)) + '">' + esc(charOf(w).name) + (pov && w === pov ? '<small>あなた</small>' : '') + '</span>' : '') +
        (l[2] ? '<span class="gj-tag gen">原文</span>' : '') + '<p>' + rich(l[1]) + '</p></div>';
    }).join('') + '</div>';
  }

  /* ---------- 効果音（WebAudio の簡素な合成。未対応の名前は何もしない） ---------- */
  var Sound = { on: false, ctx: null, out: null, verb: null };
  function ac() {
    if (Sound.ctx) return Sound.ctx;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    try {
      var a = Sound.ctx = new C();
      // 全体の音量と、弱い残響（部屋の響き）
      var master = a.createGain(), comp = a.createDynamicsCompressor();
      master.gain.value = .7; master.connect(comp); comp.connect(a.destination);
      var verb = a.createConvolver(), len = Math.floor(a.sampleRate * 1.8), imp = a.createBuffer(2, len, a.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = imp.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      verb.buffer = imp;
      var wet = a.createGain(); wet.gain.value = .22; verb.connect(wet); wet.connect(master);
      Sound.out = master; Sound.verb = verb;
    } catch (e) { return null; }
    return Sound.ctx;
  }
  function dest(a, g) { g.connect(Sound.out || a.destination); if (Sound.verb) g.connect(Sound.verb); }
  function tone(a, type, f, t, peak, dec, f2) {
    var o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dec);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .012); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g); dest(a, g); o.start(t); o.stop(t + dec + .05);
  }
  /** 撥弦（琴）：倍音を重ね、高い倍音ほど早く消す。 */
  function pluck(a, f, t, peak, dec) {
    [[1, 1], [2, .42], [3, .18], [4.02, .08]].forEach(function (h, i) { tone(a, i ? 'sine' : 'triangle', f * h[0], t, peak * h[1], dec / (1 + i * .9)); });
    tone(a, 'sine', f * 1.003, t, peak * .3, dec * .9);
  }
  function noise(a, t, peak, dec, ftype, freq) {
    var n = Math.floor(a.sampleRate * dec), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = ftype; f.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dec * .3); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(f); f.connect(g); dest(a, g); s.start(t);
  }
  var SFX = {
    koto: function (a, t) { [293.7, 392, 440, 587.3, 440].forEach(function (f, i) { pluck(a, f, t + i * .2 + (i === 4 ? .25 : 0), .16, 1.6); }); },
    fue: function (a, t) { tone(a, 'sine', 880, t, .1, 1.5, 990); tone(a, 'sine', 1320, t + .5, .04, 1); noise(a, t, .02, 1.4, 'bandpass', 1800); },
    kane: function (a, t) { tone(a, 'sine', 196, t, .26, 3.2); tone(a, 'sine', 392.5, t, .1, 2.4); tone(a, 'sine', 588, t, .05, 1.6); tone(a, 'sine', 197.4, t, .12, 3); },
    suzume: function (a, t) { for (var i = 0; i < 5; i++) tone(a, 'sine', 3200 + (i % 2) * 500, t + i * .13, .06, .08, 4200); },
    kaze: function (a, t) { noise(a, t, .1, 2.4, 'bandpass', 500); noise(a, t + .6, .06, 2, 'bandpass', 760); },
    ame: function (a, t) { noise(a, t, .08, 2.6, 'highpass', 2400); },
    mushi: function (a, t) { for (var i = 0; i < 8; i++) tone(a, 'sine', 4300, t + i * .09, .035, .06); },
    ashioto: function (a, t) { for (var i = 0; i < 4; i++) noise(a, t + i * .28, .2, .09, 'lowpass', 300); },
    to: function (a, t) { noise(a, t, .26, .16, 'lowpass', 420); tone(a, 'sine', 90, t, .26, .25, 50); },
    namida: function (a, t) { tone(a, 'sine', 660, t, .08, 1.3, 440); },
    // 画面の手応え（控えめに）
    page: function (a, t) { noise(a, t, .05, .22, 'bandpass', 2600); pluck(a, 587.3, t + .06, .06, 1.2); },
    ok: function (a, t) { pluck(a, 587.3, t, .09, 1.1); pluck(a, 880, t + .12, .08, 1.4); },
    ng: function (a, t) { pluck(a, 293.7, t, .08, 1.2); },
    retry: function (a, t) { pluck(a, 440, t, .06, .9); pluck(a, 392, t + .14, .05, 1); },
    on: function (a, t) { pluck(a, 440, t, .08, 1.2); pluck(a, 587.3, t + .1, .07, 1.4); }
  };
  function sfx(name) {
    if (!Sound.on || !SFX[name]) return;
    var a = ac(); if (!a) return;
    try { if (a.state === 'suspended' && a.resume) a.resume(); SFX[name](a, a.currentTime + .02); } catch (e) {}
  }

  G.UI = {
    init: init, el: function () { return el; }, applySettings: applySettings, top: top, meters: meters, bumpMeter: bumpMeter, meterNote: meterNote,
    title: title, chapter: chapter, ending: ending, hideScreen: hideScreen, summaryText: summaryText, copyText: copyText,
    say: say, finishTyping: finishTyping, gen: gen, ask: ask, askRetry: askRetry, askFeedback: askFeedback, showHint: showHint,
    gameHost: gameHost, panel: panel, textHidden: textHidden,
    cutin: cutin, caption: caption, card: card, fade: fade, toast: toast,
    modal: modal, modalBody: modalBody, modalId: modalId, modalBack: modalBack, closeModal: closeModal,
    menuHTML: menuHTML, settingsHTML: settingsHTML, logHTML: logHTML, howtoHTML: howtoHTML, sfx: sfx, askNames: ASK, wakaSplit: wakaSplit
  };
})(typeof window !== 'undefined' ? window : globalThis);
