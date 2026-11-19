/* 表紙（タイトル画面）の BGM。再生素材は src/audio/title-bgm.b64（MP3 を Base64 化したテキスト）。
   初回読み込みを軽く保つため、必要なとき（音 入 かつ表紙表示中）にだけ読み込む。
   一枚 HTML（dist）では、データが <script type="text/plain" id="gj-bgm-data"> に埋め込まれている。
   曲：Suno で生成した「Dusk at the Imperial Court」（非商用・個人利用）。 */
(function () {
  'use strict';
  var root = window, doc = document;
  var audio = null, loading = false, want = false;

  function dataText(cb) {
    var inl = doc.getElementById('gj-bgm-data');
    if (inl && inl.textContent) { cb(inl.textContent.replace(/\s+/g, '')); return; }
    if (!root.fetch) { cb(null); return; }
    fetch('src/audio/title-bgm.b64').then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) { cb(t ? t.replace(/\s+/g, '') : null); })
      .catch(function () { cb(null); });
  }
  function ensure() {
    if (audio || loading) return;
    loading = true;
    dataText(function (b64) {
      loading = false;
      if (!b64) return;
      try {
        var bin = atob(b64), bytes = new Uint8Array(bin.length), i;
        for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        audio = new Audio();
        audio.src = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
        audio.loop = true;
        audio.volume = 0.5;
        audio.preload = 'auto';
        if (want) tryPlay();
      } catch (e) { audio = null; }
    });
  }
  function tryPlay() {
    if (audio && audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
  }
  function play() {
    want = true;
    if (!audio) { ensure(); return; }
    tryPlay();
  }
  function stop() {
    want = false;
    if (audio && !audio.paused) audio.pause();
  }
  /* 自動再生が止められた場合に備え、最初の操作で再生を試し直す */
  ['pointerdown', 'keydown'].forEach(function (ev) {
    doc.addEventListener(ev, function () { if (want) { if (audio) tryPlay(); else ensure(); } }, { passive: true });
  });

  root.GJ_BGM = {
    play: play,
    stop: stop,
    /** 音設定と表紙表示に合わせて、鳴らす／止める */
    sync: function (on) { if (on) play(); else stop(); },
    /** テスト用：読み込み済みかどうか */
    loaded: function () { return !!audio; }
  };
})();
