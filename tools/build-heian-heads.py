"""平安の女性・子どもの頭（高精細版）を Blender で作り、ゲームの裏読み込みデータへ書き出す。

  /opt/bpyenv/bin/python tools/build-heian-heads.py [--bundle 素材.blend] [--render 出力フォルダ] [--roles lady,woman,ama,girl] [--no-write]

素材: Blender Studio「Human Base Meshes v1.2.0」（CC0-1.0）
  https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.2.0.zip
  zip の SHA-256 = b7421350cbad8425dd1ba93c4248867a1c236cc8a3a3dc140d4c2a03144c4bad
  使う物体: GEO-body_female_realistic（写実の女性の全身。多重解像度 0・1 段の頭と首だけを切り出す）と、その眼球 .eye.L/.eye.R（位置だけ）
  --bundle を省くと ~/.cache/heian-heads/ に取得して照合する（ネットワークが要る）。

改変（すべてこのスクリプトの手続き。手作業の彫刻はしない）
  1. 頭と首を、姉妹作「鴻門の会」の虞美人と同じ正準座標（x*0.9, (z-1.5144)*0.9, -y*0.9-0.045。y 上・z 前）へ移し、
     首の切り口（y = -0.112）より上だけ残して左右対称にそろえる。
  2. 「脚色した可愛さ」への変形（cute()）：目の開きを広げ、上まぶたを少し下げて黒目の上を覆い、顔の下半分を縦に縮め、
     鼻を小さく、唇を小さくふっくら、頬をふくらませ、あごの線を細く・あご先を小さく丸く、額を丸く、首を細く。
     役ごとに度合いを変える（ROLES）：若い女性 lady / 大人の女性 woman / 尼君 ama / 少女・子ども girl。
  3. UV は元の網目の展開（左右が別タイル）を 1 枚にまとめ、左右の顔を同じ場所に重ねる（塗りは左右対称）。
     口の中は奥行きで暗くなる細い帯、首の後ろの切れ端は肌の点へ寄せる。
  4. 肌のテクスチャは手続きで塗る（paint_face()）：明るい自然な肌、頬のほのかな赤み、自然な紅の唇、
     ふんわりした眉、上のまつ毛の生え際（アイライン）、二重の線、近所の陰り（光線で求めた AO）。
     虹彩（黒褐色・放射の筋・ふちの輪・瞳孔・キャッチライト）とまつ毛の帯も手続きの画像。
  5. 眼球の半径・まぶたを開いたときの角度・まつ毛を植える上まぶたのふちを、網目から求めて目印（anchors）に入れる。
書き出し: src/js/stage3d-hd-assets.js の heads.lady/woman/ama/girl と、共有の三角形の並び・UV・画像（tex）を置き換える
（ほかの頭・手は tools/extract-hd-assets.cjs が鴻門の会から作ったものをそのまま残す）。
"""
import bpy, sys, os, math, json, time, base64, hashlib, struct, zipfile, urllib.request, collections
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
URL = 'https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.2.0.zip'
SHA = 'b7421350cbad8425dd1ba93c4248867a1c236cc8a3a3dc140d4c2a03144c4bad'
CUT = -0.112          # 首の切り口（これより上を残す。胴の首の上端 ≈ -0.102 に少し差し込む）
QUANT = 0.00001       # 位置の量子化（1/100000 m）

# ---------------------------------------------------------------- 引数
def arg(name, default=None):
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if name in a:
        i = a.index(name)
        return a[i + 1] if i + 1 < len(a) and not a[i + 1].startswith('--') else True
    return default

# ---------------------------------------------------------------- 素材
def bundle_path():
    p = arg('--bundle')
    if p: return os.path.abspath(p)
    cache = os.path.expanduser('~/.cache/heian-heads'); os.makedirs(cache, exist_ok=True)
    z = os.path.join(cache, 'human-base-meshes-bundle-v1.2.0.zip'); b = os.path.join(cache, 'human_base_meshes_bundle.blend')
    if not os.path.exists(b):
        if not os.path.exists(z):
            print('取得中', URL); urllib.request.urlretrieve(URL, z)
        h = hashlib.sha256(open(z, 'rb').read()).hexdigest()
        if h != SHA: raise SystemExit('✖ 素材の照合値が違います: ' + h)
        with zipfile.ZipFile(z) as f: f.extract('human_base_meshes_bundle.blend', cache)
    return b

def canon(v):
    return np.array([v[0] * .90, (v[2] - 1.5144) * .90, -v[1] * .90 - .045])

def load_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = ['GEO-body_female_realistic', 'GEO-body_female_realistic.eye.L', 'GEO-body_female_realistic.eye.R']
    with bpy.data.libraries.load(path, link=False) as (s, d): d.objects = names
    for o in d.objects: bpy.context.scene.collection.objects.link(o)
    body = d.objects[0]; bpy.context.view_layer.update()
    eyes = [canon(body.matrix_world.inverted() @ o.matrix_world.translation) for o in d.objects[1:]]
    E = [abs(eyes[0][0]), (eyes[0][1] + eyes[1][1]) / 2, (eyes[0][2] + eyes[1][2]) / 2]
    lv = {}
    for level in (0, 1):
        for md in body.modifiers:
            if md.type == 'MULTIRES': md.levels = level
        dg = bpy.context.evaluated_depsgraph_get(); me = body.evaluated_get(dg).to_mesh()
        P = np.array([canon(v.co) for v in me.vertices]); uvl = me.uv_layers.active.data
        T, U = [], []
        for pl in me.polygons:
            vs = list(pl.vertices)
            if not all(P[i][1] > CUT for i in vs): continue
            us = [tuple(uvl[li].uv) for li in pl.loop_indices]
            for k in range(1, len(vs) - 1): T.append([vs[0], vs[k], vs[k + 1]]); U.append([us[0], us[k], us[k + 1]])
        T = np.array(T, np.int64); used = np.unique(T); remap = -np.ones(len(P), np.int64); remap[used] = np.arange(len(used))
        lv[level] = dict(P=symmetrize(P[used]), T=remap[T].astype(np.int32), U=np.array(U, np.float32))
        body.evaluated_get(dg).to_mesh_clear()
        print('  多重解像度', level, '頂点', len(used), '三角形', len(T))
    return lv, [[E[0], E[1], E[2]], [-E[0], E[1], E[2]]]

def symmetrize(P):
    kd = KDTree(len(P))
    for i, p in enumerate(P): kd.insert(Vector(p), i)
    kd.balance()
    Q = P.copy()
    for i, p in enumerate(P):
        co, j, d = kd.find(Vector((-p[0], p[1], p[2])))
        if d < 0.001:
            if j == i: Q[i, 0] = 0
            else: Q[i] = (p + np.array([-P[j][0], P[j][1], P[j][2]])) / 2
    return Q

