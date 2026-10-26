
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const notes = searchParams.get('notes');

    if (!notes) {
      return NextResponse.json({ song: null });
    }

    // 楽曲テーブル（songs等）からノーツ数が一致する楽曲を取得
    const res = await query(
      `SELECT title, difficulty, total_notes FROM songs WHERE total_notes = $1 LIMIT 1`,
      [Number(notes)]
    );

    if (res.rows.length > 0) {
      return NextResponse.json({ song: res.rows[0] });
    }

    return NextResponse.json({ song: null });
  } catch (error) {
    console.error('ノーツ検索エラー:', error);
    return NextResponse.json({ song: null });
  }
}