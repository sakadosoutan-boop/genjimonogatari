# 取り決め（データ形式と部品の境界）

源氏物語を「ノベルゲーム＋要所で 3D を操作する」形で読む学習ゲーム。高校 2 年・古典探究。
まず「桐壺」「若紫」。ゆくゆくは帖を足して全文へ広げるので、**帖＝データ 1 ファイル**を守る。

- ビルド不要。`index.html` を開けば動く（`file://` でも）。素の JS（ES5 寄り・IIFE・`window.GENJI`）、外部 CDN なし。
- 端末は生徒 1 人 1 台（Chromebook / iPad / Windows）＋スマホ。**スマホ縦持ちで全部遊べること**が必須。
- 軽さが設計目標：初回読み込み合計 **3MB 以下**（three.min.js 約 600KB を含む）。画像・外部モデルは使わず、3D は手続き生成。
- 参考にする既存作：`/home/user/sakadosoutan-boop/-koumonnokai-`（鴻門の会。物語エンジン・授業モード・原文帳・人形の作り方）、
  `/home/user/-3D-`（寝殿造り 3D。建築部品・御簾・几帳・季節と時刻）。**-3D- の本体 HTML は 5MB あるので全文 Read 禁止**。
  `docs/handbook/PROJECT_MAP.md` の検索アンカーで位置を特定し、Grep と部分 Read で読む。

## ファイルと担当

| ファイル | 中身 |
|---|---|
| `src/js/core.js` | 名前空間 `GENJI`、`registerChapter` / `registerBunpo`、`rich()`（ルビ記法） |
| `src/data/chars.js` | 人物（id・名前・装束の手がかり） |
| `src/data/stage-spec.js` | 舞台・立ち位置・姿勢・効果などの語彙（データが使ってよい名前の一覧） |
| `src/data/bunpo.js` | 文法・敬語・古語の図鑑（共通） |
| `src/data/kiritsubo.js` / `wakamurasaki.js` | 帖のデータ（物語ノード・原文帳・結末） |
| `src/js/stage3d-kit.js` `stage3d-figures.js` `stage3d-hd.js` `stage3d-sets.js` `stage3d-activities.js` `stage3d.js` | 3D 舞台（`GENJI.Stage3D`）。`stage3d-hd.js` は高精細の人物（`GENJI.S3H`） |
| `src/js/stage3d-hd-assets.js` | 高精細の人物の頭部・手の網目と、女性・子どもの頭の肌の画像（約 5MB・CC0 由来）。`index.html` では読まず、表紙のあとに `stage3d-hd.js` が裏で読む。男の頭・手は `tools/extract-hd-assets.cjs`（鴻門の会から）、女性・子どもの頭は `tools/build-heian-heads.py`（Blender）で作る（手で直さない） |
| `src/js/stage2d.js` | 軽量の「絵巻モード」（`GENJI.Stage2D`。WebGL なしでも動く代役。API は 3D と同じ） |
| `src/js/games.js` `study.js` `ui.js` `engine.js` | 遊び（並べ・結び）、原文帳・図鑑、画面、物語の進行と保存 |
| `src/styles/*.css` | `base.css` `ui.css` `study.css`（エンジン側） / `stage3d.css`（3D 側） |
| `tools/verify-data.cjs` | 帖データの静的検証（`npm run verify`） |

クラス名は、エンジン側 `gj-`、3D 側 `gj3-`。DOM は `#gj-stage`（舞台。全画面）と `#gj-ui`（その上の文字と操作）。

## 本文の記法

- `{更衣|かうい}` … ルビ。**原文のルビは歴史的仮名遣い、現代語の文のルビは現代仮名遣い**。
- `【たまふ】` … 設問で問う語の強調。
- 原文をそのまま引くときは必ず原文の表記で。創作の地の文・台詞は現代語（品のある平明な文体）。

## 帖データ

