// app/api/shortcut/inbox/[id]/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureShortcutTables } from '@/lib/schema';
import { getSessionEmail } from '@/lib/session';

type Context = { params: Promise<{ id: string }> };

// 受信箱の画像そのものを返す（記録画面が、読み取り用に取り込む）
export async function GET(_request: Request, { params }: Context) {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await ensureShortcutTables();
    const res = await query('SELECT mime, image FROM shortcut_uploads WHERE id = $1 AND owner_id = $2', [id, email]);
    if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { mime, image } = res.rows[0];
    return new Response(new Uint8Array(image), {
      headers: { 'Content-Type': mime, 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('受信箱の画像取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}

// 受信箱から画像を消す（登録を保存したとき・いらない画像を捨てるとき）
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await ensureShortcutTables();
    // 同じ画像をもう一度送ってしまっても、二重に登録しないように、画像のハッシュを覚えておく
    await query(
      `INSERT INTO shortcut_processed (owner_id, sha256)
       SELECT owner_id, sha256 FROM shortcut_uploads WHERE id = $1 AND owner_id = $2 AND sha256 IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [id, email]
    );
    await query('DELETE FROM shortcut_uploads WHERE id = $1 AND owner_id = $2', [id, email]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('受信箱の画像削除エラー:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
