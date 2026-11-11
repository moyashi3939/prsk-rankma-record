// instrumentation.ts
// サーバーの起動時に、1回だけ実行される（Next.js の決まり）。
//  1. console.error / console.warn を、管理者画面のログ画面にも流れるようにする
//  2. 想定外のエラー（未処理の例外・Promiseのエラー）で、サーバーが落ちないようにして、ログに残す
//     （画像の読み取り（tesseract.js）の内部で起きたエラーで、サーバーごと落ちると、
//      iPhone のショートカットに「ネットワーク接続が切れました」と出てしまうため）
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installConsoleCapture } = await import('./lib/logBuffer');
    installConsoleCapture();

    const g = globalThis as unknown as { __appCrashGuard?: boolean };
    if (!g.__appCrashGuard) {
      g.__appCrashGuard = true;
      process.on('unhandledRejection', (reason) => {
        console.error('未処理のPromiseエラー（サーバーは、止まらずに続けます）:', reason);
      });
      process.on('uncaughtException', (err) => {
        console.error('未処理の例外（サーバーは、止まらずに続けます）:', err);
      });
    }
  }
}
