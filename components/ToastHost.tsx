'use client';

import { useEffect, useState } from 'react';
import { TOAST_EVENT, takeFlashToast, type ToastDetail } from '@/lib/toast';

interface ToastItem extends ToastDetail {
  id: number;
}

const STYLES: Record<ToastDetail['kind'], string> = {
  success: 'border-emerald-500/50 bg-emerald-950/90 text-emerald-100',
  error: 'border-red-500/50 bg-red-950/90 text-red-100',
  info: 'border-cyan-500/50 bg-slate-900/95 text-slate-100',
};

const ICONS: Record<ToastDetail['kind'], string> = { success: '✅', error: '⚠️', info: 'ℹ️' };

// 画面の上に出る、お知らせの表示場所（layout.tsx に1つだけ置く）
export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 1;

    const add = (detail: ToastDetail) => {
      const id = nextId++;
      setItems((prev) => [...prev.slice(-3), { ...detail, id }]); // 最大4件まで
      window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), detail.ms);
    };

    const onToast = (e: Event) => add((e as CustomEvent<ToastDetail>).detail);
    window.addEventListener(TOAST_EVENT, onToast);

    // 再読み込みの前に予約されたお知らせがあれば、出す
    const flash = takeFlashToast();
    if (flash) add(flash);

    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,28rem)] space-y-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          className={`pointer-events-auto w-full text-left border rounded-2xl px-4 py-3 text-xs font-bold shadow-2xl backdrop-blur-xl whitespace-pre-line ${STYLES[t.kind]}`}
        >
          <span className="mr-2">{ICONS[t.kind]}</span>
          {t.message}
        </button>
      ))}
    </div>
  );
}
