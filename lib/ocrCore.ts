// lib/ocrCore.ts
// プロセカ ランクマッチのリザルト画面を読み取る処理の本体（Tesseract.js ＋ canvas）。
// 友人作の prsk-result-ocr.html の読み取り部分を TypeScript にしたもの。
//
// ブラウザでも、サーバー（Node.js）でも動くように、canvas の作り方などの「環境ごとに違う部分」は
// OcrEnv として外から渡す（setOcrEnv）。
//   ・ブラウザ用 … lib/resultOcr.ts（画像はブラウザの中で処理され、外には送られない）
//   ・サーバー用 … lib/serverOcr.ts（iOSショートカットで送られた画像を、サーバーで読み取る）

// ============================================================
// 型
// ============================================================

type Player = 'me' | 'opponent';
type Item = 'perfect' | 'great' | 'good' | 'bad' | 'miss' | 'combo';
type Region = { x: number; y: number; w: number; h: number };

export type PlayerResult = Record<Item, number | null>;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

// ジャケットのモザイク（JACKET_GRID x JACKET_GRID マスの平均色を "rrggbb" でつないだ文字列）と、
// 切り出した画像の確認用プレビュー（96x96のJPEG。DBにも保存する）、ジャケットのまわり（枠）の色
export interface JacketHash {
  hex: string;
  preview: string; // data URL
  ring: RGB | null; // ジャケットのまわりの色（難易度の判別に使う）
}

// DBに保存されている、曲ごとのジャケット
export interface JacketRecord {
  id?: number; // DBでの番号（1つの曲に、ジャケットが複数あることがある）
  songName: string;
  hex: string;
}

export interface OcrResult {
  me: PlayerResult; // 自分
  opponent: PlayerResult; // 相手
  jacket: JacketHash | null; // 楽曲ジャケット（曲の特定に使う）
  trust: number; // 全項目の信頼度(%)のうち、いちばん低いもの
  weakest: string; // そのいちばん信頼度が低かった項目（例: 'opponent/good'）
}

// ============================================================
// 設定（読み取り位置などの調整はここ）
// ============================================================

// 読み取る範囲。中央16:9領域に対する割合(0〜1)で指定する。x,y = 左上 / w,h = 幅と高さ
// ※iPad(1280x889)とAndroid(1536x864)のスクショの実測値から計算した値。
//   great/good/bad は実測ではなく補間した値なので、読み間違いが多いときはここを調整する。
const REGIONS: Record<Player, Record<Item, Region>> = {
  me: {
    perfect: { x: 0.35, y: 0.227, w: 0.101, h: 0.082 },
    great: { x: 0.35, y: 0.331, w: 0.101, h: 0.082 },
    good: { x: 0.35, y: 0.435, w: 0.101, h: 0.082 },
    bad: { x: 0.35, y: 0.538, w: 0.101, h: 0.082 },
    miss: { x: 0.35, y: 0.642, w: 0.101, h: 0.082 },
    combo: { x: 0.192, y: 0.777, w: 0.101, h: 0.082 },
  },
  opponent: {
    perfect: { x: 0.551, y: 0.227, w: 0.101, h: 0.082 },
    great: { x: 0.551, y: 0.331, w: 0.101, h: 0.082 },
    good: { x: 0.551, y: 0.435, w: 0.101, h: 0.082 },
    bad: { x: 0.551, y: 0.538, w: 0.101, h: 0.082 },
    miss: { x: 0.551, y: 0.642, w: 0.101, h: 0.082 },
    combo: { x: 0.795, y: 0.777, w: 0.101, h: 0.082 },
  },
};

const ASPECT_W = 16; // 基準にする画面比率（横）
const ASPECT_H = 9; // 基準にする画面比率（縦）
const SCALE = 3; // 切り出した画像を何倍に拡大するか
const WHITE_THRESHOLD = 200; // 白と判定するRGB最小値のしきい値(0〜255)
const COMBO_THRESHOLD = 135; // 最大コンボだけ文字色が違うので、別のしきい値
const PAD = 20; // 切り出した画像のまわりにつける白い余白(px)
const DIGIT_HEIGHT = 60; // 文字部分の高さをこの大きさにそろえてから読む(px)
const MIN_INK = 3; // 黒い画素がこの数以上ある行・列だけを「文字がある」とみなす（ノイズ除け）
const JUDGE_THRESHOLDS = [WHITE_THRESHOLD, 230, 245, 170]; // 判定の数字: 自信がなければ順に試して一番自信があるものを採用
const COMBO_THRESHOLDS = [COMBO_THRESHOLD, 160, 110]; // 最大コンボ用のしきい値の候補
const RETRY_BELOW = 70; // 信頼度(%)がこれ未満なら、別のしきい値でも試す
const MIN_DIGIT_RATIO = 0.3; // 文字の高さが切り出し範囲の何割未満なら「文字ではなくノイズ」とみなすか

