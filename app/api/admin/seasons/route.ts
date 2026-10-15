import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

async function ensureSeasonTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        season_name VARCHAR(50) UNIQUE NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_current BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function GET() {
  try {
    await ensureSeasonTable();
    const result = await query('SELECT * FROM seasons ORDER BY start_time ASC');
    return NextResponse.json({ seasons: result.rows });
  } catch (error) {
    console.error('シーズン取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch seasons' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeasonTable();
    const body = await request.json();
    const { action, seasonName, startTime, endTime } = body;

    // シーズン追加
    if (action === 'create') {
      if (!seasonName || !startTime || !endTime) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
      }

      const formattedStart = startTime.replace('T', ' ') + ':00';
      const formattedEnd = endTime.replace('T', ' ') + ':00';

      await query(
        `INSERT INTO seasons (season_name, start_time, end_time, is_current) 
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (season_name) DO NOTHING;`,
        [seasonName, formattedStart, formattedEnd]
      );
      return NextResponse.json({ success: true });
    }

    // 現在のシーズンに設定
    if (action === 'set_current') {
      await query('UPDATE seasons SET is_current = FALSE');
      await query('UPDATE seasons SET is_current = TRUE WHERE season_name = $1', [seasonName]);
      
      await query('UPDATE app_settings SET current_season = $1', [seasonName]);
      await query('UPDATE rank_status SET season_id = $1', [seasonName]);

      return NextResponse.json({ success: true });
    }

    // 開催中の適用を解除（すべてFALSEにする）
    if (action === 'unset_current') {
      await query('UPDATE seasons SET is_current = FALSE');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('シーズン操作エラー:', error);
    return NextResponse.json({ error: 'Failed to process season action' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureSeasonTable();
    const { searchParams } = new URL(request.url);
    const seasonName = searchParams.get('name');

    if (!seasonName) {
      return NextResponse.json({ error: 'Season name required' }, { status: 400 });
    }

    await query('DELETE FROM seasons WHERE season_name = $1', [seasonName]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('シーズン削除エラー:', error);
    return NextResponse.json({ error: 'Failed to delete season' }, { status: 500 });
  }
}