// app/api/users/search/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureAppSettings, ensureFriendships, ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';

// プレイヤーの表示用の項目（ランクは、その人の rank_status から取る）
const PLAYER_COLUMNS = `
  u.user_name,
  COALESCE(u.custom_id, 'player_default') AS custom_id,
  u.user_id,
  COALESCE(r.rank_name, '判定マッチ') AS rank_name,
  COALESCE(r.class_index, 0) AS class_index,
  COALESCE(r.grains, 0) AS grains,
  COALESCE(r.season_id, 'Season 1') AS season_id
`;

// 自分がフォローしているプレイヤー一覧 / プレイヤー検索
//   GET /api/users/search?type=following   … フォロー中の一覧（自分のぶんだけ）
//   GET /api/users/search?q=〇〇           … 名前・IDで検索（自分は除く）
export async function GET(request: Request) {
  try {
    await ensureAppSettings();
    await ensureOwnerColumns();
    await ensureFriendships();
    const owner = await getOwnerId();

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().slice(0, 50);
    const type = searchParams.get('type');

    // 自分がフォローしているプレイヤー
    if (type === 'following') {
      const result = await query(
        `SELECT ${PLAYER_COLUMNS}
         FROM friendships f
         JOIN app_settings u ON f.following_custom_id = u.custom_id
         LEFT JOIN rank_status r ON r.owner_id = u.user_email
         WHERE f.follower_email = $1
         ORDER BY f.id`,
        [owner]
      );
      return NextResponse.json({ users: result.rows });
    }

    if (!q) {
      return NextResponse.json({ users: [] });
    }

    // LIKE の特別な文字（% _ \）は、ただの文字として検索する
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await query(
      `SELECT ${PLAYER_COLUMNS}
       FROM app_settings u
       LEFT JOIN rank_status r ON r.owner_id = u.user_email
       WHERE (u.custom_id ILIKE $1 OR u.user_name ILIKE $1)
         AND u.user_email IS DISTINCT FROM $2
       LIMIT 10`,
      [pattern, owner]
    );
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    console.error('API検索エラー:', error);
    return NextResponse.json({ users: [], error: 'Internal Server Error' }, { status: 500 });
  }
}

// プレイヤーをフォローする（自分のぶんとして登録される）
export async function POST(request: Request) {
  try {
    const { targetCustomId } = await request.json();
    if (typeof targetCustomId !== 'string' || !targetCustomId || targetCustomId.length > 50) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    await ensureAppSettings();
    await ensureFriendships();
    const owner = await getOwnerId();

    // フォロー先が、実在するプレイヤーで、自分自身ではないこと
    const target = await query('SELECT user_email FROM app_settings WHERE custom_id = $1 LIMIT 1', [targetCustomId]);
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'プレイヤーが見つかりません' }, { status: 404 });
    }
    if (target.rows[0].user_email === owner) {
      return NextResponse.json({ error: '自分自身はフォローできません' }, { status: 400 });
    }

    await query(
      `INSERT INTO friendships (follower_email, following_custom_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_email, following_custom_id) DO NOTHING`,
      [owner, targetCustomId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API登録エラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
