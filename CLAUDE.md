# 源氏物語（桐壺・若紫）— CLAUDE.md

源氏物語を「ノベルゲーム＋要所で 3D を操作する」形で読む、高校古典探究の学習ゲーム。ビルド不要・ブラウザ完結。
姉妹作は「鴻門の会」（-koumonnokai-）と「寝殿造り3D探訪」（-3D-）。

## 最重要ルール

- 取り決めの正本は `docs/CONTRACT.md`（データ形式・舞台 API・担当の境界）。形式を変えるときは CONTRACT → `tools/verify-data.cjs` → 実装の順。
- **帖＝データ 1 ファイル**（`src/data/<帖>.js`）。帖を足すときはエンジンに手を入れず、データと `index.html` の script 1 行で足りるようにする。
- 舞台・立ち位置・姿勢などの名前は `src/data/stage-spec.js` にあるものだけ。足すときは 3D（`stage3d-*.js`）と絵巻モード（`stage2d.js`）の両方に実装する。
- 軽さが設計目標：外部モデル・画像・CDN を使わない。初回読み込み合計 3MB 以下。スマホ縦持ちで全部遊べること。
- 原文は出典に当たって確かめる（記憶で書かない）。文法（品詞分解・敬意の方向）で迷った点は `docs/KOUSHOU*.md` の「要確認」に挙げる。
- 少女（若紫）を性的に描かない。後宮のいじめ・病・死を扇情的にしない。

## 検証コマンド

| コマンド | 内容 |
|---|---|
| `npm test` | 帖データの静的検証 → エンジンの回帰テスト（jsdom） |
| `npm run verify` | 帖データの静的検証だけ（`node tools/verify-data.cjs 帖id` で 1 帖だけ） |
| `npm run test:browser` | Playwright で実ブラウザ確認（PC・スマホ縦・3D） |
| `npm run build` | 一枚にまとめた `dist/index.html` を作る（CI が最新かを調べる） |

変更後は `npm test` と `npm run build` を通す。3D を触ったら `tools/stage-preview.html` で目視する。

## コミット規約

- `feat:` / `fix:` / `docs:` / `chore:` / `perf:` ＋日本語要約。
