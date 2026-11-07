// app/api/admin/stats/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { ensureAppSettings, ensureOwnerColumns, ensureShortcutTables, ensureSongJackets } from '@/lib/schema';

// メールアドレスを、一部だけ伏せて表示する（例: ab***@gmail.com）
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email.slice(0, 2) + '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

// 管理者画面用：アカウント数・利用状況・サーバーの状態
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    await ensureAppSettings();
    await ensureOwnerColumns();
    await ensureShortcutTables();
    await ensureSongJackets();

    const count = async (sql: string): Promise<number> => (await query(sql)).rows[0]?.n ?? 0;

    const [accounts, guests, matches, active24h, active7d, guestActive7d, tokens, pending, songs, jacketSongs] = await Promise.all([
      count(`SELECT COUNT(*)::int AS n FROM app_settings WHERE user_email IS NOT NULL`),
      count(`SELECT COUNT(DISTINCT owner_id)::int AS n FROM rank_status WHERE owner_id LIKE 'guest:%'`),
      count(`SELECT COUNT(*)::int AS n FROM matches`),
      count(`SELECT COUNT(*)::int AS n FROM rank_status WHERE owner_id NOT LIKE 'guest:%' AND updated_at > NOW() - INTERVAL '24 hours'`),
      count(`SELECT COUNT(*)::int AS n FROM rank_status WHERE owner_id NOT LIKE 'guest:%' AND updated_at > NOW() - INTERVAL '7 days'`),
      count(`SELECT COUNT(*)::int AS n FROM rank_status WHERE owner_id LIKE 'guest:%' AND updated_at > NOW() - INTERVAL '7 days'`),
      count(`SELECT COUNT(*)::int AS n FROM api_tokens`),
      count(`SELECT COUNT(*)::int AS n FROM shortcut_uploads`),
      count(`SELECT COUNT(DISTINCT song_name)::int AS n FROM songs`),
      count(`SELECT COUNT(DISTINCT song_name)::int AS n FROM song_jackets`),
    ]);

    // 最近動いたアカウント（メールアドレスは、一部を伏せる）
    const recent = await query(
      `SELECT r.owner_id, r.updated_at, (SELECT COUNT(*)::int FROM matches m WHERE m.owner_id = r.owner_id) AS matches
       FROM rank_status r
       WHERE r.owner_id IS NOT NULL AND r.owner_id NOT LIKE 'guest:%'
       ORDER BY r.updated_at DESC
       LIMIT 10`
    );

    const mem = process.memoryUsage();
    return NextResponse.json({
      accounts,
      guests,
      matches,
      active24h,
      active7d,
      guestActive7d,
      tokens,
      pending,
      songs,
      jacketSongs,
      recent: recent.rows.map((r) => ({ account: maskEmail(String(r.owner_id)), updatedAt: r.updated_at, matches: r.matches })),
      server: {
        uptimeSec: Math.round(process.uptime()),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        node: process.version,
      },
    });
  } catch (error) {
    console.error('統計の取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