# ---------------------------------------------------------------- 変形
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def gauss(x, s): return np.exp(-(x / s) ** 2)
def normals(P, T):
    n = np.zeros_like(P); fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3): np.add.at(n, T[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

CUTE = dict(
    face_y=0.88,                          # 目より下の顔の縦の縮み（中顔面・下顔面を短く）
    eye_x=1.20, eye_y=1.14, eye_r=1.12,   # 目の開きの拡大と眼球の大きさ
    eye_tilt=0.0012,                      # 目尻を少し上げる
    lid_drop=0.0024, lid_y=0.0088,        # 上まぶたを下げて黒目の上を覆う
    inner=0.0008,                         # 目頭をとがらせる
    nose=0.82, nose_lift=0.0, nose_bridge=0.0,
    cheek=0.0036,                         # 頬のふくらみ
    jaw=0.14, chin=0.0030, chin_round=1.0,
    lips_w=0.86, lips_full=0.0010,
    forehead=0.0022, neck=0.10, head_w=1.0,
    child=0.0,                            # 子どもの比率（顔を小さく、額を広く）
    age=0.0,                              # 老い（頬のたるみ・目の下）
)

def cute(P, T, E, cfg, U=None):
    c = dict(CUTE); c.update(cfg or {})
    P = P.copy()
    eyeY, eyeZ, eyeX = float(E[0][1]), float(E[0][2]), abs(float(E[0][0]))
    bottom = CUT
    # 0) 子ども：眉より下の顔を小さく（額と頭は大きいまま）。首も細く
    if c['child'] and c.get('child_shrink'):
        k = c['child']; cy, cz = eyeY + 0.016, -0.005
        w = smooth(cy + 0.01, cy - 0.01, P[:, 1]) * smooth(-0.05, 0.0, P[:, 2]) * smooth(bottom, bottom + 0.03, P[:, 1])
        s = 1 - 0.13 * k * w
        P[:, 0] *= s; P[:, 1] = cy + (P[:, 1] - cy) * s; P[:, 2] = cz + (P[:, 2] - cz) * (1 - 0.06 * k * w)
        eyeY = cy + (eyeY - cy) * (1 - 0.13 * k); eyeX *= 1 - 0.13 * k; eyeZ = cz + (eyeZ - cz) * (1 - 0.06 * k)
    # 1) 目：開きを広げる（目の中心のまわりを拡大。まぶた・眼窩ごと）
    eyes = []
    for sx in (1, -1):
        ex, ey, ez = sx * eyeX, eyeY, eyeZ
        dx, dy, dz = P[:, 0] - ex, P[:, 1] - ey, P[:, 2] - ez
        r = np.sqrt((dx / 1.25) ** 2 + dy ** 2)
        w = gauss(r, 0.019) * smooth(ez - 0.03, ez - 0.005, P[:, 2])
        P[:, 0] = ex + dx * (1 + (c['eye_x'] - 1) * w)
        P[:, 1] = ey + dy * (1 + (c['eye_y'] - 1) * w) + c['eye_tilt'] * w * np.clip(sx * dx / 0.015, -1, 1)
        P[:, 2] = ez + dz * (1 + (c['eye_r'] - 1) * 0.6 * w)
        eyes.append([ex, ey, ez])
        wl = gauss(P[:, 0] - ex, 0.0115) * gauss(P[:, 1] - (ey + c['lid_y']), 0.0045) * smooth(ez - 0.012, ez - 0.002, P[:, 2])
        P[:, 1] -= c['lid_drop'] * wl; P[:, 2] += 0.3 * c['lid_drop'] * wl
        wi = gauss(P[:, 0] - (ex - sx * 0.011), 0.004) * gauss(P[:, 1] - ey, 0.004) * smooth(ez - 0.012, ez - 0.002, P[:, 2])
        P[:, 0] -= sx * c['inner'] * wi
        if c['age']:   # 目の下のたるみ・まぶたのかぶさり
            wu = gauss(P[:, 0] - ex, 0.010) * gauss(P[:, 1] - (ey - 0.0085), 0.003) * smooth(ez - 0.005, ez + 0.005, P[:, 2])
            P[:, 2] += 0.0008 * c['age'] * wu
            wh = gauss(P[:, 0] - (ex + sx * 0.007), 0.007) * gauss(P[:, 1] - (ey + 0.009), 0.003) * smooth(ez - 0.006, ez, P[:, 2])
            P[:, 1] -= 0.0008 * c['age'] * wh
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    # 2) 顔の下半分を縦に縮める（目の高さを基準に。首の切り口は固定）
    s = c['face_y']; yc = eyeY - 0.005; g = -0.09 if not c['child'] else -0.09 + 0.012 * c['child']
    gy = yc + (g - yc) * s
    ny = np.where(y < yc, yc + (y - yc) * s, y)
    ny = np.where(y < g, bottom + (y - bottom) * (gy - bottom) / (g - bottom), ny)
    P[:, 1] = y + (ny - y) * smooth(-0.045, 0.02, z)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    k0 = (1 - 0.13 * c['child']) if c['child'] else 1.0
    def fy(v):   # 元の高さ → 縮めたあとの高さ
        if c['child']: v = (eyeY + 0.0) + (v - 0.018) * k0
        return yc + (v - yc) * s
    noseY, mouthY, chinY = fy(-0.010), fy(-0.0425), fy(-0.070)
    # 3) 鼻：小さく
    root = np.array([0, fy(-0.004), 0.083 * (1 if not c['child'] else 0.97)])
    wn = gauss(x, 0.017) * gauss(y - fy(-0.008), 0.017) * smooth(0.074 * k0, 0.092 * k0, z)
    for k in range(3): P[:, k] += (root[k] - P[:, k]) * (1 - c['nose']) * wn
    P[:, 1] += c['nose_lift'] * gauss(x, 0.011) * gauss(y - noseY, 0.010) * smooth(0.09 * k0, 0.104 * k0, z)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    if c.get('nose_w', 1) != 1:   # 小鼻をすぼめる（鼻の穴を正面から見せない）
        wa = gauss(y - (noseY - 0.004), 0.009) * gauss(np.abs(x) - 0.011, 0.009) * smooth(0.068, 0.088, z)
        P[:, 0] *= 1 - (1 - c['nose_w']) * wa
        P[:, 2] -= 0.0012 * (1 - c['nose_w']) / 0.2 * gauss(y - (noseY - 0.006), 0.004) * gauss(np.abs(x) - 0.008, 0.005) * smooth(0.075, 0.092, z)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    # 4) 唇：幅を少し狭く、ふっくら
    wl = gauss(x, 0.024) * gauss(y - mouthY, 0.011) * smooth(0.075 * k0, 0.09 * k0, z)
    P[:, 0] *= 1 - (1 - c['lips_w']) * wl
    full = gauss(x, 0.016) * (gauss(y - (mouthY + 0.0055), 0.004) + gauss(y - (mouthY - 0.0065), 0.0045)) * smooth(0.08 * k0, 0.09 * k0, z)
    P[:, 2] += c['lips_full'] * full
    if c.get('lower_full'):   # 下唇をふっくら
        P[:, 2] += c['lower_full'] * gauss(x, 0.011) * gauss(y - (mouthY - 0.0062), 0.0035) * smooth(0.08 * k0, 0.09 * k0, z)
    if c.get('mouth_back'):   # 口もとを少し奥へ（唇が前へ突き出て見えないように）
        P[:, 2] -= c['mouth_back'] * gauss(x, 0.02) * gauss(y - mouthY, 0.012) * smooth(0.065 * k0, 0.088 * k0, z)
    # 5) 頬のふくらみ
    N = normals(P, T); x, y, z = P[:, 0], P[:, 1], P[:, 2]
    wc = gauss(np.abs(x) - 0.040 * k0, 0.016) * gauss(y - fy(-0.016), 0.017) * smooth(0.035, 0.065, z)
    P += N * (c['cheek'] * wc)[:, None]
    if c.get('cheek_low'):   # 子どもの頬の下のふくらみ（丸い輪郭）
        wl2 = gauss(np.abs(x) - 0.038, 0.015) * gauss(y - (mouthY - 0.004), 0.015) * smooth(0.02, 0.06, z)
        P += N * (c['cheek_low'] * wl2)[:, None]
    if c['age']:   # 頬の下がり（ほうれい線のわき）
        wa = gauss(np.abs(x) - 0.030, 0.012) * gauss(y - (mouthY + 0.004), 0.012) * smooth(0.05, 0.08, z)
        P[:, 1] -= 0.0012 * c['age'] * wa
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    # 6) あごの線を細く、あご先を小さく丸く
    jw = smooth(fy(-0.030), fy(-0.072), y) * smooth(bottom, fy(-0.09) + 0.004, y) * smooth(-0.02, 0.03, z)
    P[:, 0] *= 1 - c['jaw'] * jw
    P[:, 2] -= c['chin'] * gauss(x, 0.02 * c['chin_round']) * gauss(y - chinY, 0.013) * smooth(0.06 * k0, 0.08 * k0, z)
    # 7) 額の丸み
    N = normals(P, T)
    wfh = gauss(P[:, 0], 0.035) * gauss(P[:, 1] - 0.065, 0.025) * smooth(0.03, 0.07, P[:, 2])
    P += N * (c['forehead'] * wfh)[:, None]
    # 8) 首を細く
    wk = smooth(fy(-0.075), bottom + 0.004, P[:, 1]) * (1 - smooth(0.04, 0.07, P[:, 2]))
    P[:, 0] *= 1 - c['neck'] * wk
    P[:, 0] *= c['head_w']
    # 9) 首の下端を胴の首の輪（ゲームの胴の上端：半径 0.054×0.052、中心 z=-0.024）の内に収める（襟の前で切り口が見えないように）
    cz = -0.024; dx = P[:, 0]; dz = P[:, 2] - cz
    r = np.sqrt((dx / 0.047) ** 2 + (dz / 0.045) ** 2)
    wq = smooth(-0.088, -0.106, P[:, 1]) * smooth(0.0, 0.0001, P[:, 1] - bottom + 1)   # 首の下ほど強く
    k = np.where(r > 1, 1 / np.maximum(r, 1e-6), 1.0)
    P[:, 0] = dx * (1 + (k - 1) * wq); P[:, 2] = cz + dz * (1 + (k - 1) * wq)
    # 10) 表情（最後の段）：やわらかな微笑み。ここまでの位置を「表情なし」として残し、ゲームでは泣く・伏す姿勢のときにそちらへ戻す
    P0n = P.copy()
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ex0, ey0, ez0 = abs(eyes[0][0]), eyes[0][1], eyes[0][2]
    if c.get('smile') and U is not None:
        # 口角を上げて少し奥へ。唇の合わせ目＝口の中の UV の島（タイル u≥1）と顔の島が共有する頂点。
        # 合わせ目の口角と、その先の溝ごと持ち上げる（紅だけ上げても網目の「への字」の溝が残るため）
        tile = np.floor(U[..., 0].mean(1)) >= 1
        sv = np.intersect1d(np.unique(T[tile]), np.unique(T[~tile]))
        Q = P[sv]; Q = Q[(np.abs(Q[:, 1] - mouthY) < 0.012) & (Q[:, 2] > 0.06)]
        if len(Q) > 4:
            xc = np.abs(Q[:, 0]).max()
            order = np.argsort(np.abs(Q[:, 0])); qx = np.abs(Q[order, 0]); qy = Q[order, 1]
            sy = np.interp(np.abs(x), qx, qy)
            lift = smooth(0.3 * xc, 1.0 * xc, np.abs(x)) * (1 - 0.5 * smooth(xc, xc + 0.012, np.abs(x)))
            ws = lift * gauss(y - sy, 0.0065) * smooth(0.05 * k0, 0.08 * k0, z)
            P[:, 1] += c['smile'] * ws
            P[:, 2] -= c.get('smile_back', 0.0) * ws
    if c.get('cheek_raise'):   # 頬の高いところ（頬骨の上）を持ち上げて丸く前へ
        wz = gauss(np.abs(x) - (ex0 + 0.006), 0.014) * gauss(y - (ey0 - 0.024), 0.011) * smooth(0.035, 0.065, z)
        P[:, 1] += c['cheek_raise'] * wz; P[:, 2] += 0.6 * c['cheek_raise'] * wz
    if c.get('lower_lid'):   # 下まぶたを少し上げる（笑った目）。眼球に沿うよう前へも
        wd = gauss(np.abs(x) - ex0, 0.0092) * gauss(y - (ey0 - 0.0080), 0.0040) * smooth(ez0 - 0.006, ez0 + 0.004, z)
        P[:, 1] += c['lower_lid'] * wd; P[:, 2] += 0.45 * c['lower_lid'] * wd
    return P, dict(eyes=eyes, eye_r=c['eye_r'], mouthY=float(mouthY), noseY=float(noseY), chinY=float(chinY), cfg=c, neutral=P0n)

# ---------------------------------------------------------------- 光線：外から見えるか・AO
def eye_spheres(eyes, R):
    verts, tris = [], []
    for e in eyes:
        base = len(verts); nu, nv = 24, 12
        for j in range(nv + 1):
            th = math.pi * j / nv
            for i in range(nu):
                ph = 2 * math.pi * i / nu
                verts.append((e[0] + R * math.sin(th) * math.cos(ph), e[1] + R * math.cos(th), e[2] + R * math.sin(th) * math.sin(ph)))
        for j in range(nv):
            for i in range(nu):
                a = base + j * nu + i; b = base + j * nu + (i + 1) % nu
                tris += [(a, a + nu, b), (b, a + nu, b + nu)]
    return verts, tris

def classify(P, T, eyes, R):
    N = normals(P, T)
    ev, et = eye_spheres(eyes, R * 0.985)
    bvh = BVHTree.FromPolygons([tuple(p) for p in P.tolist()] + ev, [tuple(t) for t in T.tolist()] + [(a + len(P), b + len(P), c + len(P)) for a, b, c in et], all_triangles=True)
    dirs = np.random.default_rng(3).normal(size=(32, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    ext = np.zeros(len(P), bool); ao = np.zeros(len(P))
    for i in range(len(P)):
        n = N[i]; p = Vector(P[i] + n * 0.0003)
        vis = bvh.ray_cast(p, Vector(n), 0.3)[0] is None
        occ = 0.0; ws = 0.0
        for d in dirs:
            cc = float(d @ n)
            if cc < 0: d = -d; cc = -cc
            hit = bvh.ray_cast(p, Vector(d), 0.3)
            if hit[0] is None:
                if cc > 0.35: vis = True
            else: occ += cc * max(0.0, 1 - hit[3] / 0.035)
            ws += cc
        ext[i] = vis; ao[i] = 1 - occ / max(ws, 1e-6)
    return ext, ao, N

# ---------------------------------------------------------------- UV
MOUTH_STRIP = (0.975, 0.33, 0.62)
SKIN_PATCH = (0.985, 0.03)
KIND_ID = {'face': 1, 'ear': 2, 'socket': 3}

def islands(T, U):
    parent = list(range(len(T)))
    def f(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    edge = {}
    for ti, (t, u) in enumerate(zip(T, U)):
        for k in range(3):
            a, b = int(t[k]), int(t[(k + 1) % 3]); ua, ub = tuple(np.round(u[k], 5)), tuple(np.round(u[(k + 1) % 3], 5))
            key = (min(a, b), max(a, b), tuple(sorted([ua, ub])))
            if key in edge: parent[f(ti)] = f(edge[key])
            else: edge[key] = ti
    return np.array([f(i) for i in range(len(T))])

def atlas(P, T, U):
    lab = islands(T, U); out = np.zeros_like(U); kind = np.empty(len(T), object)
    for r in set(lab.tolist()):
        idx = np.where(lab == r)[0]; uu = U[idx]
        tu = int(np.floor(uu[..., 0].mean())); tv = int(np.floor(uu[..., 1].mean()))
        c = uu.reshape(-1, 2).mean(0) - np.array([tu, tv])
        if tu == 0 and tv in (0, 2):
            o = uu.copy(); o[..., 1] -= tv; out[idx] = o
            kind[idx] = 'socket' if (c[0] > 0.774 and c[1] < 0.35) else 'ear' if (c[0] > 0.74 and c[1] > 0.75) else 'face'
        elif tu == 1 and tv in (0, 2):
            z = P[T[idx]][..., 2]
            out[idx, :, 0] = MOUTH_STRIP[0]; out[idx, :, 1] = MOUTH_STRIP[1] + (MOUTH_STRIP[2] - MOUTH_STRIP[1]) * np.clip(z / 0.095, 0, 1)
            kind[idx] = 'mouth'
        else:
            out[idx] = SKIN_PATCH; kind[idx] = 'patch'
    return out, kind

def split_uv(T, TU):
    src, uv, tri, key = [], [], [], {}
    for t, us in zip(T, TU):
        o = []
        for vi, uu in zip(t, us):
            kk = (int(vi), int(round(float(uu[0]) * 65535)), int(round(float(uu[1]) * 65535)))
            if kk not in key: key[kk] = len(src); src.append(int(vi)); uv.append([kk[1], kk[2]])
            o.append(key[kk])
        tri.append(o)
    return np.array(src, np.int32), np.array(uv, np.int32), np.array(tri, np.int32)

def raster(P, N, AO, T, TU, kinds, S):
    pos = np.zeros((S, S, 3)); ao = np.ones((S, S)); mask = np.zeros((S, S), bool); kid = np.zeros((S, S), np.int8)
    for t, us, k in zip(T, TU, kinds):
        if k not in KIND_ID or P[t][:, 0].mean() > 0.0005: continue
        a, b, c = us * S - 0.5
        xmin = int(max(0, math.floor(min(a[0], b[0], c[0])))); xmax = int(min(S - 1, math.ceil(max(a[0], b[0], c[0]))))
        ymin = int(max(0, math.floor(min(a[1], b[1], c[1])))); ymax = int(min(S - 1, math.ceil(max(a[1], b[1], c[1]))))
        if xmax < xmin or ymax < ymin: continue
        xs, ys = np.meshgrid(np.arange(xmin, xmax + 1), np.arange(ymin, ymax + 1))
        v0 = b - a; v1 = c - a; den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12: continue
        px = xs - a[0]; py = ys - a[1]
        l1 = (px * v1[1] - v1[0] * py) / den; l2 = (v0[0] * py - px * v0[1]) / den; l0 = 1 - l1 - l2
        m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not m.any(): continue
        kid[ys[m], xs[m]] = KIND_ID[k]
        pos[ys[m], xs[m]] = l0[m, None] * P[t[0]] + l1[m, None] * P[t[1]] + l2[m, None] * P[t[2]]
        ao[ys[m], xs[m]] = l0[m] * AO[t[0]] + l1[m] * AO[t[1]] + l2[m] * AO[t[2]]
        mask[ys[m], xs[m]] = True
    for _ in range(8):   # 隙間を近傍で埋める（にじみ止め）
        hole = ~mask
        if not hole.any(): break
        acc = np.zeros_like(pos); acc2 = np.zeros((S, S)); cnt = np.zeros((S, S)); kacc = np.zeros((S, S), np.int8)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(mask, dy, 0), dx, 1)
            acc += np.roll(np.roll(pos, dy, 0), dx, 1) * sh[..., None]; acc2 += np.roll(np.roll(ao, dy, 0), dx, 1) * sh; cnt += sh
            kacc = np.maximum(kacc, np.roll(np.roll(kid, dy, 0), dx, 1) * sh)
        fill = hole & (cnt > 0)
        pos[fill] = acc[fill] / cnt[fill, None]; ao[fill] = acc2[fill] / cnt[fill]; kid[fill] = kacc[fill]; mask |= fill
    return pos, ao, mask, kid

def margins(P, T, ext, kinds, eyes):
    """見えるまぶたのふち：外から見える頂点のうち、見えない頂点と三角形を共にするもの。上と下の折れ線（目頭→目尻）"""
    hid = ~ext; cand = set()
    for t, k in zip(T, kinds):
        if k not in ('face', 'socket'): continue
        h = hid[t]
        if h.any() and (~h).any():
            for v in t[~h]: cand.add(int(v))
    cand = np.array(sorted(cand)); res = []
    for e in eyes:
        e = np.array(e); Q = P[cand]
        Q = Q[(np.sign(Q[:, 0]) == np.sign(e[0])) & (np.linalg.norm(Q[:, :2] - e[:2], axis=1) < 0.02) & (Q[:, 2] > e[2] - 0.001)]
        a = np.arctan2(Q[:, 1] - e[1], (Q[:, 0] - e[0]) * np.sign(e[0]))
        up = Q[(a >= -0.15)]; ua = a[(a >= -0.15)]; up = up[np.argsort(-ua)]
        lo = Q[(a <= 0.15) | (a >= np.pi - 0.05)]; la = a[(a <= 0.15) | (a >= np.pi - 0.05)]
        la = np.where(la > 3, la - 2 * np.pi, la); lo = lo[np.argsort(la)]
        res.append(dict(upper=up, lower=lo, center=e))
    return res

# ---------------------------------------------------------------- 塗り
def srgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0
def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]; return a * (1 - t) + b * t

def noise2(S, seed, scale):
    rng = np.random.default_rng(seed); out = np.zeros((S, S)); amp = 1.0; tot = 0
    for k in range(4):
        n = max(2, int(S / scale * (2 ** k))); g = rng.random((n + 1, n + 1))
        yy = np.linspace(0, n - 1e-6, S); y0 = yy.astype(int); f = yy - y0; f = f * f * (3 - 2 * f)
        fy = f[:, None]; fx = f[None, :]
        a = g[y0][:, y0]; b = g[y0][:, y0 + 1]; c = g[y0 + 1][:, y0]; d = g[y0 + 1][:, y0 + 1]
        out += amp * (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy); tot += amp; amp *= 0.5
    return out / tot

def dist_polyline(X, pts):
    best = np.full(X.shape[:-1], 1e9); along = np.zeros(X.shape[:-1])
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]); tot = L[-1] if L[-1] > 0 else 1
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a; l2 = ab @ ab
        if l2 < 1e-14: continue
        t = np.clip(((X - a) @ ab) / l2, 0, 1); d = np.linalg.norm(X - (a + t[..., None] * ab), axis=-1)
        m = d < best; best[m] = d[m]; along[m] = (L[i] + t[m] * np.sqrt(l2)) / tot
    return best, along

def paint_face(pos, ao, kid, L, look, S):
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]; ax = np.abs(x)
    col = np.broadcast_to(srgb(look['skin']), (S, S, 3)).copy()
    n1 = noise2(S, 11, 18); n2 = noise2(S, 12, 4)
    col *= (0.985 + 0.03 * (n1 - 0.5) + 0.012 * (n2 - 0.5))[..., None]
    ey, ex, ez = L['eyes'][0][1], abs(L['eyes'][0][0]), L['eyes'][0][2]
    red = (0.22 * gauss(x, 0.008) * gauss(y - L['noseY'], 0.008) * smooth(0.075, 0.1, z)
           + 0.25 * smooth(0.058, 0.07, ax) * smooth(-0.01, 0.01, -z) * gauss(y - (ey - 0.01), 0.03)
           + 0.12 * gauss(x, 0.012) * gauss(y - L['chinY'], 0.01) * smooth(0.06, 0.085, z)
           + 0.10 * gauss(ax - ex, 0.012) * gauss(y - (ey + 0.012), 0.006) * smooth(0.05, 0.075, z))
    col = mix(col, srgb(look.get('pink', '#e9a49c')), red)
    cheek = gauss(ax - (ex + look.get('blushX', 0.013)), look.get('blushR', 0.016)) * gauss(y - (ey - look.get('blushY', 0.022)), 0.012) * smooth(0.035, 0.07, z)
    col = mix(col, srgb(look.get('blushCol', '#ee9a9a')), look.get('blush', 0.3) * cheek)
    age = look.get('age', 0.0)
    if age:   # 老い：ほうれい線・目尻のしわ・額のしわ・目の下の影（上品に、ごく薄く）
        my = L['mouthY']
        yt, yb = L['noseY'] - 0.004, my - 0.007   # ほうれい線：小鼻のわきから口角の外へ、下へ行くほど外へ
        xf = 0.0175 + 0.0065 * np.clip((yt - y) / (yt - yb), 0, 1)
        fold = np.exp(-((ax - xf) / 0.0016) ** 2) * smooth(yb - 0.002, yb + 0.004, y) * (1 - smooth(yt - 0.003, yt + 0.002, y)) * smooth(0.06, 0.08, z)
        col = mix(col, srgb('#c09488'), 0.3 * age * fold)
        crow = np.zeros_like(x)
        for k in range(3):
            ang = -0.35 + 0.35 * k
            d = (y - ey - (ax - ex - 0.016) * math.tan(ang))
            crow += np.exp(-(d / 0.0004) ** 2) * gauss(ax - (ex + 0.019), 0.004)
        col = mix(col, srgb('#c09484'), 0.35 * age * np.clip(crow, 0, 1) * smooth(0.03, 0.06, z))
        fh = sum(np.exp(-((y - (0.062 + 0.008 * k) - 0.002 * np.cos(x * 60)) / 0.0005) ** 2) for k in range(3)) * gauss(x, 0.03) * smooth(0.05, 0.07, z)
        col = mix(col, srgb('#c6a091'), 0.22 * age * fh)
        ue = gauss(ax - ex, 0.009) * gauss(y - (ey - 0.0105), 0.0025) * smooth(0.05, 0.07, z)
        col = mix(col, srgb('#b98f88'), 0.35 * age * ue)
    # 唇
    my = L['mouthY']; lw = look.get('lipW', 0.0165); t = np.clip(ax / lw, 0, 1.5)
    sm = look.get('smileP', 0.0)
    up_top = my + 0.0072 - look.get('bow', 0.0016) * gauss(x, 0.0022) + 0.0010 * gauss(ax - 0.0055, 0.0035) - 0.0060 * t ** 2.2 + sm * t ** 3
    lo_bot = my - look.get('lowerH', 0.0088) + (look.get('lowerH', 0.0088) - 0.0016) * t ** 2.0 + sm * t ** 3
    inside = smooth(-0.0016, 0.0010, up_top - y) * smooth(-0.0016, 0.0010, y - lo_bot) * (1 - smooth(0.92, 1.04, t)) * smooth(0.07, 0.085, z)
    lipc = srgb(look.get('lip', '#c45563')); core = gauss(x, lw * 0.6) * gauss(y - my, 0.006)
    col = mix(col, lipc, inside * (look.get('lipA', 0.72) * (0.65 + 0.35 * core)))
    col = mix(col, lipc * 0.55, inside * 0.35 * gauss(y - my - sm * t ** 3, 0.0008))
    if look.get('lipHi'):   # 下唇の中ほどのほのかな明るさ（艶ではなく、ふっくら見せる）
        col = mix(col, np.array([1.0, 0.86, 0.86]), look['lipHi'] * inside * gauss(x, 0.005) * gauss(y - (my - 0.0045), 0.0018))
    # 眉：ふんわりした自然な眉
    if look.get('browA', 0.7) > 0:
        bx = (ax - ex) / 0.019; by0 = ey + look.get('browY', 0.0185)
        arch = by0 + look.get('browArch', 0.0018) * np.exp(-((bx - 0.3) / 0.75) ** 2) - look.get('browTail', 0.0010) * smooth(0.55, 1.35, bx) - look.get('browHead', 0.0006) * smooth(-0.2, -1.0, bx)
        thick = look.get('browW', 0.0029) * (1 - 0.5 * smooth(0.25, 1.3, bx))
        body = np.exp(-np.abs((y - arch) / np.maximum(thick, 1e-5)) ** 3) * smooth(-1.3, -0.8, bx) * (1 - smooth(1.05, 1.35, bx)) * smooth(0.05, 0.075, z)
        ang = np.where(bx < -0.4, 1.2, 0.35)
        strands = 0.82 + 0.18 * np.sin((x * np.cos(ang) * np.sign(x) + y * np.sin(ang)) * 9000 + 9 * n2) * (n2 > 0.3)
        dens = look.get('browA', 0.7) * (0.35 + 0.65 * smooth(-1.15, -0.35, bx)) * strands
        col = mix(col, srgb(look.get('browCol', '#3b2a24')), body * dens)
    # 目のふち
    for M in L['margins']:
        du, au = dist_polyline(pos, M['upper']); dl, al = dist_polyline(pos, M['lower']); cy = M['center'][1]
        lin = look.get('liner', 1.0)
        if lin:
            th = look.get('linerW', 1.0)
            wline = lin * th * (0.0006 + 0.0010 * smooth(0.25, 0.97, au))
            liner = np.exp(-(du / wline) ** 2) * smooth(0.0, 0.1, au) * ((y - cy) > -0.004)
            col = mix(col, srgb('#1a1214'), min(1.0, 0.95 * lin) * liner)
            wing = look.get('wing', 0.0)
            if wing:   # 目尻の先へ少し跳ね上げる
                up = M['upper']; o = up[-1]; d = o - up[-3]; d[2] = 0; d /= (np.linalg.norm(d) + 1e-9)
                tip = o + np.array([d[0] * wing, wing * 0.55, -0.0008])
                dw, aw = dist_polyline(pos, np.array([o, tip]))
                col = mix(col, srgb('#1a1214'), 0.9 * np.exp(-(dw / (0.0009 * th * (1 - 0.75 * aw) + 1e-5)) ** 2) * (aw > 0.0) * (aw < 0.999))
        crease = look.get('crease', 0.0026)
        dc = np.abs(du - crease * (0.7 + 0.5 * smooth(0.1, 0.9, au)))
        cr = np.exp(-(dc / 0.0006) ** 2) * smooth(0.12, 0.35, au) * (1 - smooth(0.92, 1.0, au)) * (y > cy) * (du < 0.006)
        col = mix(col, srgb('#9b6a62'), look.get('creaseA', 0.6) * cr)
        lid = smooth(0.0045, 0.0012, du) * (y > cy) * smooth(0.0, 0.2, au)
        col = mix(col, srgb(look.get('shadow', '#d9a39a')), look.get('shadowA', 0.28) * lid)
        low = np.exp(-(dl / 0.00045) ** 2) * smooth(0.35, 0.95, al) * (y < cy + 0.002)
        col = mix(col, srgb('#5a3a36'), 0.35 * low * max(lin, 0.4))
        tb = np.exp(-((dl - 0.0016) / 0.0012) ** 2) * (y < cy) * smooth(0.1, 0.5, al)
        col = mix(col, np.array([1.0, 0.93, 0.9]), look.get('tear', 0.12) * tb)
    # 生え際：頭皮側を髪色に（ゲームの髪の殻は縁が半透明なので、透けても肌の帯に見えないように）。式は stage3d-hd.js の hairShellGeo と同じ
    if look.get('hair'):
        bob = look['hair'] == 'bob'; front = smooth(-0.01, 0.05, z)
        hy = 0.074 - 8.5 * ax * ax + np.maximum(0, z - 0.06) * 0.4
        side = -0.02 if bob else 0.028
        lim = (smooth(-0.06, -0.02, z) * (side + 0.08) - 0.08) * (1 - front) + np.maximum(hy, side) * front
        edge = y - lim + 0.0012 * (n2 - 0.5)
        hm = smooth(-0.0035, 0.0015, edge) * (kid == 1)
        hc = srgb('#17131a') * (0.9 + 0.2 * n1[..., None])
        col = mix(col, hc, 0.96 * hm)
    # 眼窩の内側：ふちの近くは赤みのある粘膜、奥は暗く
    allm = np.concatenate([np.concatenate([M['upper'], M['lower']]) for M in L['margins']])
    dm, _ = dist_polyline(pos, allm)
    sock = kid == 3
    sc = mix(np.broadcast_to(srgb(look.get('waterline', '#d49a92')), (S, S, 3)), np.broadcast_to(srgb('#3c2426'), (S, S, 3)), smooth(0.0004, 0.0028, dm))
    col[sock] = sc[sock]
    am = look.get('aoMin', 0.62); col *= (am + (1 - am) * np.clip(ao, 0, 1) ** 1.4)[..., None]
    img = np.clip(col, 0, 1)
    # 口の中の帯と首の後ろの肌の点
    u, v0, v1 = MOUTH_STRIP; cx = int(u * S); r = max(3, S // 100)
    for row in range(int(v0 * S) - r, int(v1 * S) + r):
        tt = np.clip((row / S - v0) / (v1 - v0), 0, 1)
        img[row, cx - r:cx + r] = srgb('#2a1214') * (1 - tt ** 2) + lipc * 0.8 * tt ** 2
    cx, cy2 = int(SKIN_PATCH[0] * S), int(SKIN_PATCH[1] * S)
    img[max(0, cy2 - r):cy2 + r, max(0, cx - r):cx + r] = srgb(look['skin']) * 0.92
    return img

def iris_img(S=256, col='#4b2e1c', seed=5):
    yy, xx = np.mgrid[0:S, 0:S]
    dx = (xx + 0.5 - S / 2) / (S / 2); dy = (yy + 0.5 - S / 2) / (S / 2)
    r = np.sqrt(dx * dx + dy * dy); a = np.arctan2(dy, dx); rng = np.random.default_rng(seed); st = np.zeros_like(r)
    for k in range(5):
        f = rng.integers(40, 120); ph = rng.random() * 6.28
        st += np.sin(a * f + ph + 2.5 * np.sin(a * 7 + r * 9)) / 5
    base = srgb(col); light = base * 1.9 + 0.05; t = smooth(0.38, 0.95, r)
    c = base[None, None, :] * (0.8 + 0.25 * st[..., None]) * (1 - 0.35 * t[..., None])
    c = c + (light - base)[None, None, :] * (0.35 * np.exp(-((r - 0.55) / 0.14) ** 2) * (0.6 + 0.4 * st))[..., None]
    c = c * (1 - 0.86 * smooth(0.74, 0.92, r)[..., None])
    pupil = 1 - smooth(0.30, 0.34, r)
    c = c * (1 - pupil[..., None]) + np.array([0.012, 0.01, 0.01]) * pupil[..., None]
    # キャッチライト（画像の上が v=1。右上に柔らかい楕円、左下に小さな点）
    h1 = np.exp(-(((dx - 0.30) / 0.10) ** 2 + ((dy - 0.30) / 0.085) ** 2) ** 1.5)
    h2 = np.exp(-(((dx + 0.30) / 0.05) ** 2 + ((dy + 0.34) / 0.045) ** 2) ** 1.5)
    c = c + (0.97 - c) * (0.95 * h1 + 0.5 * h2)[..., None]
    alpha = 1 - smooth(0.97, 1.0, r)
    return np.concatenate([np.clip(c, 0, 1), alpha[..., None]], -1)

def lash_img(W=256, H=64, seed=7):
    """まつ毛の帯のアルファ（v=0 生え際 → v=1 毛先）"""
    rng = np.random.default_rng(seed); a = np.zeros((H, W)); yy = (np.arange(H) + 0.5) / H
    a += np.exp(-((yy - 0.04) / 0.08) ** 2)[:, None]
    n = 120
    for i in range(n):
        x0 = (i + rng.random() * 0.8) / n * W; L = (0.55 + 0.45 * rng.random()) * H; curve = (rng.random() - 0.3) * 6
        for j in range(int(L)):
            t = j / max(1, L); xx = x0 + curve * t * t + 2.5 * t; w = 1.9 * (1 - t) + 0.45; xi = int(xx)
            for k in range(-2, 3):
                xk = xi + k
                if 0 <= xk < W: a[j, xk] = max(a[j, xk], np.clip(w - abs(xx - xk - 0.5), 0, 1) * (1 - 0.6 * t))
    return np.clip(a, 0, 1)

# ---------------------------------------------------------------- 役
SKIN = '#f3d5c2'
ROLES = {
    # 若い女性：桐壺の更衣・藤壺・弘徽殿の女御・女房たち
    'lady': dict(cfg=dict(face_y=0.84, eye_x=1.40, eye_y=1.36, eye_r=1.24, eye_tilt=0.0022, lid_drop=0.0016, inner=0.001, nose=0.74, nose_w=0.84, nose_lift=-0.0006,
                          cheek=0.0046, cheek_low=0.0018, jaw=0.17, chin=0.0022, chin_round=1.15, lips_w=0.80, lips_full=-0.0005, lower_full=0.0007, smile=0.0040, smile_back=0.0009, cheek_raise=0.0030, lower_lid=0.0030, mouth_back=0.0026,
                          forehead=0.0032, neck=0.12),
                 look=dict(skin='#f8dccb', pink='#f0a89c', blush=0.42, blushCol='#f2a097', lip='#d0566a', lipA=0.76, lipW=0.0150, bow=0.0021, lowerH=0.0080, smileP=0.0019, lipHi=0.16, hair='long',
                           linerW=1.85, wing=0.0028, crease=0.0028, creaseA=0.55, shadow='#e3a3a0', shadowA=0.3, browY=0.0205, browW=0.0026, browA=0.62, browCol='#3a2823',
                           browArch=0.0016, browHead=0.0010, browTail=0.0008, aoMin=0.8, tear=0.26, waterline='#e2b4ac'), iris=0.58, age=0.0, skinHex='f8dccb'),
    # 大人の女性：母北の方・少納言の乳母（同じ系統で年相応に。可愛さの変形を弱め、化粧も控えめ）
    'woman': dict(cfg=dict(face_y=0.91, eye_x=1.20, eye_y=1.15, eye_r=1.10, lid_drop=0.0020, nose_w=0.9, smile=0.0013, smile_back=0.0004, cheek_raise=0.0008, lower_lid=0.0006, mouth_back=0.001, cheek=0.0024, jaw=0.09, chin=0.0018,
                           nose=0.88, lips_w=0.9, lips_full=0.0006, age=0.35),
                  look=dict(skin='#f5d8ca', blush=0.22, lip='#c05a66', lipA=0.62, smileP=0.0006, liner=0.85, linerW=1.25, shadowA=0.22, browA=0.62, age=0.2, aoMin=0.7, hair='long', waterline='#dcaaa2'), age=0.3, skinHex='f5d8ca'),
    # 尼君：「四十余ばかり…いと白うあてに痩せたれど、つらつきふくらかに」。上品な老い
    'ama': dict(cfg=dict(smile=0.0007, lower_lid=0.0004, face_y=0.93, eye_x=1.10, eye_y=1.06, eye_r=1.05, lid_drop=0.0025, cheek=0.0022, jaw=0.08, chin=0.0012,
                         nose=0.9, lips_w=0.9, lips_full=0.0002, age=0.9),
                look=dict(skin='#f4e0d4', blush=0.08, lip='#b06a6c', lipA=0.45, liner=0.45, creaseA=0.5, shadowA=0.12, browA=0.5, browCol='#4a3a34', age=0.85, tear=0.0, aoMin=0.68, hair='bob'), age=0.9, skinHex='f4e0d4'),
    # 少女・子ども：若紫（十歳ほど）・犬君・童べ・幼子。幼く清らかに（化粧はしない）
    'girl': dict(cfg=dict(face_y=0.78, eye_x=1.46, eye_y=1.44, eye_r=1.30, eye_tilt=0.0008, lid_drop=0.0011, inner=0.0006, nose=0.62, nose_w=0.80, nose_lift=-0.0004,
                          cheek=0.0055, cheek_low=0.0030, jaw=0.15, chin=0.0040, chin_round=1.4, lips_w=0.72, lips_full=-0.0006, lower_full=0.0003, smile=0.0044, smile_back=0.0009, cheek_raise=0.0034, lower_lid=0.0032, mouth_back=0.0024,
                          neck=0.22, forehead=0.0060),
                 look=dict(skin='#f9dfcf', pink='#f2aa9e', blush=0.46, blushCol='#f4a49a', blushR=0.020, blushY=0.024, lip='#e0868a', lipA=0.42, lipW=0.0128, bow=0.0012,
                           lowerH=0.0072, smileP=0.0024, hair='bob', liner=0.5, linerW=1.1, creaseA=0.3, shadowA=0.0, browA=0.36, browW=0.0024, browCol='#5a3e30', browY=0.0215,
                           browArch=0.0014, browHead=0.0012, browTail=0.0004, aoMin=0.82, tear=0.2, waterline='#e6bcb4'), iris=0.60, age=0.0, skinHex='f9dfcf'),
}

# ---------------------------------------------------------------- 符号化（鴻門の会 pack-head-assets.py と同じ delta-rle-v1）
def pack16(values, comps):
    out = bytearray(); prev = [0] * comps; zeros = 0
    def varint(n):
        while n >= 128: out.append((n & 127) | 128); n >>= 7
        out.append(n)
    for i, n in enumerate(values):
        n = int(n) & 0xFFFF; d = ((n - prev[i % comps] + 32768) & 0xFFFF) - 32768; prev[i % comps] = n
        if d == 0: zeros += 1; continue
        if zeros: varint(0); varint(zeros); zeros = 0
        varint(d * 2 if d > 0 else -d * 2 - 1)
    if zeros: varint(0); varint(zeros)
    return base64.b64encode(bytes(out)).decode()

def pack_idx(idx):
    out = bytearray(); prev = 0
    for v in idx:
        d = int(v) - prev; prev = int(v); z = d * 2 if d >= 0 else -d * 2 - 1
        while z >= 128: out.append((z & 127) | 128); z >>= 7
        out.append(z)
    return base64.b64encode(bytes(out)).decode()

def jpeg_uri(img, q, tmp):
    h, w = img.shape[:2]
    im = bpy.data.images.new('tmpjpg', w, h, alpha=False)
    a = np.concatenate([img, np.ones((h, w, 1))], 2).astype(np.float32)
    im.pixels.foreach_set(a.ravel()); im.file_format = 'JPEG'; im.save(filepath=tmp, quality=q)
    data = open(tmp, 'rb').read(); bpy.data.images.remove(im)
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode()

def png_uri(img, tmp):
    h, w = img.shape[:2]
    im = bpy.data.images.new('tmppng', w, h, alpha=True)
    a = img if img.shape[2] == 4 else np.concatenate([img, np.ones((h, w, 1))], 2)
    im.pixels.foreach_set(a.astype(np.float32).ravel()); im.file_format = 'PNG'; im.save(filepath=tmp)
    data = open(tmp, 'rb').read(); bpy.data.images.remove(im)
    return 'data:image/png;base64,' + base64.b64encode(data).decode()

def downscale(img, f):
    h, w, c = img.shape; return img.reshape(h // f, f, w // f, f, c).mean((1, 3))

# ---------------------------------------------------------------- 1 体を作る
def build_role(name, R0, src, E):
    spec = ROLES[name]; t0 = time.time()
    hi, lo = src[1], src[0]
    P1, info = cute(hi['P'], hi['T'], E, spec['cfg'], hi['U'])
    P0, info0 = cute(lo['P'], lo['T'], E, spec['cfg'], lo['U'])
    eyes = info['eyes']
    # 眼球の半径：まぶた（見える面）に触れない大きさ
    Rn = R0 * info['eye_r']
    ext, AO, N = classify(P1, hi['T'], eyes, Rn)
    TU1, kinds1 = atlas(P1, hi['T'], hi['U'])
    mg = margins(P1, hi['T'], ext, kinds1, eyes)
    S = 1024
    pos, ao, mask, kid = raster(P1, N, AO, hi['T'], TU1, kinds1, S)
    look = dict(spec['look'])
    L = dict(eyes=eyes, mouthY=info['mouthY'], noseY=info['noseY'], chinY=info['chinY'], margins=mg)
    img = paint_face(pos, ao, kid, L, look, S)
    # まぶた（瞬きで下りる半球）の色：上まぶたの塗りの平均
    lidm = (kid == 1) & (np.abs(pos[..., 0] - eyes[1][0]) < 0.006) & (pos[..., 1] > eyes[1][1] + 0.0065) & (pos[..., 1] < eyes[1][1] + 0.0095)
    lidc = img[lidm].mean(0) if lidm.any() else srgb(look['skin'])
    # 開いたときのまぶたの角度：半球のふちが上まぶたのふちの高さにくる角度（ふちより少し上で、内に隠れる）
    up = mg[0]['upper']; top = float(up[:, 1].max() - eyes[0][1])
    open_a = -math.asin(min(0.95, (top + 0.0012) / (Rn * 1.03)))
    print('  %s: 目の半径 %.4f 上ふち %+.4f 開き角 %.3f  (%.1fs)' % (name, Rn, top, open_a, time.time() - t0))
    out = dict(P1=P1, P0=P0, N1=info['neutral'], N0=info0['neutral'], TU1=TU1, kinds1=kinds1, img=img, eyes=eyes, R=Rn, open=open_a, lid=lidc, margins=mg, info=info, look=look)
    TU0, kinds0 = atlas(P0, lo['T'], lo['U']); out['TU0'] = TU0
    return out

def lash_points(M, e, n=14):
    up = M['upper']
    if len(up) < 3: return []
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(up, axis=0), axis=1))])
    ts = np.linspace(0, L[-1], n)
    return [[round(float(np.interp(t, L, up[:, k])), 5) for k in range(3)] for t in ts]

