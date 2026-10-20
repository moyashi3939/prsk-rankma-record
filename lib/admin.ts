// lib/admin.ts
import { NextResponse } from 'next/server';
import { getSessionEmail } from '@/lib/session';

// 管理者のメールアドレス（.env.local の ADMIN_EMAILS にカンマ区切りで設定）
// 例: ADMIN_EMAILS=you@gmail.com,friend@gmail.com
// 未設定・空のときは、誰も管理者になれない（安全側に倒す）
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && getAdminEmails().includes(email.toLowerCase());
}

// 管理者API用のガード。管理者でなければエラーレスポンスを返す（管理者なら null）
//   const denied = await requireAdmin();
//   if (denied) return denied;
export async function requireAdmin(): Promise<NextResponse | null> {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