// 信頼度(%)がこれ未満なら「確認してね」と警告する
export const OCR_TRUST_LOW = 50;

// 楽曲ジャケットの範囲（中央16:9領域に対する割合）。ジャケットは正方形なので h = w * 16 / 9。
// ★ジャケットだけ y は「16:9領域の上端」ではなく「画面そのものの上端」からの割合
//   （ジャケットは画面の上に張り付いていて、縦長の端末でも上端から動かないため）
const JACKET_REGION: Region = { x: 0.448, y: 0.002, w: 0.1043, h: (0.1043 * 16) / 9 };
const JACKET_SHRINK = 0.05; // 端に別の色が映り込むので、中心は変えずに範囲を小さくする割合
const JACKET_GRID = 4; // モザイクの分割数（128の約数にすること）。4なら 4x4=16マス（hexは96文字）
const JACKET_SIZE = 128; // ジャケットを切り出すときの大きさ(px)
// ジャケットのまわりの「枠」の色を測る範囲。切り出した範囲（縮小する前）の、外側から何割の幅を使うか。
// 左・右・下の3辺の、この幅の帯の「中央値」を、枠の色とする（上は画面の端なので使わない）。
// ★ 枠の位置は、スクショで確かめた値ではありません。合わないときは、この値と JACKET_REGION を調整してください。
const JACKET_RING_THICKNESS = 0.04
const JACKET_PREVIEW_SIZE = 96; // 確認用・保存用のサムネイルの大きさ(px)

// この値以下なら「同じジャケット」とみなす（小さいほど厳しい）
export const JACKET_SAME_THRESHOLD = 0.2;
// いちばん近いジャケットとの差がこの範囲に入るものは、同じくらい近い候補として扱う
export const JACKET_MARGIN = 0.05;


// ============================================================
// 環境（ブラウザ / サーバー）ごとに違う部分
// ============================================================

// canvas のうち、この処理で使う部分だけの型（ブラウザの canvas も @napi-rs/canvas もこれに当てはまる）
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): any;
}

export interface ImageLike {
  width: number;
  height: number;
}

export interface OcrEnv {
  createCanvas(width: number, height: number): CanvasLike;
  // Tesseract に渡せる形にする（ブラウザ: canvas そのもの / サーバー: PNG の Buffer）
  toRecognizable(canvas: CanvasLike): any;
  // JPEG の data URL にする（quality は 0〜1）
  toJpegDataUrl(canvas: CanvasLike, quality: number): string;
}

let currentEnv: OcrEnv | null = null;

export function setOcrEnv(env: OcrEnv) {
  currentEnv = env;
}

function env(): OcrEnv {
  if (!currentEnv) throw new Error('OCRの実行環境が設定されていません（setOcrEnv を先に呼んでください）');
  return currentEnv;
}

// ============================================================
// 画像の前処理
// ============================================================

// 画像の中央から 16:9 の領域を求める（bx,by = 左上 / bw,bh = 大きさ）
function getBaseArea(img: ImageLike) {
  let bw = img.width;
  let bh = img.height;
  if (bw / bh > ASPECT_W / ASPECT_H) {
    bw = (bh * ASPECT_W) / ASPECT_H; // 横に長い → 左右を削る
  } else {
    bh = (bw * ASPECT_H) / ASPECT_W; // 縦に長い → 上下を削る
  }
  return { bx: (img.width - bw) / 2, by: (img.height - bh) / 2, bw, bh };
}

type BaseArea = ReturnType<typeof getBaseArea>;

// 白い部分だけ黒、それ以外を白にする（Tesseractは白地に黒文字が得意）
function whiteToBlack(canvas: CanvasLike, threshold: number) {
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    const v = m >= threshold ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
}