# ---------------------------------------------------------------- 書き出し
def export(results, src, path):
    js = open(path, encoding='utf-8').read()
    pre, payload = js.split('window.GJ3_HD_ASSETS=', 1)
    A = json.loads(payload.strip().rstrip(';'))
    tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tmp-heian')
    os.makedirs(tmp, exist_ok=True)
    A.setdefault('uvs', {}); A.setdefault('tex', {})
    # 共有：三角形の並び・UV（全員が同じ網目）
    shared = {}
    for q, lvl, TUk in (('high', 1, 'TU1'), ('low', 0, 'TU0')):
        first = next(iter(results.values()))
        s_, uv, tri = split_uv(src[lvl]['T'], first[TUk])
        A['indices']['hf_' + q] = pack_idx(tri.ravel())
        A['uvs']['hf_' + q] = pack16(uv.ravel(), 2)
        shared[q] = dict(src=s_, n=len(s_), t=len(tri))
    A['tex']['iris'] = png_uri(iris_img(), os.path.join(tmp, 'i.png'))   # Blender の画素は下の行から（= v=0）
    lash = lash_img(); A['tex']['lash'] = png_uri(np.concatenate([np.broadcast_to(np.array([0.06, 0.04, 0.035]), lash.shape + (3,)), lash[..., None]], 2), os.path.join(tmp, 'l.png'))
    for name, r in results.items():
        spec = ROLES[name]; head = dict(from_='heian', skin=spec['skinHex'], age=spec['age'], gender='female', lod={}, tex={})
        eyes = []
        for e, M in zip(r['eyes'], r['margins']):
            eyes.append(dict(center=[round(float(v), 5) for v in e], radius=round(float(r['R']), 5), scale=[1, 1, 1], open=round(r['open'], 4),
                             lash=lash_points(M, e)))
        lid = '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in np.clip(r['lid'], 0, 1))
        head['anchors'] = dict(eyes=eyes, hat=dict(offset=[0, 0, 0], scale=[1, 1, 1]), crown=[0, 0.12, -0.03],
                               chin=[0, round(r['info']['chinY'], 4), 0.04], neck=[0, -0.205, -0.02], mouth=[0, round(r['info']['mouthY'], 4), 0.09],
                               lid=lid, iris=spec.get('iris', 0.5), child=1 if name == 'girl' else 0)
        for q, Pk in (('high', 'P1'), ('low', 'P0')):
            P = r[Pk][shared[q]['src']]
            qv = np.clip(np.round(P / QUANT), -32768, 32767).astype(np.int64)
            # 表情なしへの差（ゲームで泣く・伏す姿勢のときに混ぜる。モーフ）
            Nk = 'N1' if q == 'high' else 'N0'
            dq = np.clip(np.round((r[Nk][shared[q]['src']] - P) / QUANT), -32768, 32767).astype(np.int64)
            head['lod'][q] = dict(skin=dict(v=shared[q]['n'], t=shared[q]['t'], p=pack16(qv.ravel(), 3), dn=pack16(dq.ravel(), 3), i='hf_' + q, uv='hf_' + q, encoding=dict(p='delta-rle-v1', dn='delta-rle-v1')))
        img = r['img']   # 行 0 = v=0（Blender の画素の並びのまま保存すると、画像の下になる）
        head['tex']['high'] = jpeg_uri(img, 84, os.path.join(tmp, 'h.jpg'))
        head['tex']['low'] = jpeg_uri(downscale(img, 2), 82, os.path.join(tmp, 'lo.jpg'))
        head['from'] = head.pop('from_')
        A['heads'][name] = head
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    A['heian'] = dict(source='Blender Studio Human Base Meshes v1.2.0 (CC0-1.0) GEO-body_female_realistic; tools/build-heian-heads.py', sha256=SHA)
    body = pre + 'window.GJ3_HD_ASSETS=' + json.dumps(A, separators=(',', ':')) + ';\n'
    open(path, 'w', encoding='utf-8', newline='\n').write(body)
    print('✔ %s  %.2f MB' % (os.path.relpath(path, ROOT), len(body.encode()) / 1048576))

