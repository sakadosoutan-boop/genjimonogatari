/* 3D の舞台を最初に使うときだけ、index.html に記した依存順で実行する。 */
(function (root) {
  'use strict';
  var G = root.GENJI, doc = root.document, pending;
  G.loadStage3D = function () {
    if (pending) return pending;
    pending = new Promise(function (resolve, reject) {
      var sources = doc.querySelectorAll('script[data-gj3-src]'), scripts = [], remaining = sources.length;
      if (!remaining) return reject(new Error('3D のスクリプトが指定されていません'));

      var timer = root.setTimeout(function () { fail(new Error('3D の読み込みが時間内に終わりませんでした')); }, 5000);
      function fail(error) {
        root.clearTimeout(timer);
        scripts.forEach(function (script) { script.remove(); });
        reject(error);
      }
      function loaded() {
        if (--remaining) return;
        root.clearTimeout(timer);
        if (!G.Stage3D) return fail(new Error('3D の舞台を初期化できませんでした'));
        resolve();
      }
      Array.prototype.forEach.call(sources, function (source) {
        var script = doc.createElement('script'), path = source.getAttribute('data-gj3-src');
        if (source.textContent.trim()) {
          // 配布用の一枚 HTML では、各スクリプトも HTML 内にある。
          script.text = source.textContent;
          doc.head.appendChild(script);
          loaded();
        } else {
          // 取得は並行に始め、実行は依存順にそろえる。
          script.async = false;
          script.src = path;
          script.onload = loaded;
          script.onerror = function () { fail(new Error(path + ' を読み込めませんでした')); };
          scripts.push(script);
          doc.head.appendChild(script);
        }
      });
    });
    return pending;
  };
})(window);
