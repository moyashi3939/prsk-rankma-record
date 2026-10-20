import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureAppSettings, ensureOwnerColumns } from '@/lib/schema';
import { getSessionEmail, getOwnerId } from '@/lib/session';
import { isAdminEmail } from '@/lib/admin';

export async function GET() {
  try {
    const userEmail = await getSessionEmail();

    // テーブルが存在しない場合に作成（user_email の UNIQUE 制約を確実に付与）
    await ensureAppSettings();

    // ログインしていなければ空のデフォルトを返す（他人のデータを勝手に引っ張らない）
    if (!userEmail) {
      return NextResponse.json({
        userName: 'プロセカプレイヤー',
        customId: 'player_default',
        userId: '1234567890',
        userEmail: '',
        isAdmin: false,
      });
    }

    // ログイン中のユーザーの設定を検索
    const res = await query('SELECT * FROM app_settings WHERE user_email = $1', [userEmail]);
    
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return NextResponse.json({
        userName: row.user_name || 'プロセカプレイヤー',
        customId: row.custom_id || 'player_default',
        userId: row.user_id || '1234567890',
        userEmail: row.user_email,
        isAdmin: isAdminEmail(row.user_email),
      });
    }

    // まだこのアカウントの設定がなければ、自動で新規作成して返す
    await query(
      `INSERT INTO app_settings (user_email, user_name, custom_id, user_id) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (user_email) DO NOTHING`,
      [userEmail, 'プロセカプレイヤー', 'player_' + Math.floor(Math.random() * 90000 + 10000), '1234567890']
    );

    const newRes = await query('SELECT * FROM app_settings WHERE user_email = $1', [userEmail]);
    const row = newRes.rows[0];

    return NextResponse.json({
      userName: row?.user_name || 'プロセカプレイヤー',
      customId: row?.custom_id || 'player_default',
      userId: row?.user_id || '1234567890',
      userEmail: userEmail,
      isAdmin: isAdminEmail(userEmail),
    });

  } catch (error) {
    console.error('設定取得エラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userName, customId, userId, action } = body;

    const activeEmail = await getSessionEmail();

    // ⚠️ データ初期化（リセット）アクションの処理：自分のデータだけを初期化する
    if (action === 'reset_all_data') {
      await ensureOwnerColumns();
      const owner = await getOwnerId();
      console.log(`データリセット実行: ${owner}`);

      const client = await getClient();
      try {
        await client.query('BEGIN');

        // 1. 自分の対戦記録をすべて削除
        await client.query('DELETE FROM matches WHERE owner_id = $1', [owner]);

        // 2. 自分のランク状態を初期状態（判定マッチ・粒0）に戻す
        //    シーズン（season_id）は現在の値を維持する
        await client.query(
          `UPDATE rank_status
           SET rank_name = '判定マッチ',
               class_index = 0,
               grains = 0,
               placement_matches_played = 0,
               is_placement_completed = FALSE,
               updated_at = CURRENT_TIMESTAMP
           WHERE owner_id = $1`,
          [owner]
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      // 3. ログイン中なら、プロフィール設定もデフォルト値に戻す
      if (activeEmail) {
        await ensureAppSettings();
        await query(
          `UPDATE app_settings 
           SET user_name = 'プロセカプレイヤー', custom_id = $2, user_id = '1234567890', updated_at = CURRENT_TIMESTAMP 
           WHERE user_email = $1`,
          [activeEmail, 'player_' + Math.floor(Math.random() * 90000 + 10000)]
        );
      }

      return NextResponse.json({ success: true });
    }

    // 通常の設定更新処理（ログイン必須）
    if (!activeEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureAppSettings();

    await query(
      `INSERT INTO app_settings (user_email, user_name, custom_id, user_id, updated_at) 
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_email) 
       DO UPDATE SET user_name = $2, custom_id = $3, user_id = $4, updated_at = CURRENT_TIMESTAMP`,
      [activeEmail, userName, customId, userId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('設定更新・リセットエラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
