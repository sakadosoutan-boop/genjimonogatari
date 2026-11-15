/* 舞台の語彙。物語データ（scene / say / game ノード）が使ってよい名前はここにあるものだけ。
 * 3D（stage3d*.js）と軽量の絵巻モード（stage2d.js）は、ここにある全部を必ず受け付ける。
 * 名前を足すときは、このファイル → 3D 実装 → docs/CONTRACT.md の順に直す。 */
(function (root) {
  'use strict';
  var G = root.GENJI;

  /* どの舞台でも使える立ち位置（吹抜屋台＝屋根を外して斜め上から見た室内が基本）。
   *   kami  : 上座（母屋の奥。主人の座）      naka : 部屋の中央       shimo : 下座（廂の間）
   *   〜L/R : 見る人から見て左／右             sunoko: 簀子（外の縁）  niwa  : 庭
   *   misu  : 御簾の内（影で見える）            to    : 戸口・渡り口 */
  var COMMON = ['kami', 'kamiL', 'kamiR', 'naka', 'nakaL', 'nakaR', 'shimo', 'shimoL', 'shimoR', 'sunoko', 'niwa', 'misu', 'to'];

  G.stageSpec = {
    commonSlots: COMMON,
    stages: {
      /* 桐壺 */
      kokyu:     { name: '後宮（内裏の北半分）', note: '俯瞰の全景。清涼殿・弘徽殿・淑景舎（桐壺）と、それをつなぐ渡殿・馬道が見える',
                   slots: ['seiryoden', 'kokiden', 'kiritsubo', 'michi1', 'michi2', 'michi3'] },
      kiritsubo: { name: '淑景舎（桐壺）', note: '更衣の局。壺庭に桐の木。内裏の東北の隅で、清涼殿からいちばん遠い', slots: [] },
      seiryoden: { name: '清涼殿', note: '帝のおいでになる殿。kami は帝の御座（昼の御座／夜の御殿）', slots: [] },
      kokiden:   { name: '弘徽殿', note: '弘徽殿の女御の殿。清涼殿のすぐ北', slots: [] },
      watadono:  { name: '渡殿・馬道', note: '殿舎をつなぐ長い廊。両側に戸。嫌がらせの場', slots: ['oku', 'temae'] },
      sato:      { name: '更衣の里邸', note: '母北の方の家。荒れかけた庭、野分のあとの夕月夜', slots: [] },
      /* 若紫 */
      kitayama:  { name: '北山', note: '山の全景。山桜の盛り、霞。高みから僧坊を見下ろす', slots: ['takami', 'sakamichi', 'iwaya'] },
      soubou:    { name: '北山の僧坊', note: '小柴垣をめぐらした僧坊。西面に持仏を据えた部屋。kami は尼君の座、kaki は垣の外で源氏が覗く位置',
                   slots: ['kaki', 'kakiL', 'kakiR', 'jibutsu'] }
    },
    lights:  ['dawn', 'day', 'dusk', 'night', 'moon'],
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    /* 姿勢 */
    poses:   ['stand', 'sit', 'bow', 'fan', 'weep', 'lie', 'peek', 'run', 'write', 'pray', 'turn', 'hold'],
    /*   stand 立つ / sit 座る（居る） / bow 平伏 / fan 扇で顔を隠す / weep 袖で顔をおおう / lie 臥す（病）
     *   peek のぞく / run 走る / write 書く / pray 手を合わせる・経を読む / turn 顔をそむける / hold 幼子を抱く */
    /* カメラの寄り先（at）：'wide'、人物 id、立ち位置の名前のどれか */
    fx:      ['shake', 'petals', 'leaves', 'rain', 'mist', 'dim', 'flash', 'wind'],
    sfx:     ['koto', 'fue', 'kane', 'suzume', 'kaze', 'ame', 'mushi', 'ashioto', 'to', 'namida'],
    bubbles: ['hush', 'anger', 'think', 'waka', 'cry'],
    fades:   ['black', 'white', 'cross'],
    games:   ['wataru', 'kaimami', 'narabe', 'musubi'],
    askKinds:['read', 'subject', 'keigo', 'kokoro', 'judge', 'waka'],
    keigoKinds: ['sonkei', 'kenjo', 'teinei']
  };
})(typeof window !== 'undefined' ? window : globalThis);
