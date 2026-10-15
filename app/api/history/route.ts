// app/api/history/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // データベースから対戦履歴を新しい順に取得
    const result = await query('SELECT * FROM matches ORDER BY id DESC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('対戦履歴取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}