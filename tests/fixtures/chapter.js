/* テスト用の小さな架空の帖（本物の帖データではない）。全ノード種別・全 ask 種別・分岐・遊びを一通り通る。
 * tests/engine.test.cjs と tests/browser-smoke.cjs が読み込む。 */
(function (root) {
  'use strict';
  var G = root.GENJI;
  if (!G.bunpo['t-tamafu']) G.registerBunpo([{ id: 't-tamafu', cat: 'keigo', title: 'たまふ（試し）', yomi: 'たまふ', x: '尊敬の補助動詞。動作をする人を高める。', rei: [{ g: '時めき{給|たま}ふ', y: 'ご寵愛を受けていらっしゃる' }] }]);
  G.registerChapter({
    id: 'tameshi', no: 99, title: '試し', sub: 'テスト用の架空の帖',
    pov: 'koui', povNote: 'あなたは桐壺の更衣', intro: 'これは動作確認のための短い帖です。\n本物の物語ではありません。',
    meters: [
      { id: 'oboe', name: '御おぼえ', desc: '帝のご寵愛', init: 2, min: 0, max: 10, tone: 'good' },
      { id: 'soshiri', name: 'そしり', desc: '人々のそねみ', init: 0, min: 0, max: 10, tone: 'bad' }
    ],
    acts: [
      { id: 't1', title: '第一段　読みの段', scope: '教科書', minutes: 3, nodes: [
        { t: 'scene', stage: 'kiritsubo', light: 'day', season: 'spring', fade: 'black', caption: '淑景舎の春',
          cast: ['nyobo', { id: 'koui', at: 'naka', pose: 'sit' }, { id: 'mikado', at: 'kami' }], card: { title: '第一段', sub: '読みの段' } },
        { x: 'いずれの{御時|おおんとき}のことであったか。' },
        { w: 'mikado', x: 'そなたのほかに、心を寄せる人はない。', b: 'hush', at: 'mikado', pose: { koui: 'bow' }, fx: 'petals', sfx: 'koto' },
        { w: 'you', x: 'もったいないお言葉でございます。' },
        { x: 'いづれの{御時|おほんとき}にか、', src: 'gen' },
        { t: 'gen', g: 't01' },
        { id: 'q-read', t: 'ask', k: 'read', q: '「時めき【たまふ】」はどういう意味か。', stem: 'すぐれて時めき【たまふ】ありけり。',
          o: [{ x: 'ご寵愛を受けていらっしゃる', ok: true, fx: { oboe: 1 } }, { x: 'ときめいて胸が高鳴る', fx: { soshiri: 2 }, go: 'q-subj' }, { x: '時を告げなさる' }],
          hint: '「時めく」は時流に乗って栄えること。', exp: '「時めく」＝寵愛を受けて栄える。「たまふ」は尊敬。', bunpo: 't-tamafu' },
        { id: 'q-subj', t: 'ask', k: 'subject', q: '「時めきたまふ」の主語は誰か。', o: [{ c: 'koui', ok: true }, { c: 'mikado' }, { c: 'kokiden' }], hint: '寵愛を受けるのは誰か。', exp: '寵愛を受けているのは更衣。' },
        { id: 'q-keigo', t: 'ask', k: 'keigo', w: 'nyobo', q: '「たまふ」の敬意の方向は。', stem: '時めき【たまふ】',
          o: [{ x: '尊敬語：作者→更衣', ok: true }, { x: '謙譲語：作者→帝' }], hint: '動作をする人を高めるのは何語か。', exp: '尊敬語で、時めく人（更衣）を高める。',
          arrows: [{ from: 'kataribe', to: 'koui', kind: 'sonkei' }] },
        { id: 'q-kokoro', t: 'ask', k: 'kokoro', q: '更衣の心情は。', o: [{ x: 'ありがたくも心細い', ok: true }, { x: '恐れ多い', ok: true, r: 'そう読むこともできる。', rw: 'nyobo' }, { x: '誇らしく得意だ' }], hint: '後ろ盾のなさを思い出そう。', exp: '「はかばかしき後見しなければ」が根拠。' },
        { id: 'q-waka', t: 'ask', k: 'waka', q: '「いく」に掛けられているのは。', o: [{ x: '行く／生く', ok: true }, { x: '幾／行く' }], hint: '命の歌である。', exp: '「行く」と「生く」の掛詞。' },
        { t: 'set', fx: { oboe: 1 }, set: { yonda: true } },
        { id: 'q-judge', t: 'ask', k: 'judge', q: '弘徽殿の前を通るとき、どうするか。',
          o: [{ x: '顔を上げて通る', go: 'j-a', fx: { soshiri: 3 }, set: { tsuyoki: true }, r: 'その背に、いくつもの目が注がれた。', rw: 'nyobo' }, { x: '目を伏せて通る', go: 'j-b' }] },
        { id: 'j-a', x: 'あなたは顔を上げて歩いた。' },
        { t: 'go', to: 'j-join' },
        { id: 'j-b', x: 'あなたは目を伏せて歩いた。' },
        { id: 'j-join', t: 'if', f: 'tsuyoki', go: 'f-yes', el: 'f-no' },
        { id: 'f-yes', x: '強い心が、あなたを支えていた。' },
        { t: 'go', to: 't1-end' },
        { id: 'f-no', x: '静かな心で、あなたは耐えていた。' },
        { id: 't1-end', x: '第一段はここまで。' }
      ] },
      { id: 't2', title: '第二段　遊びの段', scope: null, minutes: 3, nodes: [
        { t: 'scene', stage: 'kokyu', light: 'dusk', cast: [{ id: 'koui', at: 'kiritsubo' }] },
        { id: 'g-narabe', t: 'game', g: 'narabe', cfg: { q: '位の高い順に並べよう。', items: [{ id: 'a', x: '女御', sub: 'にょうご' }, { id: 'b', x: '更衣' }, { id: 'c', x: '女房' }], order: ['a', 'b', 'c'], top: '高い', bottom: '低い', exp: '女御、更衣の順。' } },
        { id: 'g-musubi', t: 'game', g: 'musubi', cfg: { q: '殿舎と人を結ぼう。', left: [{ id: 'l1', x: '清涼殿' }, { id: 'l2', x: '淑景舎' }], right: [{ id: 'r1', x: '帝' }, { id: 'r2', x: '更衣' }], pairs: { l1: 'r1', l2: 'r2' }, exp: '帝は清涼殿に。' } },
        { id: 'g-wataru', t: 'game', g: 'wataru', cfg: { stage: 'kokyu', from: 'kiritsubo', to: 'seiryoden', intro: '清涼殿へ向かう。', outro: 'ようやく着いた。',
          events: [{ at: .3, x: '戸がさされている。', kind: 'door', fx: { soshiri: 1 } }, { at: .7, w: 'kata', x: 'あら、またお召しですって。', kind: 'whisper' }] } },
        { t: 'scene', stage: 'soubou', light: 'dusk', season: 'spring', cast: [{ id: 'amagimi', at: 'kami' }, { id: 'murasaki', at: 'naka' }] },
        { id: 'g-kaimami', t: 'game', g: 'kaimami', cfg: { stage: 'soubou', intro: '垣の向こうをのぞく。', outro: '見るべきものは見た。',
          targets: [{ id: 'amagimi', label: '尼君', x: '四十余ばかりにて、いと白うあてに', yaku: '四十歳すぎくらいで、色白で上品で' }, { id: 'murasaki', label: '少女', x: '白き衣、山吹などのなえたる着て', gen: 't02' }] } },
        { id: 'branch', t: 'if', m: { soshiri: 5 }, go: 'bad', el: 'good' },
        { id: 'good', x: '人のそしりも、やがて静まった。' },
        { t: 'end', e: 't-true' },
        { id: 'bad', x: 'そしりは日ごとに積もっていった。' },
        { t: 'end', e: 't-ibun' }
      ] }
    ],
    genbun: [
      { id: 't01', title: 'いづれの{御時|おほんとき}にか', scope: '教科書',
        text: 'いづれの{御時|おほんとき}にか、{女御|にようご}、{更衣|かうい}あまたさぶらひたまひける中に、すぐれて時めきたまふありけり。',
        yaku: 'どの帝の御代であったか、女御や更衣が大勢お仕えしていらっしゃった中に、（帝の）ご寵愛を受けていらっしゃる方があった。',
        chu: [{ w: 'あまた', x: '大勢。' }, { w: '時めく', x: '寵愛を受けて栄える。' }],
        hinshi: [{ s: 'いづれ', h: '代名詞' }, { s: 'の', h: '格助詞' }, { s: '御時', h: '名詞' }, { s: 'に', h: '断定・連用' }, { s: 'か', h: '係助詞' }],
        keigo: [{ w: 'さぶらひ', kind: 'kenjo', from: 'kataribe', to: 'mikado', note: 'お仕えする相手を高める。' }, { w: 'たまひ', kind: 'sonkei', from: 'kataribe', to: 'kata' }, { w: 'たまふ', kind: 'sonkei', from: 'kataribe', to: 'koui' }],
        bunpo: ['t-tamafu'] },
      { id: 't02', title: '白き衣', scope: null, text: '白き{衣|きぬ}、{山吹|やまぶき}などのなえたる着て、走り来たる女子', yaku: '白い下着に、山吹襲などの着なれたのを着て、走って来た女の子' }
    ],
    endings: { 't-true': { title: '春の終わり', kind: 'true', x: '物語は、原文のとおりに進んだ。' }, 't-ibun': { title: 'そしりの果て', kind: 'ibun', x: 'これは異聞である。' } },
    cutin: { mikado: ['帝', 'みかど', '桐壺帝', '更衣を深く愛する'], nyobo: ['女房', 'にょうぼう', '', '更衣に仕える'] },
    furikaeri: ['なぜ語り手は更衣に敬語を使うのだろうか。']
  });
})(typeof window !== 'undefined' ? window : globalThis);
