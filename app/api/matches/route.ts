// app/api/matches/route.ts
import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { ensureOwnerColumns } from '@/lib/schema';
import { getOwnerId } from '@/lib/session';
import { recordMatchForOwner } from '@/lib/recordMatch';
import { baselineFromRow, formatRankStatus, replay, revertLegacy, stateFromRow } from '@/lib/rank';
import { deriveMatchFlags } from '@/lib/matchCalc';

// 対戦レコードの保存（記録の保存と、ランク・粒の更新を、サーバーで1回にまとめて行う）
// 勝敗・スコア・ランクの計算は、サーバー側（lib/matchCalc.ts / lib/rank.ts）で行う。
// 片方だけ保存されて、ずれることがない。
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { songName, difficulty, level, isOpponentHigher } = body;

    if (typeof songName !== 'string' || !songName.trim() || typeof difficulty !== 'string' || !difficulty) {
      return NextResponse.json({ error: '曲名と難易度が必要です' }, { status: 400 });
    }

    const int = (v: unknown) => Math.max(0, parseInt(String(v ?? ''), 10) || 0);

    // 総ノーツ数は、登録されている曲から取る（なければ、自分の判定の合計になる）
    const song = await query('SELECT total_notes FROM songs WHERE song_name = $1 AND difficulty = $2 LIMIT 1', [
      songName,
      difficulty,
    ]);
    const totalNotes = song.rows.length > 0 ? Number(song.rows[0].total_notes) || 0 : 0;

    const owner = await getOwnerId();
    const saved = await recordMatchForOwner(owner, {
      songName,
      difficulty,
      level: String(level ?? ''),
      totalNotes,
      isOpponentHigher: !!isOpponentHigher,
      my: {
        perfect: int(body.myPerfect),
        great: int(body.myGreat),
        good: int(body.myGood),
        bad: int(body.myBad),
        miss: int(body.myMiss),
      },
      opp: {
        great: int(body.oppGreat),
        good: int(body.oppGood),
        bad: int(body.oppBad),
        miss: int(body.oppMiss),
      },
    });

    return NextResponse.json({ success: true, match: saved.match, rankStatus: saved.rankStatus });
  } catch (error) {
    console.error('対戦レコード保存エラー:', error);
    return NextResponse.json({ error: 'Failed to save match' }, { status: 500 });
  }
}

// 自分の対戦レコードの削除（ランク・粒も正しい状態に直す）
// ・「最初の状態」が分かっているデータ … 最初の状態から、残りの対戦を順に当てはめ直して現在の状態を求める（正確）
// ・古いデータ（最初の状態が不明） … 削除した試合ぶんを、現在の状態から1つ戻す（近似）
export async function DELETE(request: Request) {
  const client = await getClient();
  try {
    await ensureOwnerColumns();
    const owner = await getOwnerId();

    const { recordId } = await request.json();
    const id = Number(recordId);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // 1. 自分のレコードだけを削除対象にする（他人の記録は消せない）
    const deleted = await client.query(
      'DELETE FROM matches WHERE id = $1 AND owner_id = $2 RETURNING result',
      [id, owner]
    );
    if (deleted.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    const deletedResult: string = deleted.rows[0].result ?? '';

    // 2. 自分のランク状態を、削除後の対戦履歴に合わせて直す
    let rankStatus = null;
    const rankRes = await client.query('SELECT * FROM rank_status WHERE owner_id = $1 FOR UPDATE', [owner]);

    if (rankRes.rows.length > 0) {
      const row = rankRes.rows[0];
      const afterId: number = row.baseline_after_id ?? 0; // 「最初の状態」を決めた（手で修正した）より前の対戦は、ランクの計算に使わない

      if (row.baseline_known && id <= afterId) {
        // ランクの計算に使っていない、古い対戦を消しただけ → ランクはそのまま
        rankStatus = formatRankStatus(row);
      } else {
        const remaining = await client.query(
          `SELECT result, my_perf, my_great, my_good, my_bad, my_miss, is_opponent_higher
           FROM matches WHERE owner_id = $1 AND id > $2 ORDER BY id ASC`,
          [owner, row.baseline_known ? afterId : 0]
        );
        const records = remaining.rows.map((r) => ({
          result: (r.result ?? '') as string,
          flags: {
            ...deriveMatchFlags({
              perf: r.my_perf ?? 0,
              great: r.my_great ?? 0,
              good: r.my_good ?? 0,
              bad: r.my_bad ?? 0,
              miss: r.my_miss ?? 0,
            }),
            isOpponentHigher: !!r.is_opponent_higher,
          },
        }));

        const next = row.baseline_known
          ? replay(baselineFromRow(row), records)
          : revertLegacy(stateFromRow(row), deletedResult, records.length);

        const updated = await client.query(
          `UPDATE rank_status
           SET rank_name = $1, class_index = $2, grains = $3,
               placement_matches_played = $4, is_placement_completed = $5, bonus = $6,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $7
           RETURNING *`,
          [next.rankName, next.classIndex, next.grains, next.placementMatchesPlayed, next.isPlacementCompleted, next.bonus, row.id]
        );
        rankStatus = formatRankStatus(updated.rows[0]);
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, rankStatus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('レコード削除エラー:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}
