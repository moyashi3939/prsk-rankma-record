// app/api/admin/logs/stream/route.ts
import { requireAdmin } from '@/lib/admin';
import { createLogStream } from '@/lib/logBuffer';

// ログをリアルタイムに流す（Server-Sent Events）。管理者のみ。
// ブラウザの EventSource が、つながりが切れたときに、自動で続きから再接続する（Last-Event-ID）
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const lastId = Number(request.headers.get('last-event-id') || new URL(request.url).searchParams.get('since') || 0);

  return new Response(createLogStream(request.signal, Number.isFinite(lastId) ? lastId : 0), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // プロキシ（nginx など）に、ためこまず、すぐ流してもらう
    },
  });
}
