import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const type = searchParams.get('type');

    // 1. テーブルの存在確認と作成（念のため毎回安全に実行）
    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(100) DEFAULT 'プロセカプレイヤー',
        custom_id VARCHAR(50) UNIQUE DEFAULT 'player_default',
        user_id VARCHAR(50) DEFAULT '1234567890',
        current_season VARCHAR(50) DEFAULT 'Season 1',
        season_end_days INT DEFAULT 80,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        follower_email VARCHAR(255) DEFAULT 'default_user',
        following_custom_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_email, following_custom_id)
      );
    `);

    // 2. フォロー中リストの取得要求
    if (type === 'following') {
      const result = await query(`
        SELECT u.user_name, u.custom_id, u.user_id, '判定マッチ' AS rank_name, 0 AS class_index, 0 AS grains, 'Season 1' AS season_id
        FROM friendships f
        JOIN app_settings u ON f.following_custom_id = u.custom_id
      `);
      return NextResponse.json({ users: result.rows });
    }

    // 3. 通常検索
    if (!q.trim()) {
      return NextResponse.json({ users: [] });
    }

    const searchResult = await query(
      `SELECT user_name, custom_id, user_id, '判定マッチ' AS rank_name, 0 AS class_index, 0 AS grains, 'Season 1' AS season_id
       FROM app_settings 
       WHERE custom_id ILIKE $1 OR user_name ILIKE $1 
       LIMIT 10`,
      [`%${q}%`]
    );

    return NextResponse.json({ users: searchResult.rows });
  } catch (error) {
    console.error('API検索エラー:', error);
    return NextResponse.json({ users: [], error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetCustomId } = body;

    if (!targetCustomId) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        follower_email VARCHAR(255) DEFAULT 'default_user',
        following_custom_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_email, following_custom_id)
      );
    `);

    await query(
      `INSERT INTO friendships (follower_email, following_custom_id) 
       VALUES ('default_user', $1) 
       ON CONFLICT (follower_email, following_custom_id) DO NOTHING;`,
      [targetCustomId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API登録エラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}