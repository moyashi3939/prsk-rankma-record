// app/api/admin/songs/bulk/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { songs } = body;

    if (!Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json({ error: '楽曲データが空または無効です' }, { status: 400 });
    }

    // テーブルの存在確認 & カラム構築
    await query(`
      CREATE TABLE IF NOT EXISTS songs (
        id SERIAL PRIMARY KEY,
        song_name VARCHAR(255) NOT NULL,
        difficulty VARCHAR(50) NOT NULL,
        level VARCHAR(50) NOT NULL,
        total_notes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query('BEGIN');
    for (const song of songs) {
      const songName = (song.songName || song.title || '').trim();
      const difficulty = (song.difficulty || '').trim();
      const level = String(song.level || '').trim();
      const totalNotes = parseInt(song.notes || song.total_notes, 10) || 0;

      if (!songName || !difficulty || !level) continue;

      // 既存データのチェック
      const existing = await query(
        'SELECT id FROM songs WHERE song_name = $1 AND difficulty = $2',
        [songName, difficulty]
      );

      if (existing.rows.length > 0) {
        // UPDATE 処理
        await query(
          'UPDATE songs SET level = $1, total_notes = $2 WHERE song_name = $3 AND difficulty = $4',
          [level, totalNotes, songName, difficulty]
        );
      } else {
        // INSERT 処理
        await query(
          'INSERT INTO songs (song_name, difficulty, level, total_notes) VALUES ($1, $2, $3, $4)',
          [songName, difficulty, level, totalNotes]
        );
      }
    }
    await query('COMMIT');

    return NextResponse.json({
      success: true,
      count: songs.length,
      message: `${songs.length} 件の楽曲データを一括登録・更新しました`
    });
  } catch (error) {
    await query('ROLLBACK');
    console.error('一括インポートエラー:', error);
    return NextResponse.json({ error: 'Failed to bulk import songs' }, { status: 500 });
  }
}