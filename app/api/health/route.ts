// app/api/health/route.ts
import { NextResponse } from 'next/server';

// 接続の確認用（ログイン・トークンは不要）。
// iPhone の Safari で、このアドレスを開いて、{"ok":true,...} が出れば、サーバーまで届いている。
export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