// 黒い部分(文字)がある範囲だけを切り出し、高さを DIGIT_HEIGHT にそろえ、白い余白をつけて返す
// 文字が見つからなかったら null を返す
function normalizeDigits(c: CanvasLike): CanvasLike | null {
  const w = c.width;
  const h = c.height;
  const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;

  // 行ごと・列ごとに、黒い画素が何個あるか数える
  const rowCount = new Array<number>(h).fill(0);
  const colCount = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4] === 0) {
        rowCount[y]++;
        colCount[x]++;
      }
    }
  }

  // 黒い画素が MIN_INK 個以上ある行・列の、いちばん端を探す
  let top = -1, bottom = -1, left = -1, right = -1;
  for (let y = 0; y < h; y++) {
    if (rowCount[y] >= MIN_INK) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  for (let x = 0; x < w; x++) {
    if (colCount[x] >= MIN_INK) {
      if (left < 0) left = x;
      right = x;
    }
  }
  if (top < 0 || left < 0) return null; // 文字が見つからない
  // 見つかった「文字」が小さすぎるときは、文字ではなくノイズなので使わない
  if (bottom - top + 1 < h * MIN_DIGIT_RATIO) return null;

  const bw = right - left + 1;
  const bh = bottom - top + 1;
  const ow = Math.max(1, Math.round((bw * DIGIT_HEIGHT) / bh));

  const out = env().createCanvas(1, 1);
  out.width = ow + PAD * 2;
  out.height = DIGIT_HEIGHT + PAD * 2;
  const octx = out.getContext('2d')!;
  octx.fillStyle = 'white';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(c, left, top, bw, bh, PAD, PAD, ow, DIGIT_HEIGHT);
  return out;
}

// 1か所を切り出して拡大した canvas を返す
function cropRegion(img: ImageLike, base: BaseArea, r: Region, threshold: number): CanvasLike {
  const c = env().createCanvas(1, 1);
  c.width = Math.round(r.w * base.bw * SCALE);
  c.height = Math.round(r.h * base.bh * SCALE);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(
    img,
    base.bx + r.x * base.bw, base.by + r.y * base.bh, r.w * base.bw, r.h * base.bh,
    0, 0, c.width, c.height
  );
  whiteToBlack(c, threshold);

  // 文字がある範囲だけに切り詰めて、大きさをそろえる
  const n = normalizeDigits(c);
  if (n) return n;

  // 文字が見つからないときは、まわりに白い余白をつけるだけ
  const p = env().createCanvas(1, 1);
  p.width = c.width + PAD * 2;
  p.height = c.height + PAD * 2;
  const pctx = p.getContext('2d')!;
  pctx.fillStyle = 'white';
  pctx.fillRect(0, 0, p.width, p.height);
  pctx.drawImage(c, PAD, PAD);
  return p;
}

// ============================================================
// 数字の読み取り
// ============================================================

// 数字に似た文字を数字に読み替える表（0 が "O" に見えるときなど）
const DIGIT_FIX: Record<string, string> = { O: '0', o: '0', Q: '0', D: '0', I: '1', l: '1', '|': '1' };

function toDigits(text: string): string {
  let s = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    s += DIGIT_FIX[ch] !== undefined ? DIGIT_FIX[ch] : ch;
  }
  return s.replace(/[^0-9]/g, '');
}

// 数字を1つ読む。何も読めなかったら「1文字モード」「2個並べ」でもう一度試す
async function readNumber(worker: any, canvas: CanvasLike) {
  let data = (await worker.recognize(env().toRecognizable(canvas))).data;
  let digits = toDigits(data.text.trim());

  // 2回目: 1文字モード（"0" だけの画像は、1行モードだと読めないことがあるため）
  if (digits === '') {
    await worker.setParameters({ tessedit_pageseg_mode: '10' });
    data = (await worker.recognize(env().toRecognizable(canvas))).data;
    digits = toDigits(data.text.trim());
    await worker.setParameters({ tessedit_pageseg_mode: '7' }); // 1行モードに戻す
  }

  // 3回目: 同じ画像を2つ並べて読む（"00" のように並べると読めることがある）
  if (digits === '') {
    const twin = env().createCanvas(1, 1);
    twin.width = canvas.width * 2;
    twin.height = canvas.height;
    const tctx = twin.getContext('2d')!;
    tctx.fillStyle = 'white';
    tctx.fillRect(0, 0, twin.width, twin.height);
    tctx.drawImage(canvas, 0, 0);
    tctx.drawImage(canvas, canvas.width, 0);
    data = (await worker.recognize(env().toRecognizable(twin))).data;
    const both = toDigits(data.text.trim());
    const half = both.length / 2;
    // 前半と後半が同じなら、その1つぶんが答え（"00" → 0）
    if (both.length > 0 && both.length % 2 === 0 && both.slice(0, half) === both.slice(half)) {
      digits = both.slice(0, half);
    }
  }

  // 読めなかったら値は null、信頼度は 0
  const value = digits === '' ? null : parseInt(digits, 10);
  return { value, confidence: value === null ? 0 : (data.confidence as number) };
}