```js
GENJI.registerChapter({
  id: 'kiritsubo', no: 1, title: '桐壺', sub: '光源氏の誕生',
  pov: 'koui', povNote: 'あなたは桐壺の更衣',          // 視点人物
  intro: '表紙に出す二〜三行の紹介',
  meters: [ { id: 'oboe', name: '御おぼえ', desc: '…', init: 2, min: 0, max: 10, tone: 'good'|'bad'|'life' } ],
  acts: [ { id: 'k1', title: '第一段　いづれの御時にか', scope: '教科書'|null, minutes: 10, nodes: [ …ノード… ] } ],
  genbun: [ …原文の段… ],
  endings: { 'k-true': { title: '…', kind: 'true'|'ibun', x: '結末の文章' } },
  cutin: { koui: ['桐壺の更衣', 'きりつぼのこうい', '別の呼び名', 'どんな人か一行'] },   // 初登場の帯
  furikaeri: [ '授業のまとめで問いたい「開いた問い」。結末画面に出す' ]
});
```

### ノード（`t` を省くと say）。`next` を省くと配列の次へ。分岐先は `id` で指す（帖の中で一意）

| t | 中身 |
|---|---|
| `scene` | `stage`, `light`, `season?`, `cast: ['id' | {id, at, pose?}]`, `card?: {title, sub}`（段の題）, `caption?`, `fade?` |
| `say` | `w?`（話し手。省くと地の文）, `x`, `b?`（吹き出し）, `at?`（カメラ）, `pose?: {id: 姿勢}`, `fx?`, `sfx?`, `src?: 'gen'`（原文そのままの引用。画面で区別して出す） |
| `gen` | `g`（原文の段 id）。原文・現代語訳・語注を出し、原文帳に綴じる |
| `ask` | `k`, `w?`, `q`（問い）, `stem?`（問う原文。【】で語を強調）, `o: [選択肢]`, `hint?`, `exp?`（解説）, `bunpo?`（図鑑 id）, `arrows?` |
| `if` | `f?`（フラグ名）または `m?: {meter: しきい値以上}` → `go`、そうでなければ `el`（省くと次へ） |
| `set` | `fx?: {meter: 増減}`, `set?: {flag: 値}` |
| `game` | `g`（遊びの種類）, `cfg`, `go?`, `el?` |
| `go` | `to` |
| `end` | `e`（endings の id） |

選択肢 `o[]`：`{ x, ok?, c?, go?, fx?, set?, r?, rw? }`。`r` は選んだあとの一言（`rw` はその話し手）。

`ask.k` の種類：

- `read` … 解釈。`ok` が正解（1 つ）。
- `subject` … **主語（動作主）は誰か**。選択肢に `c: 人物id` を書く（`x` は省ける）。`ok` が正解。
- `keigo` … **敬意の方向**。`stem` に敬語を【】で示し、選択肢は「尊敬語：作者→帝」のような文。
  `arrows: [{from, to, kind}]`（`kind` は `sonkei|kenjo|teinei`。`from` は人物 id か `'kataribe'`）を書くと、答えたあと 3D の人物の間に矢印が出る。
- `kokoro` … 心情。本文に根拠のある読みが複数あってよい（`ok` 複数可）。`exp` で本文の根拠を示す。
- `judge` … 決断。視点人物としての選択。物語が分かれてよい（`go`）。
- `waka` … 和歌の修辞・返歌。

原則：**読解の設問は必ず本文の根拠に戻れること**。`hint` は答えではなく着眼点。`exp` は「どの語からそう読めるか」。
人物の心理の推測は解釈として本文と区別して書く。

### 原文の段 `genbun[]`

```js
{ id: 'k01', title: 'いづれの御時にか', scope: '教科書'|null,
  text: '原文（{漢字|よみ} のルビ可。句読点・濁点は教科書に近い一般的な校訂本文）',
  yaku: '現代語訳（逐語に近く。補った主語は（　）に入れる）',
  chu:  [ { w: '語', x: '意味・説明' } ],
  hinshi: [ { s: 'いづれ', h: '代名詞' }, { s: 'の', h: '格助詞' }, { s: 'たまひ', h: '補助動詞・ハ四・連用', k: 'sonkei', to: 'mikado' } … ],  // 任意。教科書範囲の重要文だけでよい
  keigo: [ { w: 'たまふ', kind: 'sonkei', from: 'kataribe', to: 'mikado', note: '…' } ],
  bunpo: ['b-tamafu'] }
```

### 図鑑 `GENJI.registerBunpo([{ id, cat, title, yomi?, x, rei?: [{g, y}], }])`

