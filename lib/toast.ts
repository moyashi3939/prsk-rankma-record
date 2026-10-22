// lib/toast.ts
// 画面の上に、ちょっとしたお知らせ（トースト）を出す。alert() の代わりに使う（画面が止まらない）。
//   toast('保存しました', 'success');
//   toast('失敗しました', 'error');
// ※ ブラウザでだけ動く。画面側の表示は components/ToastHost.tsx（layout.tsx に置いてある）。

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastDetail {
  message: string;
  kind: ToastKind;
  ms: number; // 何ミリ秒で消えるか
}

export const TOAST_EVENT = 'app-toast';
const FLASH_KEY = 'app-flash-toast';

export function toast(message: string, kind: ToastKind = 'info', ms = 4500) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, kind, ms } }));
}

// ページを再読み込みしたあとに、表示するお知らせを予約する
export function toastAfterReload(message: string, kind: ToastKind = 'info', ms = 5000) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, kind, ms }));
  } catch {
    // 保存できないときは、あきらめる
  }
}

// 予約されたお知らせがあれば取り出す（取り出したら消える）
export function takeFlashToast(): ToastDetail | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_KEY);
    return JSON.parse(raw) as ToastDetail;
  } catch {
    return null;
  }
}
