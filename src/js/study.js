/* 学びの帳面（GENJI.Study）：原文帳・図鑑・人物一覧。
 * 原文帳は「重ね読み」ができる：原文の上に 現代語訳／語注／品詞分解(hinshi)／敬語(keigo) の層を重ねたり外したりする。
 * 物語の途中の gen ノード（文字の窓）も、同じ genHTML を使う。
 * 画面の枠（モーダル）は GENJI.UI.modal に出す。data-st="…" のボタンは UI が Study.handle に渡す。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  var KEIGO = { sonkei: '尊敬', kenjo: '謙譲', teinei: '丁寧' };
  var CATS = [['keigo', '敬語'], ['jodoshi', '助動詞'], ['joshi', '助詞'], ['kogo', '重要古語'], ['shikitari', 'しきたり'], ['waka', '和歌']];
  var LAYERS = [['yaku', '現代語訳'], ['chu', '語注'], ['hinshi', '品詞分解'], ['keigo', '敬語']];

  var St = {
    layers: { yaku: true, chu: false, hinshi: false, keigo: false },   // 重ねている層
    vert: null,                                                         // 縦書き（null＝画面の幅で決める）
    book: null, zukan: null
  };
  function esc(s) { return G.esc(s); }
  function rich(s) { return G.rich(s); }
  function wide() { try { return !!(root.matchMedia && root.matchMedia('(min-width: 720px)').matches); } catch (e) { return false; } }
  function vertical() { return St.vert == null ? wide() : St.vert; }

  /* ---------- 本文を「単位」に分ける（ルビ・強調つき）。文字送りと重ね読みで使う ---------- */
  function units(s) {
    var out = [], mark = false, m;
    s = String(s == null ? '' : s);
    for (var i = 0; i < s.length;) {
      var c = s.charAt(i);
      if (c === '{' && (m = /^\{([^|{}]+)\|([^|{}]+)\}/.exec(s.slice(i)))) { out.push({ b: m[1], r: m[2], m: mark }); i += m[0].length; continue; }
      if (c === '【') { mark = true; i++; continue; }
      if (c === '】') { mark = false; i++; continue; }
      out.push(c === '\n' ? { nl: true, b: '' } : { b: c, m: mark });
      i++;
    }
    return out;
  }
  function unitHTML(u, cls) {
    if (u.nl) return '<br>';
    var k = u.r ? '<ruby>' + esc(u.b) + '<rt>' + esc(u.r) + '</rt></ruby>' : esc(u.b);
    if (u.m) k = '<em class="gj-mark">' + k + '</em>';
    return cls ? '<span class="' + cls + '">' + k + '</span>' : k;
  }
  function unitsHTML(us, n, cls) {
    var k = '';
    for (var i = 0; i < us.length && (n == null || i < n); i++) k += unitHTML(us[i], cls && cls[i]);
    return k;
  }
  /** 単位の列の中から語を探す（空白は無視）。from は探し始める単位の位置。→ [始, 終) か null */
  function findRange(us, word, from) {
    var plain = '', map = [];
    us.forEach(function (u, i) { String(u.b || '').split('').forEach(function (ch) { if (!/[\s　]/.test(ch)) { plain += ch; map.push(i); } }); });
    var w = G.plain(word).replace(/[\s　]/g, '');
    if (!w) return null;
    var start = 0;
    if (from) { while (start < map.length && map[start] < from) start++; }
    var at = plain.indexOf(w, start);
    if (at < 0) return null;
    return [map[at], map[at + w.length - 1] + 1];
  }

  /* ---------- 名札・敬意の矢印（UI からも使う） ---------- */
  function charOf(id) { return (G.chars && G.chars[id]) || { name: id || '', seal: String(id || '?').charAt(0) }; }
  function sealHTML(id) {
    var c = charOf(id), col = (c.look && c.look.colors && c.look.colors[0]) || '#8a7a9a';
    return '<span class="gj-seal" style="--c:' + esc(col) + '" aria-hidden="true">' + esc(c.seal || '・') + '</span>';
  }
  function plate(id, label) {
    var c = charOf(id);
    return '<span class="gj-plate">' + sealHTML(id) + '<span class="gj-plate-n">' + esc(label || c.name) + '</span></span>';
  }
  /** 「誰から誰へ・どの種類」を帯で示す。 */
  function arrowHTML(a) {
    var who = function (id) { return id === 'kataribe' ? '語り手（作者）' : charOf(id).name; };
    return '<div class="gj-arrow k-' + esc(a.kind) + '">' + plate(a.from, who(a.from)) +
      '<span class="gj-arrow-line"><b>' + (KEIGO[a.kind] || '') + '</b></span>' + plate(a.to, who(a.to)) + '</div>';
  }

  /* ---------- 原文の段（重ね読み） ---------- */
  function textHTML(g, L) {
    var us = units(g.text), cls = [], i;
    function add(r, c) { if (r) for (var j = r[0]; j < r[1]; j++) cls[j] = (cls[j] ? cls[j] + ' ' : '') + c; }
    if (L.chu) (g.chu || []).forEach(function (c) { add(findRange(us, c.w, 0), 'gj-u-chu'); });
    if (L.keigo) {
      var cur = {};
      (g.keigo || []).forEach(function (k) {
        var r = findRange(us, k.w, cur[k.w] || 0);
        if (r) { cur[k.w] = r[1]; add(r, 'gj-u-k k-' + k.kind); }
      });
    }
    var hin = L.hinshi && g.hinshi && g.hinshi.length ? findRange(us, g.hinshi.map(function (t) { return t.s; }).join(''), 0) : null;
    if (!hin) return unitsHTML(us, null, cls);
    // 品詞分解のある範囲は、語ごとの札（語＋品詞）に置きかえる
    var k = '';
    for (i = 0; i < hin[0]; i++) k += unitHTML(us[i], cls[i]);
    k += '<span class="gj-toks">' + g.hinshi.map(function (t) {
      return '<span class="gj-tok' + (t.k ? ' k-' + esc(t.k) : '') + '"><b>' + esc(t.s) + '</b><i>' + esc(t.h) + (t.k && t.to ? '<u>→' + esc(charOf(t.to).name) + '</u>' : '') + '</i></span>';
    }).join('') + '</span>';
    for (i = hin[1]; i < us.length; i++) k += unitHTML(us[i], cls[i]);
    return k;
  }
  function genHTML(ch, g, opts) {
    opts = opts || {};
    var L = St.layers, vt = vertical() && !L.hinshi;   // 品詞の札は横書きで見せる
    var has = { yaku: !!g.yaku, chu: !!(g.chu && g.chu.length), hinshi: !!(g.hinshi && g.hinshi.length), keigo: !!(g.keigo && g.keigo.length) };
    var k = '<div class="gj-gen' + (opts.compact ? ' compact' : '') + '" data-ch="' + esc(ch.id) + '" data-g="' + esc(g.id) + '"' + (opts.compact ? ' data-compact="1"' : '') + '>';
    k += '<div class="gj-gen-h"><span class="gj-tag gen">原文</span><b>' + rich(g.title) + '</b>' + (g.scope ? '<span class="gj-scope">' + esc(g.scope) + '</span>' : '') + '</div>';
    k += '<div class="gj-layers" role="group" aria-label="重ねて読む層">' + LAYERS.map(function (l) {
      return '<button type="button" class="gj-chip" data-st="layer" data-l="' + l[0] + '" aria-pressed="' + (L[l[0]] && has[l[0]] ? 'true' : 'false') + '"' + (has[l[0]] ? '' : ' disabled') + '>' + l[1] + '</button>';
    }).join('') + '<button type="button" class="gj-chip sub" data-st="vert" aria-pressed="' + (vt ? 'true' : 'false') + '">縦書き</button></div>';
    k += '<div class="gj-gen-text' + (vt ? ' gj-vt' : '') + (L.hinshi && has.hinshi ? ' hin' : '') + '" lang="ja">' + textHTML(g, L) + '</div>';
    if (L.yaku && has.yaku) k += '<div class="gj-gen-yaku"><h5>現代語訳</h5><p>' + rich(g.yaku) + '</p></div>';
    if (L.keigo && has.keigo) k += '<div class="gj-gen-keigo"><h5>敬語（誰から誰へ）</h5>' + g.keigo.map(function (x) {
      return '<div class="gj-kg"><em class="gj-u-k k-' + esc(x.kind) + '">' + rich(x.w) + '</em>' + arrowHTML(x) + (x.note ? '<p>' + rich(x.note) + '</p>' : '') + '</div>';
    }).join('') + '</div>';
    if (L.chu && has.chu) k += '<dl class="gj-gen-chu">' + g.chu.map(function (c) { return '<div><dt>' + rich(c.w) + '</dt><dd>' + rich(c.x) + '</dd></div>'; }).join('') + '</dl>';
    var bs = (g.bunpo || []).filter(function (b) { return G.bunpo && G.bunpo[b]; });
    if (bs.length) k += '<div class="gj-gen-bunpo"><span>図鑑</span>' + bs.map(function (b) { return '<button type="button" class="gj-chip link" data-st="zukan" data-id="' + esc(b) + '">' + rich(G.bunpo[b].title) + '</button>'; }).join('') + '</div>';
    return k + '</div>';
  }
  function findGen(ch, gid) { return (ch.genbun || []).filter(function (g) { return g.id === gid; })[0] || null; }

  /* ---------- 原文帳 ---------- */
  function bookInfo(chId) {
    var info = G.Engine && G.Engine.bookInfo ? G.Engine.bookInfo(chId) : null;
    return info || { all: true, bound: {} };
  }
  function bookHTML() {
    var b = St.book, ch = G.chapters[b.ch]; if (!ch) return '<p>帖がありません。</p>';
    var info = bookInfo(b.ch), list = ch.genbun || [];
    var open = function (g) { return info.all || info.bound[g.id]; };
    var cur = findGen(ch, b.g);
    if (!cur || !open(cur)) cur = list.filter(open)[0] || null;
    b.g = cur ? cur.id : null;
    var nb = list.filter(function (g) { return info.bound[g.id]; }).length;
    var k = '<div class="gj-book"><p class="gj-book-lead">綴じた段 ' + nb + '／' + list.length + '。' + (info.all ? '授業モードでは全段を開けます。' : '物語で読んだ段から開きます。') + '層のボタンで、訳・語注・品詞・敬語を重ねて読めます。</p>';
    k += '<div class="gj-book-list" role="tablist">' + list.map(function (g, i) {
      var ok = open(g);
      return '<button type="button" role="tab" class="gj-book-tab' + (cur && g.id === cur.id ? ' on' : '') + (info.bound[g.id] ? ' bound' : '') + '" data-st="bookgo" data-id="' + esc(g.id) + '"' + (ok ? '' : ' disabled') + ' aria-selected="' + (cur && g.id === cur.id) + '">' +
        '<small>' + (i + 1) + '</small>' + (ok ? G.esc(G.plain(g.title)) : '（まだ読んでいない段）') + (g.scope ? '<i>' + esc(g.scope) + '</i>' : '') + '</button>';
    }).join('') + '</div>';
    k += cur ? genHTML(ch, cur) : '<p class="gj-empty">まだ綴じた段がありません。物語を読み進めると、ここに原文が綴じられます。</p>';
    return k + '</div>';
  }
  function openBook(chId, gid) {
    St.book = { ch: chId, g: gid || (St.book && St.book.ch === chId ? St.book.g : null) };
    var ch = G.chapters[chId] || {};
    G.UI.modal({ id: 'book', title: '原文帳　' + (ch.title || ''), html: bookHTML(), wide: true });
  }

  /* ---------- 図鑑 ---------- */
  function zukanHTML() {
    var z = St.zukan, all = (G.bunpoOrder || []).map(function (id) { return G.bunpo[id]; });
    if (!all.length) return '<p class="gj-empty">図鑑の項目がまだありません。</p>';
    var cur = z.id && G.bunpo[z.id];
    if (cur) z.cat = cur.cat;
    if (!z.cat) z.cat = (all[0] || {}).cat;
    var k = '<div class="gj-zukan"><div class="gj-zk-cats" role="tablist">' + CATS.map(function (c) {
      var n = all.filter(function (b) { return b.cat === c[0]; }).length;
      return n ? '<button type="button" role="tab" class="gj-chip' + (z.cat === c[0] ? ' on' : '') + '" aria-pressed="' + (z.cat === c[0]) + '" data-st="zcat" data-id="' + c[0] + '">' + c[1] + '<small>' + n + '</small></button>' : '';
    }).join('') + '</div>';
    if (cur) {
      k += '<article class="gj-zk-item"><button type="button" class="gj-chip sub" data-st="zcat" data-id="' + esc(cur.cat) + '">← 一覧へ</button>' +
        '<h4>' + rich(cur.title) + (cur.yomi ? '<small>' + esc(cur.yomi) + '</small>' : '') + '</h4><p>' + rich(cur.x) + '</p>' +
        ((cur.rei || []).length ? '<div class="gj-zk-rei"><h5>用例</h5>' + cur.rei.map(function (r) { return '<div><p class="gj-zk-g" lang="ja">' + rich(r.g) + '</p><p class="gj-zk-y">' + rich(r.y) + '</p></div>'; }).join('') + '</div>' : '') + '</article>';
    } else {
      k += '<div class="gj-zk-list">' + all.filter(function (b) { return b.cat === z.cat; }).map(function (b) {
        return '<button type="button" class="gj-zk-row" data-st="zukan" data-id="' + esc(b.id) + '"><b>' + rich(b.title) + '</b><span>' + esc(G.plain(b.x).slice(0, 34)) + '…</span></button>';
      }).join('') + '</div>';
    }
    return k + '</div>';
  }
  function openZukan(id) {
    St.zukan = { id: id && G.bunpo && G.bunpo[id] ? id : null, cat: St.zukan ? St.zukan.cat : null };
    G.UI.modal({ id: 'zukan', title: '図鑑　ことばとしきたり', html: zukanHTML(), wide: true, push: true });
  }

  /* ---------- 人物一覧 ---------- */
  function castOf(ch) {
    var seen = {}, out = [];
    function add(id) { if (id && id !== 'you' && G.chars && G.chars[id] && !seen[id]) { seen[id] = 1; out.push(id); } }
    add(ch.pov);
    Object.keys(ch.cutin || {}).forEach(add);
    (ch.acts || []).forEach(function (a) { (a.nodes || []).forEach(function (n) {
      if (n.t === 'scene') (n.cast || []).forEach(function (c) { add(typeof c === 'string' ? c : c.id); });
      else add(n.w);
    }); });
    return out;
  }
  function openChars(chId) {
    var ch = G.chapters[chId]; if (!ch) return;
    var k = '<div class="gj-chars">' + castOf(ch).map(function (id) {
      var c = G.chars[id], cut = (ch.cutin || {})[id] || [];
      return '<div class="gj-char">' + (G.Stage2D && G.Stage2D.dollSVG ? G.Stage2D.dollSVG(id) : sealHTML(id)) +
        '<div><h4>' + esc(cut[0] || c.name) + (id === ch.pov ? '<span class="gj-scope">あなた</span>' : '') + '</h4>' +
        '<small>' + esc(cut[1] || c.yomi || '') + (cut[2] ? '　／　' + esc(cut[2]) : '') + '</small><p>' + esc(cut[3] || c.full || '') + '</p></div></div>';
    }).join('') + '</div>';
    G.UI.modal({ id: 'chars', title: '人物　' + ch.title, html: k, wide: true, push: true });
  }

  /* ---------- ボタン ---------- */
  function rerenderGen(el) {
    var box = el.closest('.gj-gen'); if (!box) return;
    var ch = G.chapters[box.getAttribute('data-ch')], g = ch && findGen(ch, box.getAttribute('data-g'));
    if (!g) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = genHTML(ch, g, { compact: box.hasAttribute('data-compact') });
    box.parentNode.replaceChild(tmp.firstChild, box);
  }
  function handle(act, el) {
    var id = el.getAttribute('data-id');
    if (act === 'layer') { var l = el.getAttribute('data-l'); St.layers[l] = el.getAttribute('aria-pressed') !== 'true'; rerenderGen(el); }
    else if (act === 'vert') { St.vert = el.getAttribute('aria-pressed') !== 'true'; if (St.vert) St.layers.hinshi = false; rerenderGen(el); }
    else if (act === 'bookgo') { St.book.g = id; G.UI.modalBody(bookHTML()); }
    else if (act === 'zukan') {
      if (G.UI.modalId() === 'zukan') { St.zukan.id = id; G.UI.modalBody(zukanHTML()); } else openZukan(id);
    }
    else if (act === 'zcat') { St.zukan.id = null; St.zukan.cat = id; G.UI.modalBody(zukanHTML()); }
  }

  G.Study = {
    state: St, units: units, unitsHTML: unitsHTML, findRange: findRange,
    sealHTML: sealHTML, plate: plate, arrowHTML: arrowHTML, keigoName: KEIGO,
    genHTML: genHTML, findGen: findGen, openBook: openBook, openZukan: openZukan, openChars: openChars, castOf: castOf, handle: handle
  };
})(typeof window !== 'undefined' ? window : globalThis);
