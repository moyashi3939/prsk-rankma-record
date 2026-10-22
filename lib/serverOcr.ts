// lib/serverOcr.ts
// サーバー（Node.js）用：iOSショートカットで送られてきた画像を、サーバーで読み取る。
// ブラウザ用（lib/resultOcr.ts）と、読み取りの処理本体（lib/ocrCore.ts）は同じものを使う。
//
// 必要なパッケージ（どちらも、まだ入っていなければ npm install が必要）:
//   npm install tesseract.js @napi-rs/canvas
// パッケージが入っていない・読み込めないときは、available が false になる。
// そのときは呼び出し側で、画像を「受信箱（保留）」に入れる。
import { createRequire } from 'module';
import path from 'path';
import { analyzeLoadedImage, setOcrEnv, TESSERACT_PARAMS, type OcrResult } from '@/lib/ocrCore';

// バンドラーを通さずに、プロジェクトの node_modules から直接 require する
// （パッケージが無いときも、アプリ全体のビルドは壊れない）
const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'));

interface Runtime {
  createCanvas: (w: number, h: number) => any;
  loadImage: (src: Buffer) => Promise<any>;
  worker: any;
}

let runtimePromise: Promise<Runtime> | null = null;

async function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const canvasPkg = nodeRequire('@napi-rs/canvas');
      const tesseract = nodeRequire('tesseract.js');

      // canvas の使い方を、サーバー用にする
      setOcrEnv({
        createCanvas: (w, h) => canvasPkg.createCanvas(w, h),
        toRecognizable: (canvas: any) => canvas.toBuffer('image/png'), // サーバーでは PNG の Buffer を渡す
        toJpegDataUrl: (canvas: any, quality: number) =>
          'data:image/jpeg;base64,' + canvas.toBuffer('image/jpeg', Math.round(quality * 100)).toString('base64'),
      });

      // 言語データ（eng）の保存先。プロジェクトの中に作る（.gitignore に入れておくこと）
      const worker = await tesseract.createWorker('eng', 1, {
        cachePath: path.join(process.cwd(), '.tesseract-cache'),
      });
      await worker.setParameters(TESSERACT_PARAMS);

      return { createCanvas: canvasPkg.createCanvas, loadImage: canvasPkg.loadImage, worker };
    })().catch((err) => {
      runtimePromise = null; // 次回やり直せるようにする
      throw err;
    });
  }
  return runtimePromise;
}

// 1つのワーカーで同時に読み取らないように、順番待ちにする
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// サーバーでの読み取りが使えるか（パッケージが入っているか）を確かめる
export async function isServerOcrAvailable(): Promise<boolean> {
  try {
    await getRuntime();
    return true;
  } catch (err) {
    console.error('サーバーでの画像読み取りは使えません（tesseract.js / @napi-rs/canvas を確認してください）:', err);
    return false;
  }
}

// 画像（JPEG / PNG / WebP の Buffer）を読み取る
export function analyzeResultBuffer(buf: Buffer): Promise<OcrResult> {
  return enqueue(async () => {
    const rt = await getRuntime();
    const img = await rt.loadImage(buf);
    return analyzeLoadedImage(img, rt.worker);
  });
}
