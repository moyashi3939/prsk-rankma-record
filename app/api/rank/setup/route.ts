// app/api/rank/setup/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureOwnerColumns, getDefaultSeason } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { formatRankStatus, validateStart, PLACEMENT_MATCHES, PLACEMENT_NAME } from '@/lib/rank';

// 最初の状態を決める（初めて使うとき・データ初期化のあと）
//   { mode: 'placement' }                                … 判定マッチから始める
//   { mode: 'rank', rankName, classIndex, grains }       … 指定したランク・クラス・粒から始める（途中参加）
// ここで決めた「最初の状態」を覚えておいて、対戦履歴を削除したときは、ここから計算し直す。
export async function POST(request: Request) {
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();
    const body = await request.json();

    // すでに対戦記録があるときは、最初の状態を変えられない（記録とずれるため）
    const count = await query('SELECT COUNT(*)::int AS n FROM matches WHERE owner_id = $1', [owner]);
    if (count.rows[0].n > 0) {
      return NextResponse.json(
        { error: '対戦記録があるため、最初の状態は変更できません。先にデータ初期化をしてください。' },
        { status: 409 }
      );
    }

    // 保存する値
    let v: {
      rankName: string;
      classIndex: number;
      grains: number;
      bonus: number;
      played: number;
      completed: boolean;
      startRankName: string | null;
    };

    if (body.mode === 'placement') {
      v = { rankName: PLACEMENT_NAME, classIndex: 0, grains: 0, bonus: 0, played: 0, completed: false, startRankName: null };
    } else if (body.mode === 'rank') {
      const checked = validateStart(body);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }
      v = {
        rankName: checked.value.rankName,
        classIndex: checked.value.classIndex,
        grains: checked.value.grains,
        bonus: checked.value.bonus,
        played: PLACEMENT_MATCHES,
        completed: true,
        startRankName: checked.value.rankName,
      };
    } else {
      return NextResponse.json({ error: 'mode が正しくありません' }, { status: 400 });
    }

    const res = await query(
      `INSERT INTO rank_status (
         owner_id, season_id, rank_name, class_index, grains, placement_matches_played, is_placement_completed,
         setup_done, baseline_known, start_rank_name, start_class_index, start_grains, placement_rank_name, placement_class_index,
         bonus, start_bonus, baseline_after_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE, $8, $4, $5, NULL, NULL, $9, $9, 0)
       ON CONFLICT (owner_id) DO UPDATE SET
         rank_name = $3,
         class_index = $4,
         grains = $5,
         placement_matches_played = $6,
         is_placement_completed = $7,
         setup_done = TRUE,
         baseline_known = TRUE,
         start_rank_name = $8,
         start_class_index = $4,
         start_grains = $5,
         placement_rank_name = NULL,
         placement_class_index = NULL,
         bonus = $9,
         start_bonus = $9,
         baseline_after_id = 0,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [owner, await getDefaultSeason(), v.rankName, v.classIndex, v.grains, v.played, v.completed, v.startRankName, v.bonus]
    );

    return NextResponse.json({ success: true, rankStatus: formatRankStatus(res.rows[0]) });
  } catch (error) {
    console.error('最初の状態の設定エラー:', error);
    return NextResponse.json({ error: 'Failed to set up rank' }, { status: 500 });
  }
}
