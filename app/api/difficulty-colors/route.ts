// app/api/difficulty-colors/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureDifficultyColors } from '@/lib/schema';
import { getSessionEmail } from '@/lib/session';

const DIFFICULTIES = ['EXPERT', 'MASTER', 'APPEND'];

// 覚えている、難易度ごとの「ジャケットのまわりの色」（記録画面で、難易度の判別に使う）
export async function GET() {
  try {
    await ensureDifficultyColors();
    const res = await query('SELECT difficulty, r, g, b, n FROM difficulty_colors');
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('難易度の色の取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch colors' }, { status: 500 });
  }
}

// 記録した画像のジャケットのまわりの色を、その難易度の色として覚える（平均を取っていく）
// 悪用を防ぐため、ログイン中のユーザーだけが送れる
export async function POST(request: Request) {
  try {
    const email = await getSessionEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { difficulty, r, g, b } = await request.json();
    const inRange = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 255;
    if (typeof difficulty !== 'string' || !DIFFICULTIES.includes(difficulty) || !inRange(r) || !inRange(g) || !inRange(b)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    await ensureDifficultyColors();
    // 直近100件ぶんの平均になるように、重みの上限を決めておく
    await query(
      `INSERT INTO difficulty_colors (difficulty, r, g, b, n) VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (difficulty) DO UPDATE SET
         r = (difficulty_colors.r * LEAST(difficulty_colors.n, 99) + $2) / (LEAST(difficulty_colors.n, 99) + 1),
         g = (difficulty_colors.g * LEAST(difficulty_colors.n, 99) + $3) / (LEAST(difficulty_colors.n, 99) + 1),
         b = (difficulty_colors.b * LEAST(difficulty_colors.n, 99) + $4) / (LEAST(difficulty_colors.n, 99) + 1),
         n = difficulty_colors.n + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [difficulty, r, g, b]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('難易度の色の保存エラー:', error);
    return NextResponse.json({ error: 'Failed to save color' }, { status: 500 });
  }
}
