// lib/logBuffer.ts
// サーバーで起きたエラー・お知らせを、メモリに貯めておく（管理者画面のログ画面で、リアルタイムに見られる）。
// ・instrumentation.ts から、console.error / console.warn を横取りして、ここに貯める（コードを1つずつ直さなくてよい）
// ・直近の MAX_ENTRIES 件だけを覚える。サーバーを再起動すると、消える
// ・globalThis に置くので、Next.js が API ごとにファイルを別々に読み込んでも、同じログを共有できる
// ※ サーバー専用（node:util を使う）
import { format } from 'node:util';

export type LogLevel = 'error' | 'warn' | 'info';

export interface LogEntry {
  id: number;
  time: string; // ISO 8601
  level: LogLevel;
  message: string;
}

type Listener = (entry: LogEntry) => void;

interface Store {
  entries: LogEntry[];
  seq: number;
  listeners: Set<Listener>;
  captured: boolean;
}

const MAX_ENTRIES = 500;
const MAX_MESSAGE_LENGTH = 6000;

const g = globalThis as unknown as { __appLogStore?: Store };
const store: Store = (g.__appLogStore ??= { entries: [], seq: 0, listeners: new Set(), captured: false });

// ログを1件追加する
export function pushLog(level: LogLevel, message: string): LogEntry {
  const entry: LogEntry = {
    id: ++store.seq,
    time: new Date().toISOString(),
    level,
    message: message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) + '…（長いので省略）' : message,
  };
  store.entries.push(entry);
  if (store.entries.length > MAX_ENTRIES) store.entries.splice(0, store.entries.length - MAX_ENTRIES);
  for (const listener of store.listeners) {
    try {
      listener(entry);
    } catch {
      // 表示側のエラーで、ログの記録が止まらないようにする
    }
  }
  return entry;
}

// アプリのお知らせ（コンソールには出さず、ログ画面にだけ出す）
export const serverLog = {
  info: (message: string) => pushLog('info', message),
  warn: (message: string) => pushLog('warn', message),
  error: (message: string) => pushLog('error', message),
};

// sinceId より新しいログを返す（古い順）
export function getLogs(sinceId = 0): LogEntry[] {
  return store.entries.filter((e) => e.id > sinceId);
}

export function clearLogs() {
  store.entries.length = 0;
}

// 新しいログが追加されたときに呼ばれる関数を登録する。戻り値は、登録を解除する関数
export function subscribe(listener: Listener): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

// console.error / console.warn を、ログにも貯めるようにする（1回だけ）
export function installConsoleCapture() {
  if (store.captured) return;
  store.captured = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    originalError(...args);
    try {
      pushLog('error', format(...args));
    } catch {
      // 記録に失敗しても、元の動作は止めない
    }
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    try {
      pushLog('warn', format(...args));
    } catch {
      // 同上
    }
  };

  pushLog('info', 'ログの記録を開始しました（サーバーの起動）');
}

// ログを、ブラウザに少しずつ送る（Server-Sent Events）ための、ストリームを作る
//  lastId … ここまで受け取り済み（途中から再接続したときの続き用）
export function createLogStream(signal: AbortSignal, lastId = 0): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (entry: LogEntry) => {
        controller.enqueue(encoder.encode(`id: ${entry.id}\ndata: ${JSON.stringify(entry)}\n\n`));
      };

      // いままでに貯まっているログ
      for (const entry of getLogs(lastId)) send(entry);

      // これから追加されるログ
      const unsubscribe = subscribe(send);

      // 接続が切れていないことを知らせる（プロキシに、つながっていないと思われないように）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);

      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // すでに閉じている
        }
      };
      signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    },
  });
}