// 信頼度が低ければ別のしきい値でも試して、いちばん信頼度が高い結果を採用する
async function readItem(
  worker: any,
  img: ImageLike,
  base: BaseArea,
  region: Region,
  thresholds: number[]
) {
  let best: { value: number | null; confidence: number } | null = null;
  for (let i = 0; i < thresholds.length; i++) {
    const c = cropRegion(img, base, region, thresholds[i]);
    const r = await readNumber(worker, c);
    if (best === null || r.confidence > best.confidence) best = r;
    if (best.confidence >= RETRY_BELOW) break; // 十分自信があればここで終わり
  }
  return best!;
}

// 画像全体を読み取る
async function readResult(img: ImageLike, worker: any) {
  const base = getBaseArea(img);
  const result = {} as Record<Player, PlayerResult>;
  const conf = {} as Record<Player, Record<Item, number>>;

  const players = Object.keys(REGIONS) as Player[];
  for (const player of players) {
    result[player] = {} as PlayerResult;
    conf[player] = {} as Record<Item, number>;

    const items = Object.keys(REGIONS[player]) as Item[];
    for (const item of items) {
      // コンボだけ文字色が違うので、しきい値の候補も別にする
      const thresholds = item === 'combo' ? COMBO_THRESHOLDS : JUDGE_THRESHOLDS;
      const r = await readItem(worker, img, base, REGIONS[player][item], thresholds);
      result[player][item] = r.value;
      conf[player][item] = r.confidence;
    }
  }
  return { result, conf };
}

// 合計チェック: 同じ譜面を遊んでいるので、自分と相手の判定の合計（＝ノーツ数）は同じになるはず
// ・片方がぜんぶ読めていて、もう片方の null が1個だけなら、差から推定して埋める
// ・合計が合わなければ true（読み間違いの可能性）を返す
function checkTotals(result: Record<Player, PlayerResult>, conf: Record<Player, Record<Item, number>>): boolean {
  const judges: Item[] = ['perfect', 'great', 'good', 'bad', 'miss'];
  const players: Player[] = ['me', 'opponent'];
  const info = {} as Record<Player, { sum: number; nulls: Item[] }>;

  for (const p of players) {
    let sum = 0;
    const nulls: Item[] = [];
    for (const j of judges) {
      const v = result[p][j];
      if (v === null) nulls.push(j);
      else sum += v;
    }
    info[p] = { sum, nulls };
  }

  const pairs: [Player, Player][] = [['me', 'opponent'], ['opponent', 'me']]; // [ぜんぶ読めている側, 欠けている側]
  for (const [full, part] of pairs) {
    if (info[full].nulls.length === 0 && info[part].nulls.length === 1) {
      const guess = info[full].sum - info[part].sum;
      if (guess >= 0) {
        const key = info[part].nulls[0];
        result[part][key] = guess;
        conf[part][key] = 0; // 推定した値は信頼度0扱い（ユーザーに確認してほしい）
        info[part] = { sum: info[full].sum, nulls: [] };
      }
    }
  }

  if (info.me.nulls.length === 0 && info.opponent.nulls.length === 0) {
    return info.me.sum !== info.opponent.sum; // 合わなければ読み間違いの証拠
  }
  return false;
}

// ============================================================
// 楽曲ジャケット
// ============================================================

// ジャケットのまわり（枠）の色を測る。左・右・下の外側の帯の、RGBそれぞれの中央値を返す
function computeJacketRing(img: ImageLike, base: BaseArea): RGB | null {
  try {
    const r0 = JACKET_REGION;
    const S = JACKET_SIZE;
    const c = env().createCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.drawImage(
      img,
      base.bx + r0.x * base.bw, r0.y * base.bh, r0.w * base.bw, r0.h * base.bh, // 縮小する前の範囲
      0, 0, S, S
    );
    const d = ctx.getImageData(0, 0, S, S).data;

    const t = Math.max(2, Math.round(S * JACKET_RING_THICKNESS));
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (x < t || x >= S - t || y >= S - t) {
          const i = (y * S + x) * 4;
          rs.push(d[i]);
          gs.push(d[i + 1]);
          bs.push(d[i + 2]);
        }
      }
    }
    const median = (a: number[]) => {
      a.sort((p, q) => p - q);
      return a[Math.floor(a.length / 2)];
    };
    return { r: median(rs), g: median(gs), b: median(bs) };
  } catch (e) {
    console.error('ジャケットの枠の色の読み取りに失敗:', e);
    return null;
  }
}

