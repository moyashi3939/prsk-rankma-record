// app/api/shortcut/ping/route.ts
import { NextResponse } from 'next/server';
import { ownerFromBearer } from '@/lib/apiToken';
import { serverLog } from '@/lib/logBuffer';

// ショートカットから、「サーバーに届くか」と「トークンが正しいか」を確かめるための、軽いAPI。
//   GET /api/shortcut/ping   ヘッダ: Authorization: Bearer <トークン>
async function handle(request: Request) {
  try {
    const owner = await ownerFromBearer(request);
    if (!owner) {
      serverLog.warn('ショートカット接続テスト：トークンが正しくありません');
      return NextResponse.json(
        { success: false, error: true, status: 'error', saved: false, message: '❌ サーバーには届きましたが、トークンが正しくありません' },
        { status: 401 }
      );
    }
    serverLog.info('ショートカット接続テスト：OK');
    return NextResponse.json({ success: true, error: false, status: 'ok', saved: false, message: '✅ 接続OK（トークンも正しいです）' });
  } catch (error) {
    console.error('ショートカット接続テストのエラー:', error);
    return NextResponse.json(
      { success: false, error: true, status: 'error', saved: false, message: 'サーバーでエラーが発生しました' },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
