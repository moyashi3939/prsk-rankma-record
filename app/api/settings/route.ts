import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    let result = await query('SELECT * FROM app_settings ORDER BY id ASC LIMIT 1');
    if (result.rows.length === 0) {
      const init = await query(`
        INSERT INTO app_settings (user_name, custom_id, user_id, current_season)
        VALUES ('プロセカプレイヤー', 'my_id', '1234567890', 'Season 1')
        RETURNING *;
      `);
      result = init;
    }
    const row = result.rows[0];
    return NextResponse.json({
      userName: row.user_name,
      customId: row.custom_id || 'my_id',
      userId: row.user_id,
      currentSeason: row.current_season,
      seasonEndDays: row.season_end_days,
    });
  } catch (error) {
    console.error('設定取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userName, customId, userId, currentSeason, seasonEndDays, action } = body;

    if (action === 'reset_all_data') {
      await query('TRUNCATE TABLE matches RESTART IDENTITY CASCADE;');
      await query(`
        UPDATE rank_status 
        SET rank_name = '判定マッチ', class_index = 0, grains = 0, 
            placement_matches_played = 0, is_placement_completed = FALSE;
      `);
      return NextResponse.json({ success: true });
    }

    const check = await query('SELECT id FROM app_settings LIMIT 1');
    if (check.rows.length > 0) {
      await query(`
        UPDATE app_settings
        SET user_name = COALESCE(NULLIF($1, ''), user_name),
            custom_id = COALESCE(NULLIF($2, ''), custom_id),
            user_id = COALESCE(NULLIF($3, ''), user_id),
            current_season = COALESCE(NULLIF($4, ''), current_season),
            season_end_days = COALESCE($5, season_end_days),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6;
      `, [userName, customId, userId, currentSeason, seasonEndDays, check.rows[0].id]);
    } else {
      await query(`
        INSERT INTO app_settings (user_name, custom_id, user_id, current_season, season_end_days)
        VALUES ($1, $2, $3, $4, $5);
      `, [userName || 'プレイヤー', customId || 'my_id', userId || '12345', currentSeason || 'Season 1', seasonEndDays || 80]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('設定更新エラー:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}