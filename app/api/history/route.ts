// app/api/history/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';

export async function GET() {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    // 自分の対戦履歴だけを新しい順に取得
    const result = await query('SELECT * FROM matches WHERE owner_id = $1 ORDER BY id DESC', [owner]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('対戦履歴取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}