# ---------------------------------------------------------------- 確認用の描画
def render(results, outdir, views):
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 480, 600; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.17, 0.19, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    cam = bpy.data.cameras.new('C'); cam.lens = 85; co = bpy.data.objects.new('C', cam); sc.collection.objects.link(co); sc.camera = co
    def aim(o, p, t): o.location = Vector(p); o.rotation_euler = (Vector(t) - Vector(p)).to_track_quat('-Z', 'Y').to_euler()
    def light(n, p, e, s, t):
        L = bpy.data.lights.new(n, 'AREA'); L.energy = e; L.size = s; o = bpy.data.objects.new(n, L); sc.collection.objects.link(o); aim(o, p, t)
    tg = Vector((0, 0, -0.008))
    light('key', tg + Vector((0.45, -0.9, 0.45)), 13, 1.0, tg); light('fill', tg + Vector((-0.8, -0.7, 0.15)), 6, 1.4, tg); light('rim', tg + Vector((0.25, 0.9, 0.6)), 9, 0.8, tg)
    def img_from(name, arr):
        h, w2 = arr.shape[:2]; im = bpy.data.images.new(name, w2, h, alpha=True)
        a = arr if arr.shape[2] == 4 else np.concatenate([arr, np.ones((h, w2, 1))], 2)
        im.pixels.foreach_set(a.astype(np.float32).ravel()); im.pack(); return im
    def mat(name, img=None, col=None, rough=0.5, alpha=False, sss=0.0):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
        b.inputs['Roughness'].default_value = rough
        if col: b.inputs['Base Color'].default_value = col
        if img:
            ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = img; nt.links.new(ti.outputs['Color'], b.inputs['Base Color'])
            if alpha: nt.links.new(ti.outputs['Alpha'], b.inputs['Alpha'])
        if sss:
            b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Radius'].default_value = (0.003, 0.0012, 0.0008)
        return m
    iris_m = mat('iris', img_from('iris', iris_img()), rough=0.35, alpha=True)
    la = lash_img(); lash_m = mat('lash', img_from('lash', np.concatenate([np.broadcast_to(np.array([0.05, 0.035, 0.03]), la.shape + (3,)), la[..., None]], 2)), alpha=True)
    white = mat('white', col=(0.86, 0.83, 0.80, 1), rough=0.2)
    for name, r in results.items():
        objs = []
        s_, uv, tri = split_uv(SRC[1]['T'], r['TU1'])
        me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in r['P1'][s_].tolist()], [], [tuple(t) for t in tri.tolist()]); me.update()
        ul = me.uv_layers.new(name='UV'); ul.data.foreach_set('uv', (uv[np.array([l.vertex_index for l in me.loops])] / 65535.0).ravel())
        for pl in me.polygons: pl.use_smooth = True
        Nn = normals(r['P1'], SRC[1]['T'])
        try: me.normals_split_custom_set_from_vertices([tuple(n) for n in Nn[s_].tolist()])
        except Exception: pass
        me.materials.append(mat('skin_' + name, img_from('face_' + name, r['img']), sss=0.12))
        o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); o.rotation_euler = (math.pi / 2, 0, 0); objs.append(o)
        R = r['R']
        for e, M in zip(r['eyes'], r['margins']):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=R, location=(e[0], -e[2], e[1]), segments=48, ring_count=24)
            s = bpy.context.object; s.data.materials.append(white); objs.append(s)
            for pl in s.data.polygons: pl.use_smooth = True
            n, rings, ir = 40, 10, R * ROLES[name].get('iris', 0.5); vs = [(0, 0, R + 0.0002)]; uvs = [(0.5, 0.5)]; fs = []
            for j in range(1, rings + 1):
                rr = ir * j / rings
                for i in range(n):
                    a = 2 * math.pi * i / n; xx = rr * math.cos(a); yy = rr * math.sin(a)
                    vs.append((xx, yy, math.sqrt(max(0, R * R - xx * xx - yy * yy)) + 0.0002 + 0.0006 * (1 - (rr / ir) ** 2))); uvs.append((0.5 + 0.5 * xx / ir, 0.5 + 0.5 * yy / ir))
            for i in range(n): fs.append((0, 1 + i, 1 + (i + 1) % n))
            for j in range(rings - 1):
                for i in range(n):
                    a = 1 + j * n + i; b = 1 + j * n + (i + 1) % n; fs.append((a, a + n, b + n, b))
            mi = bpy.data.meshes.new('iris'); mi.from_pydata([(v[0] + e[0], v[1] + e[1], v[2] + e[2]) for v in vs], [], fs); mi.update()
            ul = mi.uv_layers.new(name='UV'); ul.data.foreach_set('uv', np.array([uvs[l.vertex_index] for l in mi.loops]).ravel())
            for pl in mi.polygons: pl.use_smooth = True
            mi.materials.append(iris_m); oi = bpy.data.objects.new('iris', mi); sc.collection.objects.link(oi); oi.rotation_euler = (math.pi / 2, 0, 0); objs.append(oi)
            pts = np.array(lash_points(M, e, 20)); c = np.array(e)
            if len(pts) >= 4:
                lv, lf, luv = [], [], []
                for i, p in enumerate(pts):
                    t = i / (len(pts) - 1); outv = p - c; outv[2] = 0; outv /= (np.linalg.norm(outv) + 1e-9)
                    ln = (0.0012 + 0.0026 * t ** 1.2) * ROLES[name]['look'].get('lash', 1.0)
                    dv = outv * 0.55 + np.array([0, 0.5, 0.55]); dv /= np.linalg.norm(dv)
                    base = p + np.array([0, 0, 0.0002]); tip = base + dv * ln + np.array([0, ln * 0.35, 0])
                    lv += [tuple(base), tuple(tip)]; luv += [(t * 3, 0.0), (t * 3, 1.0)]
                for i in range(len(pts) - 1): lf.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
                ml = bpy.data.meshes.new('lash'); ml.from_pydata(lv, [], lf); ml.update()
                ul = ml.uv_layers.new(name='UV'); ul.data.foreach_set('uv', np.array([luv[l.vertex_index] for l in ml.loops]).ravel())
                ml.materials.append(lash_m); ol = bpy.data.objects.new('lash', ml); sc.collection.objects.link(ol); ol.rotation_euler = (math.pi / 2, 0, 0); objs.append(ol)
        VIEW = {'f': (0, 0.5, 0.0), 'q': (32, 0.5, 0.0), 's': (84, 0.5, 0.0), 'c': (12, 0.3, 0.012)}
        for vn in views:
            ang, rr, dz = VIEW[vn]; a = math.radians(ang); tt = tg + Vector((0, -0.03 if vn == 's' else 0, dz))
            aim(co, (tt.x + rr * math.sin(a), tt.y - rr * math.cos(a), tt.z + 0.015), tt)
            sc.render.filepath = os.path.join(outdir, '%s_%s.png' % (name, vn)); bpy.ops.render.render(write_still=True)
        for o in objs: bpy.data.objects.remove(o)

# ---------------------------------------------------------------- 本体
if __name__ == '__main__':
    t0 = time.time()
    path = bundle_path(); print('素材', path)
    SRC, E = load_source(path)
    R0 = 0.0118
    roles = (arg('--roles') or 'lady,woman,ama,girl').split(',')
    results = {}
    for name in roles: results[name] = build_role(name, R0, SRC, E)
    if not arg('--no-write'):
        if set(roles) != set(ROLES): raise SystemExit('✖ 書き出しは 4 体そろえて（--roles を省く）。確かめるだけなら --no-write')
        export(results, SRC, os.path.join(ROOT, 'src/js/stage3d-hd-assets.js'))
    if arg('--render'):
        views = (arg('--views') or 'f,q,s,c').split(',')
        render(results, os.path.abspath(arg('--render')), views)
    print('おわり %.0fs' % (time.time() - t0))
