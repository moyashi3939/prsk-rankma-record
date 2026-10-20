// app/admin/jackets/page.tsx
import AdminJacketsClient from './AdminJacketsClient';

// 管理者画面は、入口チェック（app/admin/layout.tsx）が終わるまで中身を表示しない作りのため、
// Next.js の「instant navigation」の検証から外す（開発中に出る Insight を消すための設定）。
// ※この設定は Server Component でしか使えないため、画面の本体は AdminJacketsClient.tsx（'use client'）に分けてある。
export const instant = false;

export default function Page() {
  return <AdminJacketsClient />;
}
