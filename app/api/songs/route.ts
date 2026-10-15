import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// 楽曲一覧の取得
export async function GET() {
  try {
    const result = await query('SELECT * FROM songs ORDER BY id DESC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('楽曲取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch songs' }, { status: 500 });
  }
}

// 楽曲の登録・更新（存在チェックをしてからINSERT or UPDATEする安全な方式）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { songName, difficulties } = body;

    if (!songName || !difficulties) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    for (const diff of difficulties) {
      const { name, level, notes } = diff;
      if (level && notes) {
        const totalNotes = parseInt(notes, 10);
        if (!isNaN(totalNotes) && totalNotes > 0) {
          // 1. すでに同じ曲名＆難業度が存在するか確認
          const existing = await query(
            'SELECT id FROM songs WHERE song_name = $1 AND difficulty = $2',
            [songName.trim(), name]
          );

          if (existing.rows.length > 0) {
            // 2. 存在する場合は更新（UPDATE）
            await query(
              'UPDATE songs SET level = $1, total_notes = $2 WHERE song_name = $3 AND difficulty = $4',
              [level.trim(), totalNotes, songName.trim(), name]
            );
          } else {
            // 3. 存在しない場合は新規追加（INSERT）
            await query(
              'INSERT INTO songs (song_name, difficulty, level, total_notes) VALUES ($1, $2, $3, $4)',
              [songName.trim(), name, level.trim(), totalNotes]
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('楽曲登録エラー:', error);
    return NextResponse.json({ error: 'Failed to save song' }, { status: 500 });
  }
}