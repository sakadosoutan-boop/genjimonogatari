/* 源氏物語 —— 共通の名前空間と登録口。
 * すべてのデータ・部品は window.GENJI にぶら下げる。帖（章）は registerChapter で足していく。
 * 取り決めの全体は docs/CONTRACT.md。 */
(function (root) {
  'use strict';
  var G = root.GENJI = root.GENJI || {};
  G.version = '0.1.0';
  G.chapters = G.chapters || {};      // id -> 帖データ
  G.chapterOrder = G.chapterOrder || []; // 表紙に並べる順
  G.bunpo = G.bunpo || {};            // id -> 文法・敬語・古語の項目
  G.bunpoOrder = G.bunpoOrder || [];

  G.registerChapter = function (ch) {
    if (!ch || !ch.id) throw new Error('registerChapter: id がありません');
    if (!G.chapters[ch.id]) G.chapterOrder.push(ch.id);
    G.chapters[ch.id] = ch;
    G.chapterOrder.sort(function (a, b) { return (G.chapters[a].no || 0) - (G.chapters[b].no || 0); });
    return ch;
  };
  G.registerBunpo = function (list) {
    (list || []).forEach(function (b) {
      if (!b || !b.id) throw new Error('registerBunpo: id がありません');
      if (!G.bunpo[b.id]) G.bunpoOrder.push(b.id);
      G.bunpo[b.id] = b;
    });
  };

  /* 本文の記法： {漢字|よみ} はルビ、【語】は設問で問う語の強調。 */
  G.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  G.rich = function (s) {
    return G.esc(s)
      .replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
      .replace(/【([^】]+)】/g, '<em class="gj-mark">$1</em>')
      .replace(/\n/g, '<br>');
  };
  G.plain = function (s) {
    return String(s == null ? '' : s).replace(/\{([^|{}]+)\|[^|{}]+\}/g, '$1').replace(/[【】]/g, '');
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