// ジャケットを切り出して、JACKET_GRID x JACKET_GRID マスのモザイク（色の平均）にする
function computeJacket(img: ImageLike, base: BaseArea): JacketHash {
  // 中心を変えずに縮小: 幅・高さを (1 - SHRINK) 倍にして、左上は半分ぶん内側へずらす
  const r0 = JACKET_REGION;
  const r = {
    x: r0.x + (r0.w * JACKET_SHRINK) / 2,
    y: r0.y + (r0.h * JACKET_SHRINK) / 2,
    w: r0.w * (1 - JACKET_SHRINK),
    h: r0.h * (1 - JACKET_SHRINK),
  };

  const S = JACKET_SIZE;
  const c = env().createCanvas(1, 1);
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(
    img,
    base.bx + r.x * base.bw, r.y * base.bh, r.w * base.bw, r.h * base.bh, // yは画面上端から(base.byを足さない)
    0, 0, S, S
  );
  const d = ctx.getImageData(0, 0, S, S).data;

  const cell = S / JACKET_GRID; // 1マスが何ピクセルか
  let hex = '';
  for (let cy = 0; cy < JACKET_GRID; cy++) {
    for (let cx = 0; cx < JACKET_GRID; cx++) {
      let sr = 0, sg = 0, sb = 0;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const idx = ((cy * cell + y) * S + (cx * cell + x)) * 4;
          sr += d[idx];
          sg += d[idx + 1];
          sb += d[idx + 2];
        }
      }
      const n = cell * cell;
      for (const v of [sr / n, sg / n, sb / n]) {
        hex += Math.round(v).toString(16).padStart(2, '0');
      }
    }
  }

  // 確認用・保存用のサムネイル（小さなJPEG）
  const p = env().createCanvas(1, 1);
  p.width = JACKET_PREVIEW_SIZE;
  p.height = JACKET_PREVIEW_SIZE;
  p.getContext('2d')!.drawImage(c, 0, 0, JACKET_PREVIEW_SIZE, JACKET_PREVIEW_SIZE);
  return { hex, preview: env().toJpegDataUrl(p, 0.8), ring: computeJacketRing(img, base) };
}

// hex文字列を数値の配列にする（"c2ced9..." → [194, 206, 217, ...]）
function hexToValues(hex: string): number[] {
  const v: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    v.push(parseInt(hex.substr(i, 2), 16));
  }
  return v;
}

// 2つのモザイクの「違いの大きさ」を返す（0に近いほど似ている）
// 各画像の「平均の明るさ」を引き、「ばらつき」で割ってから比べる
// → 端末やタイミングによる明るさ・コントラストの違いを打ち消せる
export function jacketDistance(hexA: string, hexB: string): number {
  if (hexA.length !== hexB.length) return Infinity; // 分割数が違うものは比べられない

  const a = hexToValues(hexA);
  const b = hexToValues(hexB);
  const n = a.length;

  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;

  let va = 0, vb = 0, raw = 0;
  for (let i = 0; i < n; i++) {
    va += (a[i] - ma) * (a[i] - ma);
    vb += (b[i] - mb) * (b[i] - mb);
    raw += (a[i] - b[i]) * (a[i] - b[i]);
  }
  const sa = Math.sqrt(va / n);
  const sb = Math.sqrt(vb / n);

  // ほぼ単色の画像は「ばらつき」が0に近くて割り算できないので、素の差で比べる
  if (sa < 1 || sb < 1) {
    return Math.sqrt(raw / n) / 20;
  }

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const dd = (a[i] - ma) / sa - (b[i] - mb) / sb;
    sum += dd * dd;
  }
  return Math.sqrt(sum / n);
}

