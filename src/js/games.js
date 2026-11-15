/* 小さな遊び（DOM）：narabe＝並べ替え、musubi＝線で結ぶ。どちらもタップだけで操作できる。
 * GENJI.Games.run(kind, cfg, host, opts) → Promise<{ ok, tries }>
 *   opts.classroom … 授業モード。一度目のまちがいは選び直し、二度目に正解と解説を見せる（失敗はない）。
 *   opts.seed      … 並べる順のたね（再開しても同じ並びにする）。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  function rich(s) { return G.rich ? G.rich(s) : String(s == null ? '' : s); }

  /** たね付きの並べ替え（Fisher–Yates）。 */
  function shuffle(arr, seedStr) {
    var a = arr.slice(), seed = 2166136261;
    String(seedStr == null ? Math.random() : seedStr).split('').forEach(function (c) { seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0; });
    function next() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function same(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  function resultHTML(ok, exp, note) {
    return '<div class="gj-fb ' + (ok ? 'ok' : 'ng') + '" role="status"><div class="gj-fb-h">' + (ok ? '◎ そのとおり' : '△ ' + (note || '正しい形を確かめよう')) + '</div>' +
      (exp ? '<p class="gj-exp">' + rich(exp) + '</p>' : '') + '</div>' +
      '<div class="gj-nav"><span></span><button type="button" class="gj-btn gold gj-next" data-g="done">次へ →</button></div>';
  }

  /* ---------- 並べ替え ---------- */
  function narabe(cfg, host, opts, resolve) {
    var items = {}, tries = 0, sel = null, locked = false;
    (cfg.items || []).forEach(function (it) { items[it.id] = it; });
    var right = (cfg.order || []).slice();
    var order = shuffle(right, 'n' + opts.seed);
    if (right.length > 1 && same(order, right)) order.push(order.shift());   // たまたま正解の並びなら一つずらす
    function draw(msg, final) {
      var bad = {};
      if (msg === 'retry') order.forEach(function (id, i) { if (id !== right[i]) bad[id] = 1; });
      host.innerHTML = '<div class="gj-game gj-narabe"><div class="gj-ask-h"><span class="gj-tag game">並べる</span><span class="gj-ask-q">' + rich(cfg.q) + '</span></div>' +
        (cfg.top ? '<div class="gj-nb-end">▲ ' + rich(cfg.top) + '</div>' : '') +
        '<ol class="gj-nb-list">' + order.map(function (id, i) {
          var it = items[id] || { x: id };
          return '<li class="gj-nb-item' + (sel === id ? ' sel' : '') + (bad[id] ? ' ng' : '') + (final ? ' fix' : '') + '" data-id="' + G.esc(id) + '">' +
            '<button type="button" class="gj-nb-main" data-g="sel" data-id="' + G.esc(id) + '"' + (locked ? ' disabled' : '') + '><b>' + rich(it.x) + '</b>' + (it.sub ? '<small>' + rich(it.sub) + '</small>' : '') + '</button>' +
            '<button type="button" class="gj-nb-mv" data-g="up" data-i="' + i + '" aria-label="上へ"' + (locked || i === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="gj-nb-mv" data-g="down" data-i="' + i + '" aria-label="下へ"' + (locked || i === order.length - 1 ? ' disabled' : '') + '>▼</button></li>';
        }).join('') + '</ol>' +
        (cfg.bottom ? '<div class="gj-nb-end">▼ ' + rich(cfg.bottom) + '</div>' : '') +
        (final ? resultHTML(final.ok, cfg.exp, '正しい順に並べ直しました') :
          (msg === 'retry' ? '<div class="gj-fb retry" role="status"><div class="gj-fb-h">もう一度、並べ直そう</div><p>赤い札の位置がちがいます。</p></div>' : '') +
          '<div class="gj-nav"><span class="gj-keyhint">札をタップして入れ替え、または ▲▼ で動かす</span><button type="button" class="gj-btn gold" data-g="check">確かめる</button></div>') + '</div>';
    }
    function swap(i, j) { if (j < 0 || j >= order.length) return; var t = order[i]; order[i] = order[j]; order[j] = t; }
    host.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-g]') : null; if (!b || b.disabled) return;
      var a = b.getAttribute('data-g');
      if (a === 'done') { host.onclick = null; return resolve({ ok: tries === 1 && host._ok, tries: tries }); }
      if (locked) return;
      if (a === 'up' || a === 'down') { var i = +b.getAttribute('data-i'); swap(i, i + (a === 'up' ? -1 : 1)); sel = null; draw(); }
      else if (a === 'sel') {
        var id = b.getAttribute('data-id');
        if (sel && sel !== id) { swap(order.indexOf(sel), order.indexOf(id)); sel = null; } else sel = sel === id ? null : id;
        draw();
      } else if (a === 'check') {
        tries++;
        var ok = same(order, right);
        if (!ok && opts.classroom && tries < 2) return draw('retry');
        host._ok = ok && tries === 1;
        locked = true; sel = null;
        var was = ok;
        order = right.slice();
        draw(null, { ok: was });
      }
    };
    draw();
  }

  /* ---------- 結ぶ ---------- */
  function musubi(cfg, host, opts, resolve) {
    var left = cfg.left || [], rightItems = shuffle(cfg.right || [], 'm' + opts.seed), pairs = cfg.pairs || {};
    var link = {}, sel = null, tries = 0, locked = false, firstOk = false;
    function ownerOf(rid) { return Object.keys(link).filter(function (l) { return link[l] === rid; })[0]; }
    function draw(msg, final) {
      var n = 0, num = {};
      left.forEach(function (l) { if (link[l.id]) num[l.id] = ++n; });
      var bad = {};
      if (msg === 'retry') left.forEach(function (l) { if (link[l.id] !== pairs[l.id]) bad[l.id] = 1; });
      host.innerHTML = '<div class="gj-game gj-musubi"><div class="gj-ask-h"><span class="gj-tag game">結ぶ</span><span class="gj-ask-q">' + rich(cfg.q) + '</span></div>' +
        '<div class="gj-ms-grid"><svg class="gj-ms-lines" aria-hidden="true"></svg><div class="gj-ms-col">' + left.map(function (l) {
          return '<button type="button" class="gj-ms-item L' + (sel === l.id ? ' sel' : '') + (link[l.id] ? ' linked' : '') + (bad[l.id] ? ' ng' : '') + '" data-g="left" data-id="' + G.esc(l.id) + '"' + (locked ? ' disabled' : '') + '>' +
            '<span>' + rich(l.x) + '</span>' + (num[l.id] ? '<i class="gj-ms-n">' + num[l.id] + '</i>' : '<i class="gj-ms-n empty"></i>') + '</button>';
        }).join('') + '</div><div class="gj-ms-col">' + rightItems.map(function (r) {
          var o = ownerOf(r.id);
          return '<button type="button" class="gj-ms-item R' + (o ? ' linked' : '') + (o && bad[o] ? ' ng' : '') + '" data-g="right" data-id="' + G.esc(r.id) + '"' + (locked ? ' disabled' : '') + '>' +
            (o ? '<i class="gj-ms-n">' + num[o] + '</i>' : '<i class="gj-ms-n empty"></i>') + '<span>' + rich(r.x) + '</span></button>';
        }).join('') + '</div></div>' +
        (final ? resultHTML(final.ok, cfg.exp, '正しく結び直しました') :
          (msg === 'retry' ? '<div class="gj-fb retry" role="status"><div class="gj-fb-h">もう一度、結び直そう</div><p>赤い札の組み合わせがちがいます。</p></div>' : '') +
          '<div class="gj-nav"><span class="gj-keyhint">左の札 → 右の札の順にタップして結ぶ</span><button type="button" class="gj-btn gold" data-g="check"' + (n < left.length ? ' disabled' : '') + '>確かめる</button></div>') + '</div>';
      lines();
    }
    // 結んだ札の間に線を引く（位置が取れない環境では番号だけで分かる）
    function lines() {
      var svg = host.querySelector('.gj-ms-lines'), grid = host.querySelector('.gj-ms-grid');
      if (!svg || !grid || !grid.getBoundingClientRect) return;
      var gr = grid.getBoundingClientRect(), k = '';
      if (!gr.width) return;
      svg.setAttribute('viewBox', '0 0 ' + gr.width + ' ' + gr.height);
      Object.keys(link).forEach(function (l) {
        var a = host.querySelector('.gj-ms-item.L[data-id="' + l + '"]'), b = host.querySelector('.gj-ms-item.R[data-id="' + link[l] + '"]');
        if (!a || !b) return;
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        k += '<line x1="' + (ra.right - gr.left) + '" y1="' + (ra.top + ra.height / 2 - gr.top) + '" x2="' + (rb.left - gr.left) + '" y2="' + (rb.top + rb.height / 2 - gr.top) + '"/>';
      });
      svg.innerHTML = k;
    }
    host.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-g]') : null; if (!b || b.disabled) return;
      var a = b.getAttribute('data-g'), id = b.getAttribute('data-id');
      if (a === 'done') { host.onclick = null; return resolve({ ok: firstOk, tries: tries }); }
      if (locked) return;
      if (a === 'left') {
        if (link[id]) { delete link[id]; sel = id; } else sel = sel === id ? null : id;   // 結んだ札をもう一度押すとほどく
        draw();
      } else if (a === 'right') {
        var o = ownerOf(id);
        if (!sel) { if (o) { delete link[o]; draw(); } return; }
        if (o) delete link[o];
        link[sel] = id; sel = null;
        // 次の、まだ結んでいない左の札を選んでおく（タップの回数を減らす）
        var rest = left.filter(function (l) { return !link[l.id]; })[0];
        sel = rest ? rest.id : null;
        draw();
      } else if (a === 'check') {
        tries++;
        var ok = left.every(function (l) { return link[l.id] === pairs[l.id]; });
        if (!ok && opts.classroom && tries < 2) return draw('retry');
        firstOk = ok && tries === 1;
        locked = true; sel = null;
        left.forEach(function (l) { link[l.id] = pairs[l.id]; });
        draw(null, { ok: ok });
      }
    };
    sel = left[0] ? left[0].id : null;
    draw();
  }

  G.Games = {
    kinds: { narabe: narabe, musubi: musubi },
    has: function (kind) { return !!this.kinds[kind]; },
    shuffle: shuffle,
    run: function (kind, cfg, host, opts) {
      var fn = this.kinds[kind];
      opts = opts || {};
      return new Promise(function (resolve) {
        if (!fn || !host) return resolve({ ok: true, skipped: true });
        try { fn(cfg || {}, host, opts, resolve); } catch (e) { resolve({ ok: true, error: String(e && e.message || e) }); }
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
