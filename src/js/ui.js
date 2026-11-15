/* 画面（GENJI.UI）：表紙・帖の目次・文字の窓・選択肢・メーター・初登場の帯・設定・結末とふり返り・効果音。
 * ここは「描くだけ」。物語の進行と状態は engine.js が持ち、ボタン（data-gj="…"）は init に渡された handler へ返す。
 * DOM は #gj-stage（舞台）と #gj-ui（その上の文字と操作）。クラス名は gj-。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  var el = {}, handler = function () {}, typing = null, modalStack = [], timers = {};
  var ASK = { read: '読み解け', subject: '主語は誰か', keigo: '敬意の方向', kokoro: '心情を読む', judge: '決断', waka: '和歌' };
  var BUBBLE = { hush: 'ささやき', anger: '怒り', think: '心の内', waka: '和歌', cry: '涙' };
  var NUM = '一二三四五六七八九';

  function esc(s) { return G.esc(s); }
  function rich(s) { return G.rich(s); }
  function reduced() { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function charOf(id) { return (G.chars && G.chars[id]) || { name: id || '', seal: '・' }; }
  function $(sel) { return el.root.querySelector(sel); }
  function kanji(n) { return n <= 10 ? '一二三四五六七八九十'.charAt(n - 1) : n <= 19 ? '十' + NUM.charAt(n - 11) : (NUM.charAt(Math.floor(n / 10) - 1) + '十' + (n % 10 ? NUM.charAt(n % 10 - 1) : '')); }

  /* ---------- 組み立て ---------- */
  function init(h) {
    handler = h || handler;
    var stage = document.getElementById('gj-stage'), ui = document.getElementById('gj-ui');
    if (!stage) { stage = document.createElement('div'); stage.id = 'gj-stage'; document.body.appendChild(stage); }
    if (!ui) { ui = document.createElement('div'); ui.id = 'gj-ui'; document.body.appendChild(ui); }
    ui.className = 'gj-ui';
    ui.innerHTML =
      '<header class="gj-top"><button type="button" class="gj-ib" data-gj="menu" aria-label="メニュー">≡</button>' +
        '<div class="gj-top-t"><b></b><span></span></div><div class="gj-meters"></div>' +
        '<button type="button" class="gj-ib txt" data-gj="book">原文帳</button></header>' +
      '<div class="gj-cutin" aria-live="polite"></div><div class="gj-caption" aria-live="polite"></div>' +
      '<button type="button" class="gj-card" data-gj="card" hidden></button>' +
      '<section class="gj-panel" aria-label="本文の窓" hidden><div class="gj-panel-tools"><button type="button" class="gj-mini" data-gj="hide">文字を隠す</button></div><div class="gj-panel-body" tabindex="-1"></div><div class="gj-more" aria-hidden="true">▼ 続き</div></section>' +
      '<button type="button" class="gj-reveal" data-gj="reveal" hidden><span>文字を表示</span></button>' +
      '<main class="gj-screen" hidden></main>' +
      '<div class="gj-fade" aria-hidden="true"></div>' +
      '<div class="gj-modal" hidden><div class="gj-modal-box" role="dialog" aria-modal="true"><header><button type="button" class="gj-mini" data-gj="modalback" hidden>← 戻る</button><h3></h3><button type="button" class="gj-ib" data-gj="closemodal" aria-label="閉じる">×</button></header><div class="gj-modal-body"></div></div></div>' +
      '<div class="gj-toast" role="status" aria-live="polite"></div>';
    el = { root: ui, stage: stage, top: ui.querySelector('.gj-top'), meters: ui.querySelector('.gj-meters'), cutin: ui.querySelector('.gj-cutin'), caption: ui.querySelector('.gj-caption'),
      card: ui.querySelector('.gj-card'), panel: ui.querySelector('.gj-panel'), body: ui.querySelector('.gj-panel-body'), reveal: ui.querySelector('.gj-reveal'),
      screen: ui.querySelector('.gj-screen'), fade: ui.querySelector('.gj-fade'), modal: ui.querySelector('.gj-modal'), toast: ui.querySelector('.gj-toast') };
    ui.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    el.body.addEventListener('scroll', checkMore);
    return el;
  }
  function onClick(e) {
    var t = e.target, st = t.closest('[data-st]'), b = t.closest('[data-gj]');
    if (st && !st.disabled) { if (G.Study) G.Study.handle(st.getAttribute('data-st'), st); return; }
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
      if (o && !o.disabled) { e.preventDefault(); o.click(); }
    } else if (k === 'h' || k === 'H') handler(el.reveal.hidden ? 'hide' : 'reveal');
  }
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
    return '<div class="gj-nav">' + (left || '<span></span>') + '<button type="button" class="gj-btn gold gj-next" data-gj="' + action + '">' + (label || '次へ →') + '</button></div>';
  }

  /* ---------- 設定の反映 ---------- */
  function applySettings(s) {
    var c = el.root.classList, d = document.documentElement.classList;
    d.toggle('gj-big', !!s.big);
    d.toggle('gj-noruby', s.ruby === false);
    c.toggle('gj-classroom', s.classroom !== false);
    Sound.on = !!s.sound;
  }

  /* ---------- 上の帯・メーター ---------- */
  function top(info) {
    el.top.querySelector('.gj-top-t b').textContent = info ? info.ch : '';
    el.top.querySelector('.gj-top-t span').textContent = info ? info.act : '';
  }
  function meters(list, classroom) {
    el.meters.innerHTML = (list || []).map(function (m) {
      var span = (m.max - m.min) || 1, pct = Math.max(0, Math.min(100, (m.val - m.min) / span * 100));
      return '<button type="button" class="gj-meter t-' + esc(m.tone || 'good') + '" data-gj="meter" data-id="' + esc(m.id) + '" title="' + esc(m.desc || '') + '" aria-label="' + esc(m.name + ' ' + m.val + '／' + m.max) + '">' +
        '<span>' + esc(m.name) + '</span><b><i style="width:' + pct.toFixed(0) + '%"></i></b><em>' + m.val + '</em></button>';
    }).join('');
    el.meters.classList.toggle('ref', !!classroom);
  }
  function bumpMeter(id) {
    var m = el.meters.querySelector('[data-id="' + id + '"]');
    if (m && !reduced()) { m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
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
  }
  function hideScreen() { el.screen.hidden = true; el.screen.innerHTML = ''; el.root.classList.remove('gj-at-screen'); }
  function modeSwitch(classroom) {
    return '<div class="gj-mode" role="group" aria-label="学習モード">' +
      '<button type="button" class="gj-seg" data-gj="mode" data-v="1" aria-pressed="' + !!classroom + '"><b>授業モード</b><small>全段を開ける・ヒントで読み直せる</small></button>' +
      '<button type="button" class="gj-seg" data-gj="mode" data-v="0" aria-pressed="' + !classroom + '"><b>挑戦モード</b><small>メーターが物語に効く・異聞の結末</small></button></div>';
  }
  function title(m) {
    var k = '<div class="gj-title"><div class="gj-title-head"><p class="gj-title-kicker">古典探究　読みながら、舞台に立つ</p><h1><ruby>源氏物語<rt>げんじものがたり</rt></ruby></h1>' +
      '<p class="gj-title-lead">帖を選んで、物語の中へ。要所で原文に立ち止まり、主語と敬語を手がかりに読み解きます。</p></div>' + modeSwitch(m.classroom);
    if (m.last) k += '<button type="button" class="gj-btn gold gj-resume" data-gj="continue" data-ch="' + esc(m.last.id) + '">続きから　' + esc(m.last.title) + '<small>' + esc(m.last.where || '') + '</small></button>';
    k += '<h2 class="gj-h">帖を選ぶ</h2>';
    if (!m.chapters.length) k += '<p class="gj-empty">帖のデータがまだ読み込まれていません。</p>';
    k += '<div class="gj-chapters">' + m.chapters.map(function (c) {
      return '<button type="button" class="gj-chap" data-gj="chapter" data-ch="' + esc(c.id) + '">' +
        '<span class="gj-chap-no">第' + kanji(c.no || 1) + '帖</span><span class="gj-chap-t">' + esc(c.title) + '</span>' +
        '<span class="gj-chap-b"><b>' + esc(c.sub || '') + '</b><small>' + esc(c.povNote || '') + '</small>' +
        '<i>' + (c.total ? '読んだ段 ' + c.cleared + '／' + c.total : '') + (c.endings ? '　結末 ' + c.endings : '') + (c.hasSave ? '　・途中' : '') + '</i></span></button>';
    }).join('') + '</div>';
    k += '<div class="gj-title-foot"><button type="button" class="gj-btn" data-gj="zukan">図鑑</button><button type="button" class="gj-btn" data-gj="settings">設定</button></div>' +
      '<p class="gj-title-note">記録はこの端末のブラウザにだけ保存されます。</p></div>';
    screen(k, 'gj-s-title');
  }
  function chapter(m) {
    var c = m.ch;
    var k = '<div class="gj-chapter"><button type="button" class="gj-mini" data-gj="title">← 表紙へ</button>' +
      '<div class="gj-chapter-head"><span class="gj-chap-no">第' + kanji(c.no || 1) + '帖</span><h1>' + esc(c.title) + '</h1><p class="gj-chapter-sub">' + esc(c.sub || '') + '</p></div>' +
      '<p class="gj-pov">' + (G.Study ? G.Study.sealHTML(c.pov) : '') + esc(c.povNote || '') + '</p>' +
      '<p class="gj-intro">' + rich(c.intro || '') + '</p><div class="gj-chapter-go">' +
      (m.hasSave ? '<button type="button" class="gj-btn gold" data-gj="continue" data-ch="' + esc(c.id) + '">続きから<small>' + esc(m.where || '') + '</small></button>' : '') +
      '<button type="button" class="gj-btn' + (m.hasSave ? '' : ' gold') + '" data-gj="start" data-ch="' + esc(c.id) + '">はじめから読む</button></div>' +
      '<h2 class="gj-h">目次</h2><ol class="gj-acts">' + m.acts.map(function (a) {
        return '<li><button type="button" class="gj-act' + (a.cleared ? ' done' : '') + '" data-gj="jump" data-ch="' + esc(c.id) + '" data-act="' + esc(a.id) + '"' + (a.open ? '' : ' disabled') + '>' +
          '<b>' + esc(a.title) + '</b><span>' + (a.scope ? '<i class="gj-scope">' + esc(a.scope) + '</i>' : '') + (a.minutes ? '約' + a.minutes + '分' : '') + (a.cleared ? '　読了' : a.open ? '' : '　（前の段を読むと開く）') + '</span></button></li>';
      }).join('') + '</ol>' +
      '<div class="gj-title-foot"><button type="button" class="gj-btn" data-gj="book" data-ch="' + esc(c.id) + '">原文帳</button><button type="button" class="gj-btn" data-gj="chars" data-ch="' + esc(c.id) + '">人物</button><button type="button" class="gj-btn" data-gj="zukan">図鑑</button></div>' +
      (m.endings && m.endings.length ? '<p class="gj-title-note">見た結末：' + m.endings.map(esc).join('、') + '</p>' : '') + '</div>';
    screen(k, 'gj-s-chapter');
  }
  /** 結末とふり返り。 */
  function ending(m) {
    var e = m.ending || {}, rate = m.q ? Math.round(m.ok / m.q * 100) : null;
    var k = '<div class="gj-end"><p class="gj-end-kind ' + esc(e.kind || 'true') + '">' + (e.kind === 'ibun' ? '異聞の結末' : e.kind ? '物語の結末' : '読了') + '</p>' +
      '<h1>' + rich(e.title || m.ch.title) + '</h1><div class="gj-end-x">' + rich(e.x || '') + '</div>' +
      '<div class="gj-end-stats"><div><small>読解率（一度目の答え）</small><b>' + (rate == null ? '—' : rate + '％') + '</b><span>' + (m.q ? m.ok + '／' + m.q + ' 問' : '設問なし') + '</span></div>' +
      '<div><small>綴じた原文</small><b>' + m.bound + '／' + m.genTotal + '</b><span>段</span></div>' +
      (m.meters || []).map(function (x) { return '<div><small>' + esc(x.name) + '</small><b>' + x.val + '</b><span>／' + x.max + '</span></div>'; }).join('') + '</div>';
    if (m.picks && m.picks.length) k += '<h2 class="gj-h">あなたの読みと決断</h2><ul class="gj-picks">' + m.picks.map(function (p) {
      return '<li class="' + (p.k === 'judge' ? 'judge' : p.ok ? 'ok' : 'ng') + '"><small>' + esc(ASK[p.k] || '') + '</small><p>' + esc(p.q) + '</p><b>' + esc(p.a) + '</b>' + (p.k !== 'judge' && !p.ok && p.right ? '<span>本文の読み：' + esc(p.right) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
    if (m.furikaeri && m.furikaeri.length) k += '<h2 class="gj-h">ふり返り　—　話し合ってみよう</h2><ol class="gj-furikaeri">' + m.furikaeri.map(function (f) { return '<li>' + rich(f) + '</li>'; }).join('') + '</ol>';
    k += '<div class="gj-title-foot"><button type="button" class="gj-btn gold" data-gj="chapter" data-ch="' + esc(m.ch.id) + '">目次へ</button><button type="button" class="gj-btn" data-gj="book" data-ch="' + esc(m.ch.id) + '">原文帳で読み直す</button><button type="button" class="gj-btn" data-gj="title">表紙へ</button></div></div>';
    screen(k, 'gj-s-end');
  }

  /* ---------- 文字の窓：台詞 ---------- */
  function speakerHTML(w, povId) {
    if (!w) return '';
    var id = w === 'you' && povId ? povId : w, c = charOf(id);
    return '<div class="gj-who">' + (G.Study ? G.Study.sealHTML(id) : '') + '<b>' + esc(c.name) + '</b>' + (w === 'you' || (povId && w === povId) ? '<small>あなた</small>' : '') + '</div>';
  }
  function stopTyping() { if (typing) { clearInterval(typing.id); typing = null; } }
  /** 文字送りの途中なら全文を出して true を返す。 */
  function finishTyping() {
    if (!typing) return false;
    var t = typing; stopTyping();
    t.node.innerHTML = G.Study.unitsHTML(t.units);
    checkMore();
    return true;
  }
  function say(m) {
    var cls = 'gj-say' + (m.src === 'gen' ? ' gen' : '') + (m.w ? '' : ' narr') + (m.b ? ' b-' + m.b : '');
    setBody('<div class="' + cls + '" data-tap="1">' + speakerHTML(m.w, m.pov) +
      (m.src === 'gen' ? '<span class="gj-tag gen">原文</span>' : '') + (m.b && BUBBLE[m.b] ? '<span class="gj-tag bub">' + BUBBLE[m.b] + '</span>' : '') + (m.label ? '<span class="gj-tag note">' + esc(m.label) + '</span>' : '') +
      '<p class="gj-text" lang="ja"></p></div>' + nav('next'));
    var node = el.body.querySelector('.gj-text'), us = G.Study.units(m.x);
    if (m.instant || reduced() || us.length < 3) { node.innerHTML = G.Study.unitsHTML(us); checkMore(); }
    else {
      var i = 0;
      typing = { node: node, units: us, id: setInterval(function () {
        i += 2; node.innerHTML = G.Study.unitsHTML(us, i);
        if (i >= us.length) { stopTyping(); checkMore(); }
      }, 30) };
    }
    focusNext();
  }
  function gen(ch, g) {
    setBody(G.Study.genHTML(ch, g, { compact: true }) + nav('next', '原文帳に綴じて次へ →'), 'gj-p-gen');
    focusNext();
  }

  /* ---------- 文字の窓：問い ---------- */
  function optHTML(n, o, i, k) {
    var inner = n.k === 'subject' && o.c
      ? (G.Study ? G.Study.plate(o.c) : esc(charOf(o.c).name)) + (o.x ? '<span class="gj-opt-x">' + rich(o.x) + '</span>' : '')
      : '<span class="gj-opt-x">' + rich(o.x) + '</span>';
    return '<button type="button" class="gj-opt" data-gj="pick" data-i="' + i + '"><span class="gj-opt-n">' + NUM.charAt(k) + '</span>' + inner + '</button>';
  }
  function ask(n, m) {
    var k = '<div class="gj-ask k-' + esc(n.k) + (n.stem ? ' has-stem' : '') + '"><div class="gj-ask-h"><span class="gj-tag k-' + esc(n.k) + '">' + (ASK[n.k] || '問い') + '</span>' +
      (n.w ? speakerHTML(n.w, m.pov) : '') + '<span class="gj-ask-q">' + rich(n.q) + '</span></div>' +
      (n.stem ? '<div class="gj-stem-wrap"><div class="gj-stem" lang="ja">' + rich(n.stem) + '</div></div>' : '') +
      '<div class="gj-ask-main"><div class="gj-opts' + (n.k === 'subject' ? ' subject' : '') + '">' + m.order.map(function (i, kk) { return optHTML(n, n.o[i], i, kk); }).join('') + '</div>' +
      '<div class="gj-fb-slot"></div>' +
      (n.hint ? '<div class="gj-hint" hidden><b>着眼点</b><p>' + rich(n.hint) + '</p></div>' : '') +
      '<div class="gj-nav gj-ask-nav">' + (n.hint ? '<button type="button" class="gj-btn" data-gj="hint">ヒント（着眼点）</button>' : '<span></span>') +
      '<span class="gj-keyhint">1〜' + m.order.length + ' キーでも選べます</span></div></div></div>';
    setBody(k, 'gj-p-ask');
    if (m.hinted) showHint();
    if (m.wrong && m.wrong.length) askRetry(n, m.wrong);
  }
  function showHint() {
    var h = el.body.querySelector('.gj-hint'); if (!h) return;
    h.hidden = false;
    var b = el.body.querySelector('[data-gj="hint"]'); if (b) b.textContent = 'ヒントをもう一度見る';
    if (h.scrollIntoView) h.scrollIntoView({ block: 'nearest' });
    checkMore();
  }
  /** 授業モードの一度目：答えは見せず、選んだ札を閉じてヒントを出す。 */
  function askRetry(n, wrong) {
    wrong.forEach(function (i) { var b = el.body.querySelector('.gj-opt[data-i="' + i + '"]'); if (b) { b.disabled = true; b.classList.add('ng'); } });
    var slot = el.body.querySelector('.gj-fb-slot');
    if (slot) slot.innerHTML = '<div class="gj-fb retry" role="status"><div class="gj-fb-h">もう一度、本文に戻ろう</div><p>' + (n.hint ? '下の着眼点を手がかりに、' : '') + '残りの選択肢から選び直してください。</p></div>';
    showHint();
    var first = el.body.querySelector('.gj-opt:not([disabled])');
    if (first && first.focus) try { first.focus({ preventScroll: true }); } catch (e) {}
  }
  /** 答えたあと：正解と解説。keigo は「誰から誰へ・どの種類」の帯を出す。 */
  function askFeedback(n, m) {
    Array.prototype.forEach.call(el.body.querySelectorAll('.gj-opt'), function (b) {
      var i = +b.getAttribute('data-i');
      b.disabled = true;
      if (n.o[i].ok) b.classList.add('ok'); else if (i === m.choice) b.classList.add('ng');
      if (i === m.choice) b.classList.add('chosen');
    });
    var head = m.ok ? (m.retried ? '○ 読み直して、たどり着いた' : n.k === 'kokoro' ? '◎ 本文に根拠のある読み' : '◎ 読み解いた') : '△ 本文の読みを確かめよう';
    var right = n.o.filter(function (o) { return o.ok; }).map(function (o) { return o.c && !o.x ? charOf(o.c).name : G.plain(o.x || ''); });
    var k = '<div class="gj-fb ' + (m.ok ? 'ok' : 'ng') + '" role="status"><div class="gj-fb-h">' + head + '</div>' +
      (!m.ok && right.length ? '<p class="gj-fb-right">本文の読み：<b>' + right.map(esc).join('／') + '</b></p>' : '') +
      (n.arrows && n.arrows.length && G.Study ? '<div class="gj-arrows">' + n.arrows.map(G.Study.arrowHTML).join('') + '</div>' : '') +
      (n.exp ? '<p class="gj-exp">' + rich(n.exp) + '</p>' : '') +
      (n.bunpo && G.bunpo && G.bunpo[n.bunpo] ? '<button type="button" class="gj-chip link" data-st="zukan" data-id="' + esc(n.bunpo) + '">図鑑で確かめる：' + rich(G.bunpo[n.bunpo].title) + '</button>' : '') + '</div>';
    var slot = el.body.querySelector('.gj-fb-slot');
    if (slot) slot.innerHTML = k;
    var hint = el.body.querySelector('.gj-hint'); if (hint) hint.hidden = true;
    var navEl = el.body.querySelector('.gj-ask-nav');
    if (navEl) navEl.outerHTML = nav('next');
    var fb = el.body.querySelector('.gj-fb');
    if (fb && fb.scrollIntoView) fb.scrollIntoView({ block: 'nearest' });
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
    clearTimeout(timers.cutin);
    if (!info) { el.cutin.classList.remove('on'); return; }
    el.cutin.innerHTML = (G.Study ? G.Study.sealHTML(id) : '') + '<div><b>' + esc(info[0] || '') + '</b><small>' + esc(info[1] || '') + (info[2] ? '　／　' + esc(info[2]) : '') + '</small><p>' + esc(info[3] || '') + '</p></div>';
    el.cutin.classList.add('on');
    timers.cutin = setTimeout(function () { el.cutin.classList.remove('on'); }, reduced() ? 2600 : 3400);
  }
  function caption(text) {
    clearTimeout(timers.caption);
    if (!text) { el.caption.classList.remove('on'); return; }
    el.caption.innerHTML = rich(text);
    el.caption.classList.add('on');
    timers.caption = setTimeout(function () { el.caption.classList.remove('on'); }, 4200);
  }
  function card(info) {
    if (!info) { el.card.hidden = true; return; }
    el.card.hidden = false;
    el.card.innerHTML = '<span class="gj-card-in"><b>' + rich(info.title || '') + '</b>' + (info.sub ? '<small>' + rich(info.sub) + '</small>' : '') + '<i>タップで進む</i></span>';
    el.panel.hidden = true;
    try { el.card.focus({ preventScroll: true }); } catch (e) {}
  }
  function fade(kind, fn) {
    if (!kind || reduced()) return fn();
    el.fade.className = 'gj-fade on k-' + kind;
    setTimeout(function () { try { fn(); } finally { setTimeout(function () { el.fade.className = 'gj-fade'; }, 60); } }, 380);
  }
  function toast(text) {
    clearTimeout(timers.toast);
    el.toast.textContent = text; el.toast.classList.add('on');
    timers.toast = setTimeout(function () { el.toast.classList.remove('on'); }, 2600);
  }

  /* ---------- モーダル（原文帳・図鑑・設定など）。push で重ね、閉じると一つ戻る ---------- */
  function drawModal() {
    var m = modalStack[modalStack.length - 1];
    el.modal.hidden = !m;
    el.root.classList.toggle('gj-modal-open', !!m);
    if (!m) return;
    el.modal.querySelector('h3').textContent = m.title || '';
    el.modal.querySelector('.gj-modal-box').className = 'gj-modal-box' + (m.wide ? ' wide' : '');
    el.modal.querySelector('.gj-modal-body').innerHTML = m.html;
    el.modal.querySelector('[data-gj="modalback"]').hidden = modalStack.length < 2;
    el.modal.querySelector('.gj-modal-body').scrollTop = 0;
  }
  function modal(m) {
    if (!m.push || (modalStack.length && modalStack[modalStack.length - 1].id === m.id)) modalStack = m.push ? modalStack.slice(0, -1) : [];
    modalStack.push(m);
    drawModal();
  }
  function modalBody(html) { var m = modalStack[modalStack.length - 1]; if (m) { m.html = html; el.modal.querySelector('.gj-modal-body').innerHTML = html; } }
  function modalId() { var m = modalStack[modalStack.length - 1]; return m ? m.id : null; }
  function modalBack() { modalStack.pop(); drawModal(); }
  function closeModal() { modalStack = []; drawModal(); }

  function menuHTML(m) {
    return '<div class="gj-menu">' +
      '<button type="button" class="gj-btn" data-gj="toc">目次（段をえらぶ）</button><button type="button" class="gj-btn" data-gj="book">原文帳</button>' +
      '<button type="button" class="gj-btn" data-gj="zukan">図鑑</button><button type="button" class="gj-btn" data-gj="chars">人物</button>' +
      '<button type="button" class="gj-btn" data-gj="log">これまでの文</button><button type="button" class="gj-btn" data-gj="settings">設定</button>' +
      '<button type="button" class="gj-btn" data-gj="quit">表紙へ戻る（続きは保存されます）</button></div>' +
      (m && m.rate ? '<p class="gj-title-note">' + esc(m.rate) + '</p>' : '');
  }
  function sw(key, on, label, note) {
    return '<button type="button" class="gj-switch" role="switch" aria-checked="' + !!on + '" data-gj="set" data-k="' + key + '"><span><b>' + label + '</b><small>' + note + '</small></span><i></i></button>';
  }
  function settingsHTML(s, info) {
    return '<div class="gj-settings">' + modeSwitch(s.classroom !== false) +
      '<div class="gj-mode" role="group" aria-label="舞台"><button type="button" class="gj-seg" data-gj="view" data-v="3d" aria-pressed="' + (s.view !== '2d') + '"' + (info.can3d ? '' : ' disabled') + '><b>3D の舞台</b><small>' + (info.can3d ? '人物と殿舎を立体で' : 'この端末では使えません') + '</small></button>' +
      '<button type="button" class="gj-seg" data-gj="view" data-v="2d" aria-pressed="' + (s.view === '2d') + '"><b>絵巻（軽量）</b><small>古い端末・電池の節約に</small></button></div>' +
      sw('big', s.big, '文字を大きく', '教室のスクリーンに映すとき') + sw('instant', s.instant, '文字をすぐに表示', '一文字ずつ出さない') +
      sw('ruby', s.ruby !== false, 'ルビを表示', '読みがなを出す') + sw('sound', s.sound, '効果音', '琴・風・雨など（はじめは切）') +
      '<button type="button" class="gj-btn danger" data-gj="erase">記録を消す</button><p class="gj-title-note">今の舞台：' + esc(info.now) + '</p></div>';
  }
  function logHTML(log) {
    if (!log || !log.length) return '<p class="gj-empty">まだ何もありません。</p>';
    return '<div class="gj-log">' + log.map(function (l) { return '<p' + (l[2] ? ' class="gen"' : '') + '>' + (l[0] ? '<b>' + esc(charOf(l[0]).name) + '</b>' : '') + rich(l[1]) + '</p>'; }).join('') + '</div>';
  }

  /* ---------- 効果音（WebAudio の簡素な合成。未対応の名前は何もしない） ---------- */
  var Sound = { on: false, ctx: null };
  function ac() {
    if (Sound.ctx) return Sound.ctx;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    try { Sound.ctx = new C(); } catch (e) { return null; }
    return Sound.ctx;
  }
  function tone(a, type, f, t, peak, dec, f2) {
    var o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dec);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .012); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dec + .05);
  }
  function noise(a, t, peak, dec, ftype, freq) {
    var n = Math.floor(a.sampleRate * dec), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = ftype; f.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dec * .3); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t);
  }
  var SFX = {
    koto: function (a, t) { [293.7, 392, 440, 587.3].forEach(function (f, i) { tone(a, 'triangle', f, t + i * .22, .2, 1.1); }); },
    fue: function (a, t) { tone(a, 'sine', 880, t, .12, 1.4, 990); tone(a, 'sine', 1320, t + .5, .05, .9); },
    kane: function (a, t) { tone(a, 'sine', 196, t, .3, 2.6); tone(a, 'sine', 392.5, t, .12, 2); tone(a, 'sine', 588, t, .06, 1.4); },
    suzume: function (a, t) { for (var i = 0; i < 5; i++) tone(a, 'sine', 3200 + (i % 2) * 500, t + i * .13, .07, .08, 4200); },
    kaze: function (a, t) { noise(a, t, .12, 2.2, 'bandpass', 500); },
    ame: function (a, t) { noise(a, t, .1, 2.4, 'highpass', 2400); },
    mushi: function (a, t) { for (var i = 0; i < 8; i++) tone(a, 'sine', 4300, t + i * .09, .04, .06); },
    ashioto: function (a, t) { for (var i = 0; i < 4; i++) noise(a, t + i * .28, .22, .09, 'lowpass', 300); },
    to: function (a, t) { noise(a, t, .3, .16, 'lowpass', 420); tone(a, 'sine', 90, t, .3, .25, 50); },
    namida: function (a, t) { tone(a, 'sine', 660, t, .09, 1.2, 440); }
  };
  function sfx(name) {
    if (!Sound.on || !SFX[name]) return;
    var a = ac(); if (!a) return;
    try { if (a.state === 'suspended' && a.resume) a.resume(); SFX[name](a, a.currentTime + .02); } catch (e) {}
  }

  G.UI = {
    init: init, el: function () { return el; }, applySettings: applySettings, top: top, meters: meters, bumpMeter: bumpMeter,
    title: title, chapter: chapter, ending: ending, hideScreen: hideScreen,
    say: say, finishTyping: finishTyping, gen: gen, ask: ask, askRetry: askRetry, askFeedback: askFeedback, showHint: showHint,
    gameHost: gameHost, panel: panel, textHidden: textHidden,
    cutin: cutin, caption: caption, card: card, fade: fade, toast: toast,
    modal: modal, modalBody: modalBody, modalId: modalId, modalBack: modalBack, closeModal: closeModal,
    menuHTML: menuHTML, settingsHTML: settingsHTML, logHTML: logHTML, sfx: sfx, askNames: ASK
  };
})(typeof window !== 'undefined' ? window : globalThis);
