'use client';

// app/admin/layout.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// 管理者以外が /admin/* を開いたらホームに戻す。
// 判定は /api/admin/me で行い、確認が取れるまで中身は表示しない。
// ※ 本当の防御は各管理者APIの requireAdmin()。ここは画面を見せないための入口チェック。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/admin/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.isAdmin) setAllowed(true);
        else router.replace('/');
      })
      .catch(() => {
        if (!cancelled) router.replace('/');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return <div className="min-h-screen bg-[#080910]" />;
  }

  return <>{children}</>;
}