`cat` は `keigo`（敬語）/ `jodoshi`（助動詞）/ `joshi`（助詞）/ `kogo`（重要古語）/ `shikitari`（平安のしきたり・後宮・装束・住まい）/ `waka`（和歌の修辞）。
共通の項目は `bunpo.js`（id は `b-…`）。若紫だけの項目は `wakamurasaki.js` の中で `w-…` として登録する。

### 遊び `game`

| g | 作る人 | cfg |
|---|---|---|
| `wataru` | 3D | 渡殿を歩いて渡る。`{ stage: 'kokyu'|'watadono', from, to, intro, outro, events: [{ at: 0〜1（道のり）, w?, x, fx?, kind?: 'whisper'|'block'|'dirt'|'door' }] }` |
| `kaimami` | 3D | 垣間見。`{ stage: 'soubou', intro, outro, targets: [{ id: 人物id, label, x: 見つけたときに出す原文の描写, yaku, gen? }] }` |
| `narabe` | DOM | 並べ替え。`{ q, items: [{id, x, sub?}], order: [正しい順の id], top, bottom, exp }` |
| `musubi` | DOM | 線で結ぶ。`{ q, left: [{id, x}], right: [{id, x}], pairs: {左id: 右id}, exp }` |

授業モードでは遊びに失敗はない（`go` へ進む）。

## 舞台 API（`GENJI.Stage3D` と `GENJI.Stage2D` は同じ形）

```js
supported()                     // WebGL が使えるか（2D は常に true）
mount(el, { quality: 'high'|'low' })   // el = #gj-stage。canvas などを中に作る（3D は 'lite' も受ける。下の「3D の画質」）
unmount();  resize();  setQuality(q)
setScene(sceneNode)             // stage, light, season, cast を受けて舞台を組み替える（Promise を返してもよい）
focus(at)                       // 'wide' | 人物id | 立ち位置。なめらかに寄る
speak(charId | null)            // 話し手をさりげなく示す（向き直る・明るくする等）
pose(charId, pose)
fx(name)                        // stage-spec.js の fx
arrows(list | null)             // 敬意の矢印 [{from, to, kind}]。null で消す。'kataribe' は画面の外（手前）から
activity(kind, cfg, cb)         // 3D の遊びを始める。→ { stop() }
```

`activity` のコールバック `cb`（エンジンが渡す）：

- `cb.say({ w?, x, src? })` → Promise。文字の窓に出し、生徒が送ったら解決する。
- `cb.meter({ soshiri: 1 })`、`cb.gen('w03')`（原文帳に綴じる）、`cb.done(result)`（終わり）。
- 操作のボタン（歩く・視点など）は 3D 側が `#gj-stage` の中に `gj3-` クラスで作る。文字の窓（画面の下 4 割ほど）と重ならない位置に。

見せ方の方針：**吹抜屋台**（屋根と天井を外し、斜め上から室内を見下ろす絵巻の構図）を基本に、要所で人物に寄る。
人物は 3D では解剖学的な頭部（CC0 の網目）に装束・身の丈に余る垂髪を手続きで重ねた**写実寄りの顔**。
若い女性は白粉・引眉の再現ではなく、**脚色して可愛く**（明るい自然な肌と頬のほのかな赤み、澄んだ黒褐色の瞳、ふんわりした眉、自然な紅、頬にかかる鬢削ぎ）。
大人の女性・尼君は同じ系統で年相応に、男は写実寄りで品よく。絵巻（軽量）では引目鉤鼻。どちらも後ろ姿・扇・御簾越しを使い、装束は襲の色目で人物を見分けさせる。
若紫などの子どもは頭身を下げて幼く清らかに作り、性的な印象を与える造形はしない。

## 学習モード

- **授業モード（初期設定）**：全段を開ける。誤答で失敗しない。一度目はヒントを出して選び直し、二度目に正解と解説。読解率は一度目で数える。
- **挑戦モード**：メーターが物語に効く。異聞の結末に入ることがある。
- 設定：3D／絵巻（軽量）、文字の大きさ（投影向け）、文字の即時表示、ルビの表示。
- 保存：`localStorage['genji:v1']`（設定・進み具合・綴じた原文・読解の記録）。保存できなくても遊べること。

## 考証と本文

- 原文は新編日本古典文学全集など一般的な校訂本文に近い形で引く。出典の確認方法と、判断に迷った点は `docs/KOUSHOU.md` に書く。
- 文法（品詞分解・敬意の方向）は**先生が最終確認する前提**。自信のない箇所は `docs/KOUSHOU.md` の「要確認」に挙げる。
- 女性の人物を軽く扱わない。後宮のいじめ・病・死は原文の重さのまま、扇情的にせず書く。

