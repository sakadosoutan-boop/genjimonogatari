/* 登場人物。台詞の話し手（w）・舞台の配役（cast）・主語当ての選択肢（c）はこの id で指す。
 * look は 3D の人形を作るための手がかり（装束の型と襲の色）。考証の根拠は docs/KOUSHOU.md に書く。
 *   kind: juni=女房装束（袿姿） / kouchiki=小袿 / noshi=直衣 / sokutai=束帯 / kariginu=狩衣 /
 *         ama=尼（尼削ぎ・鈍色） / sou=僧 / shojo=少女（袿・振り分け髪〜肩） / warawa=童 / chigo=幼子
 *   colors: 表の色から順に（襲の見える重なり）。 */
(function (root) {
  'use strict';
  var G = root.GENJI;
  G.chars = {
    you:       { name: 'あなた', full: 'あなた', seal: '我' },
    kataribe:  { name: '語り手', full: '語り手（物語を語る女房）', seal: '語' },

    /* 桐壺 */
    koui:      { name: '桐壺の更衣', yomi: 'きりつぼのこうい', full: '桐壺の更衣（光源氏の母）', seal: '桐',
                 look: { kind: 'juni', colors: ['#c9a9d6', '#e7d6ee', '#f6f0f8', '#8fae7e'], note: '藤・薄色の襲。はかなげに' } },
    mikado:    { name: '帝', yomi: 'みかど', full: '桐壺帝（光源氏の父）', seal: '帝',
                 look: { kind: 'noshi', colors: ['#f4efe2', '#b53a3a', '#5a2a6e'], note: '御引直衣。白の直衣に紅の袴' } },
    kokiden:   { name: '弘徽殿の女御', yomi: 'こきでんのにょうご', full: '弘徽殿の女御（右大臣の娘・一の皇子の母）', seal: '弘',
                 look: { kind: 'juni', colors: ['#a3202c', '#d9534f', '#f0c36a', '#3d6b4f'], note: '紅の匂。威のある色' } },
    kata:      { name: '女御・更衣たち', yomi: 'にょうご・こういたち', full: '後宮の女御・更衣たち', seal: '方',
                 look: { kind: 'juni', colors: ['#c66a3a', '#e9b872', '#f3e3b0', '#5b7a4a'], note: '群像。二〜三人で一組' } },
    nyobo:     { name: '女房', yomi: 'にょうぼう', full: '更衣に仕える女房', seal: '房',
                 look: { kind: 'juni', colors: ['#7f9bbd', '#c9d7e8', '#f2f2ee', '#8a6d3b'] } },
    haha:      { name: '母北の方', yomi: 'ははきたのかた', full: '更衣の母（故大納言の北の方）', seal: '母',
                 look: { kind: 'kouchiki', colors: ['#6b6470', '#9a93a0', '#d8d4dc'], note: '落ち着いた鈍色がかった襲' } },
    wakamiya:  { name: '若宮', yomi: 'わかみや', full: '若宮（のちの光源氏）', seal: '光',
                 look: { kind: 'chigo', colors: ['#f6f0f8', '#e9c46a'] } },
    ichinomiya:{ name: '一の皇子', yomi: 'いちのみこ', full: '一の皇子（弘徽殿の女御の子・のちの朱雀帝）', seal: '一',
                 look: { kind: 'warawa', colors: ['#b53a3a', '#f4efe2'] } },
    kandachime:{ name: '上達部・殿上人', yomi: 'かんだちめ・てんじょうびと', full: '上達部・殿上人（朝廷の貴族たち）', seal: '卿',
                 look: { kind: 'sokutai', colors: ['#1d1b22', '#f4efe2', '#b53a3a'], note: '黒の袍' } },
    myobu:     { name: '靫負命婦', yomi: 'ゆげいのみょうぶ', full: '靫負命婦（帝の使いの女房）', seal: '命',
                 look: { kind: 'juni', colors: ['#5d7f6a', '#a9c4a4', '#eef3e6', '#b0763a'] } },
    fujitsubo: { name: '藤壺', yomi: 'ふじつぼ', full: '藤壺の宮（先帝の四の宮）', seal: '藤',
                 look: { kind: 'juni', colors: ['#7d4f9e', '#b79ad0', '#e9def2', '#3f7a5e'], note: '紫の匂。輝く日の宮' } },

    /* 若紫 */
    genji:     { name: '光源氏', yomi: 'ひかるげんじ', full: '光源氏（十八歳・中将）', seal: '源',
                 look: { kind: 'kariginu', colors: ['#e9e4d4', '#7fa0b8', '#6a4a86'], note: 'お忍びの狩衣姿。やつれた装い' } },
    koremitsu: { name: '惟光', yomi: 'これみつ', full: '惟光（源氏の乳母子・腹心の従者）', seal: '惟',
                 look: { kind: 'kariginu', colors: ['#6f7f55', '#c9c2a0', '#3d3a34'] } },
    amagimi:   { name: '尼君', yomi: 'あまぎみ', full: '尼君（若紫の祖母）', seal: '尼',
                 look: { kind: 'ama', colors: ['#8c8a86', '#c8c6c0', '#efeeea'], note: '四十余ばかり。尼削ぎの髪、白く上品' } },
    murasaki:  { name: '若紫', yomi: 'わかむらさき', full: '若紫（十ばかりの少女・のちの紫の上）', seal: '紫',
                 look: { kind: 'shojo', colors: ['#f4efe2', '#d9a441', '#e7c56a'], note: '白き衣、山吹などのなえたる' } },
    shonagon:  { name: '少納言の乳母', yomi: 'しょうなごんのめのと', full: '少納言の乳母（若紫の世話役）', seal: '乳',
                 look: { kind: 'juni', colors: ['#8a5a44', '#d2a679', '#efe2c8', '#55704f'], note: '髪ゆるるかにいと長く' } },
    otona:     { name: '女房', yomi: 'にょうぼう', full: '尼君に仕える大人の女房', seal: '房',
                 look: { kind: 'juni', colors: ['#6f8fa6', '#bcd0dc', '#f0f0ea', '#8a6d3b'] } },
    inuki:     { name: '犬君', yomi: 'いぬき', full: '犬君（雀の子を逃がした童女）', seal: '犬',
                 look: { kind: 'warawa', colors: ['#c9794a', '#f0d9a8'] } },
    warawabe:  { name: '童べ', yomi: 'わらわべ', full: '遊んでいる童女たち', seal: '童',
                 look: { kind: 'warawa', colors: ['#7fae8a', '#f0e6c0'] } },
    sozu:      { name: '僧都', yomi: 'そうず', full: '北山の僧都（尼君の兄）', seal: '僧',
                 look: { kind: 'sou', colors: ['#5b4a3a', '#a58c5c', '#e8e0cc'] } },
    hijiri:    { name: '聖', yomi: 'ひじり', full: '北山の聖（行者）', seal: '聖',
                 look: { kind: 'sou', colors: ['#3d3a34', '#6f6a5c', '#d8d2c0'], note: '老いた行者' } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
