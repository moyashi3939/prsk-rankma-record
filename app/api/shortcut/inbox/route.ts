
// app/api/shortcut/inbox/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureShortcutTables } from '@/lib/schema';
import { getSessionEmail } from '@/lib/session';

// 受信箱（ショートカットから届いた、まだ登録していない画像）の一覧
// ログインしていない（ゲスト）ときは、空の一覧を返す
export async function GET() {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json([]);

    await ensureShortcutTables();
    const res = await query(
      'SELECT id, size, reason, created_at FROM shortcut_uploads WHERE owner_id = $1 ORDER BY id ASC',
      [email]
    );
    return NextResponse.json(
      res.rows.map((r) => ({ id: r.id, size: r.size, reason: r.reason, createdAt: r.created_at }))
    );
  } catch (error) {
    console.error('受信箱の取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch inbox' }, { status: 500 });
  }
}