## 3D の遊びの差し込み口（実装メモ）

- 3D の遊びは `GENJI.S3A[kind] = function (ctx, act, cfg, cb, finish)`（`stage3d-activities.js`）。`act.frame(dt, t)` を置くと、その間のカメラは遊び側が動かす。`act.cleanup` で後始末。終わりは `finish(result)`。
- 遊びの補助ボタン（自動で歩く・手がかり）には `data-a3="auto"` をつける（タッチやキーボードが使いにくい生徒のための道でもあり、自動テストもこれを押す）。
- `wataru` は `cfg.stage` が `kokyu` なら桐壺から清涼殿まで全行程、`watadono` なら途中の廊ひとつ分を歩く。
- `kaimami` は小柴垣から一歩さがった所（垣の外）から望む。手前の柴は前ぼけ（`gj3-kaki`）として画面に掛け、部屋は垣の向こうに遠く見せる。

## 3D の人物（高精細版）と画質（実装メモ）

- 人物は `GENJI.S3F.make(id, opts)` が作る。`GENJI.S3H.loaded()`（頭部・手のデータが届いた）なら高精細版（`stage3d-hd.js`）、まだなら簡素な人形（`stage3d-figures.js`）。
  どちらも `root / setPose / speak / update / headWorld / dispose` の同じ形。データが届いたら、いまの舞台の人物もその場で差し替える。
- データは `src/js/stage3d-hd-assets.js`（約 5MB。上限 8MB）。`stage3d-hd.js` が `window.onload` のあとに `<script>` を足して読む（`fetch` を使わないので `file://` でも動く）。
  設定で絵巻（軽量）を選んでいる人には読まない。一枚 HTML（`dist/index.html`）では `<script type="text/plain" id="gj3-hd-data">` に埋め込み、同じく表紙のあとに実行する。
- 画質：`high` は影・物理ベースの材質・映り込み・木目の凹凸。`low`（エンジンが小さい画面・少ないメモリで選ぶ）でも高精細の人物は使い、顔の細かい網目は寄ったときだけ、影なし・材質は軽いもの。
  `lite`（`setQuality('lite')`、またはメモリ 2GB 以下）は簡素な人形だけ。読み込みに失敗したときも簡素な人形のまま動く。
- 寄り（`focus(人物)`）は胸から上の構図。顔は文字の窓（下 4 割）より上に置き、手前の柱・几帳・屏風・ほかの人物に遮られない方位と高さを選ぶ（舞台が `occ` に遮る物を集める）。
- 話し手は口（あご）が小さく動く。全員、呼吸とまばたき。
- 女性・子どもの頭（`heads.lady` 若い女性 / `woman` 大人の女性 / `ama` 尼君 / `girl` 少女・子ども）は `tools/build-heian-heads.py`（Blender）が作る。
  4 体は同じ網目なので、三角形の並び（`indices.hf_high/hf_low`）と UV（`uvs.hf_high/hf_low`）は共有し、頭ごとに位置と肌の画像（`tex.high` 1024 / `tex.low` 512、JPEG の data URI）を持つ。
  ふだんの顔はやわらかな微笑みで、表情なしの形への差を `lod.*.skin.dn`（位置と同じ符号化）に持つ。ゲームはモーフとして混ぜ、泣く・伏す・礼・祈る・書く姿勢では表情なしへ戻す。
  虹彩・まつ毛の画像は `tex.iris` / `tex.lash`。目印 `anchors` に眼球の中心・半径・まぶたを開いた角度（`eyes[].open`）・まつ毛を植える上まぶたのふち（`eyes[].lash`）・口の高さ（`mouth`）。
  人物 id → 頭の割り当てと、人ごとの少しの違い（顔の幅・目の大きさ・あごの長さ）は `stage3d-hd.js` の `heianRole` / `HSHAPE`。データに 4 体がないときは、もとの虞美人の頭（`female`）で白粉の顔になる。
- 確認：`node tests/stage-smoke.cjs`（実ブラウザーで全舞台・全人物 × 全姿勢・寄り・遊び・dist）。目視は `tools/stage-preview.html`（`?q=lite` で簡素な人形）。
