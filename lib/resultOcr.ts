// lib/resultOcr.ts
// ブラウザ用：リザルト画像を、ブラウザの中で読み取る（Tesseract.js を CDN から読み込む）。
// 画像は自分の端末の中で処理され、サーバーにも外部のAIサービスにも送られない（無料）。
// ※ ブラウザ専用（document / Image / canvas を使う）。サーバー側からは呼ばないこと
//    （サーバーでは lib/ocrCore.ts か lib/serverOcr.ts を使う）。
import {
  analyzeLoadedImage,
  readJacketFromImage,
  setOcrEnv,
  TESSERACT_PARAMS,
  type AnalyzeOptions,
  type JacketHash,
  type OcrResult,
} from '@/lib/ocrCore';

// 型・判定用の関数は、そのまま使えるように再エクスポートする
export * from '@/lib/ocrCore';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

// ブラウザの canvas を使う設定
setOcrEnv({
  createCanvas(width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  },
  toRecognizable: (canvas) => canvas,
  toJpegDataUrl: (canvas, quality) => (canvas as HTMLCanvasElement).toDataURL('image/jpeg', quality),
});

// ============================================================
// Tesseract.js の読み込み（初回だけ CDN から読み込む）
// ============================================================

declare global {
  interface Window {
    Tesseract?: any;
  }
}

let tesseractPromise: Promise<any> | null = null;

function loadTesseract(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OCRはブラウザでのみ使えます'));
  }
  if (window.Tesseract) return Promise.resolve(window.Tesseract);

  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => {
        tesseractPromise = null; // 次回やり直せるようにする
        reject(new Error('OCRライブラリを読み込めませんでした（ネットワークを確認してください）'));
      };
      document.head.appendChild(script);
    });
  }
  return tesseractPromise;
}

// Tesseract のワーカーは1回だけ作って使い回す（毎回作ると遅い）
let sharedWorker: any = null;

async function getWorker(): Promise<any> {
  if (sharedWorker === null) {
    const Tesseract = await loadTesseract();
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters(TESSERACT_PARAMS);
    sharedWorker = worker;
  }
  return sharedWorker;
}

function loadImage(file: Blob): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

// ============================================================
// 外から使う関数
// ============================================================

// リザルト画像（File / Blob）を渡すと、自分と相手の判定の数を読み取って返す
export async function analyzeResultImage(file: Blob, options: AnalyzeOptions = {}): Promise<OcrResult> {
  const { img, url } = await loadImage(file);
  try {
    const worker = await getWorker();
    return await analyzeLoadedImage(img, worker, options);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 数字は読まずに、ジャケットだけを読み取る（管理者画面でのジャケット登録用。OCRを使わないので速い）
export async function readJacket(file: Blob): Promise<JacketHash> {
  const { img, url } = await loadImage(file);
  try {
    return readJacketFromImage(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