// 保存されているhexのマス数が、いまの設定(JACKET_GRID)と違っても使えるように、マス数をそろえる。
// 例: 8x8 で保存されたものを 4x4 にする（2x2マスの平均をとる）。減らす方向だけ対応。
export function normalizeJacketHex(hex: string): string | null {
  const from = Math.sqrt(hex.length / 6); // 1辺のマス数
  if (!Number.isInteger(from)) return null;
  if (from === JACKET_GRID) return hex;
  if (from < JACKET_GRID || from % JACKET_GRID !== 0) return null;

  const f = from / JACKET_GRID; // 何マスを1マスにまとめるか
  const v = hexToValues(hex);
  let out = '';
  for (let ty = 0; ty < JACKET_GRID; ty++) {
    for (let tx = 0; tx < JACKET_GRID; tx++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let fy = 0; fy < f; fy++) {
          for (let fx = 0; fx < f; fx++) {
            sum += v[((ty * f + fy) * from + (tx * f + fx)) * 3 + ch];
          }
        }
        out += Math.round(sum / (f * f)).toString(16).padStart(2, '0');
      }
    }
  }
  return out;
}

// 保存済みのジャケットの中から、読み取ったジャケットに近い曲を、近い順に返す
// （JACKET_SAME_THRESHOLD 以内で、いちばん近いものから JACKET_MARGIN の範囲に入るものだけ）
// ※ 1つの曲に、ジャケットが複数登録されていることがある（バージョンで変わる曲）。曲ごとに、いちばん近いものを使う。
export function findJacketMatches(hex: string, records: JacketRecord[]): { songName: string; distance: number }[] {
  const target = normalizeJacketHex(hex);
  if (target === null) return [];

  const bestBySong = new Map<string, number>();
  for (const r of records) {
    const h = normalizeJacketHex(r.hex);
    if (h === null) continue;
    const distance = jacketDistance(target, h);
    const prev = bestBySong.get(r.songName);
    if (prev === undefined || distance < prev) bestBySong.set(r.songName, distance);
  }

  const scored = Array.from(bestBySong, ([songName, distance]) => ({ songName, distance }))
    .filter((r) => r.distance <= JACKET_SAME_THRESHOLD)
    .sort((x, y) => x.distance - y.distance);
  if (scored.length === 0) return [];

  const best = scored[0].distance;
  return scored.filter((r) => r.distance <= best + JACKET_MARGIN);
}

// ============================================================
// 読み込み済みの画像を、読み取る
// ============================================================

// 読み込み済みの画像（img）と Tesseract のワーカーを渡すと、自分と相手の判定の数・ジャケットを読み取って返す
export async function analyzeLoadedImage(img: ImageLike, worker: any): Promise<OcrResult> {
  const { result, conf } = await readResult(img, worker);

  const mismatch = checkTotals(result, conf); // null が1個だけなら推定で埋める（信頼度0扱い）

  // いちばん信頼度が低い項目を探す
  let trust = 100;
  let weakest = '';
  for (const player of Object.keys(conf) as Player[]) {
    for (const item of Object.keys(conf[player]) as Item[]) {
      const c = conf[player][item];
      if (c < trust) {
        trust = c;
        weakest = `${player}/${item}`;
      }
    }
  }
  // 自分と相手の合計が合わないのは、どこかを読み間違えている証拠
  if (mismatch) {
    trust = 0;
    weakest = '合計が合わない';
  }

  // ジャケット（読み取れなくても、数字の読み取り結果は返す）
  let jacket: JacketHash | null = null;
  try {
    jacket = computeJacket(img, getBaseArea(img));
  } catch (e) {
    console.error('ジャケットの読み取りに失敗:', e);
  }

  return { me: result.me, opponent: result.opponent, jacket, trust, weakest };
}

// 数字は読まずに、ジャケットだけを読み取る（OCRを使わないので速い）
export function readJacketFromImage(img: ImageLike): JacketHash {
  return computeJacket(img, getBaseArea(img));
}

// 数字を読み取るときの、Tesseract の設定（ブラウザ・サーバー共通）
export const TESSERACT_PARAMS = {
  tessedit_char_whitelist: '0123456789OoQDIl|', // 数字＋数字に見えやすい文字（あとで数字に読み替える）
  tessedit_pageseg_mode: '7', // 1行だけ読むモード
};

// 'opponent/good' のような項目名を、画面に出す日本語にする
export function describeWeakest(weakest: string): string {
  if (weakest === '合計が合わない') return '自分と相手の判定の合計が合っていません';
  const [player, item] = weakest.split('/');
  const who = player === 'me' ? '自分' : player === 'opponent' ? '相手' : player;
  const what: Record<string, string> = {
    perfect: 'PERFECT',
    great: 'GREAT',
    good: 'GOOD',
    bad: 'BAD',
    miss: 'MISS',
    combo: '最大コンボ',
  };
  return `${who}の${what[item] ?? item}`;
}
