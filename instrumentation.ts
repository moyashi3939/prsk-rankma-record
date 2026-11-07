// instrumentation.ts
// サーバーの起動時に、1回だけ実行される（Next.js の決まり）。
// console.error / console.warn を、管理者画面のログ画面にも流れるようにする。
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installConsoleCapture } = await import('./lib/logBuffer');
    installConsoleCapture();
  }
}
