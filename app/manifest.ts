// app/manifest.ts
// スマホの「ホーム画面に追加」で、アプリのように開けるようにするための設定（PWA）
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ランクマレコード',
    short_name: 'ランクマ',
    description: 'ランクマッチの対戦記録・ランク・分析をつけるツール',
    start_url: '/',
    display: 'standalone',
    background_color: '#080910',
    theme_color: '#080910',
    lang: 'ja',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
