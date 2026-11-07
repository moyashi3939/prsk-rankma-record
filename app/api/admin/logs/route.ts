// app/api/admin/logs/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { clearLogs, getLogs } from '@/lib/logBuffer';

// ログの一覧（管理者のみ）。?since=番号 で、その番号より新しいものだけ
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const since = Number(new URL(request.url).searchParams.get('since') || 0);
  return NextResponse.json({ logs: getLogs(Number.isFinite(since) ? since : 0) });
}

// サーバー側に貯めているログを、すべて消す（管理者のみ）
export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;

  clearLogs();
  return NextResponse.json({ success: true });
}
