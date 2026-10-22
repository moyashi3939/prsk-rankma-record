# ランクマレコード

プロセカのランクマッチの対戦記録・ランク（クラス・粒）・分析をつける、個人用のWebアプリです。
（非公式のファンツールです）

## できること

- リザルト画面のスクショから、判定の数・曲・難易度を自動で読み取って記録（**画像はブラウザの中で処理。外部サービスは使わない**）
- ランク・クラス・粒の管理（判定マッチから／途中参加でランクを指定して開始）
- 対戦履歴・分析、ライバル（フォロー）の表示
- iOSショートカットからスクショを送る（確信が持てるものは自動登録、自信が低いものは確認待ち）
- 管理者画面（楽曲・シーズン・ジャケットの登録）
- データはユーザーごと（Googleログイン）。未ログインのゲストは、端末ごと

## 動かし方（開発）

```bash
npm install
npm install tesseract.js @napi-rs/canvas   # ショートカットの自動読み取りに必要（なくても動くが、全部「確認待ち」になる）
cp .env.example .env.local                   # 無ければ、下の環境変数を .env.local に書く
npm run dev                                  # http://localhost:3000
```

### 環境変数（`.env.local`）

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | PostgreSQL の接続先 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Googleログイン |
| `NEXT_PUBLIC_BASE_URL` | このアプリのURL（例: `http://localhost:3000`）。ログインの戻り先に使う |
| `SESSION_SECRET` | ログイン情報の署名用。16文字以上のランダムな文字列 |
| `ADMIN_EMAILS` | 管理者にするGmail（カンマ区切り） |

テーブルは、APIが最初に動くときに自動で作られます（手でSQLを流す必要はありません）。

## フォルダの見かた

```
app/                  画面と API（Next.js App Router）
  page.tsx            ホーム（ランク・戦績・記録）
  history/ analytics/ 履歴・分析
  settings/           設定（ログイン・トークン発行・フォロー・データ初期化）
  admin/              管理者画面（songs / jackets / home）
  updates/ terms/ credits/   アップデート情報・利用規約・スペシャルサンクス
  api/                API（auth, matches, rank, songs, shortcut, admin ...）
components/           RecordModal（記録画面）・ShortcutSettings・ToastHost など
lib/
  ocrCore.ts          画像の読み取りの本体（ブラウザ・サーバー共通）
  resultOcr.ts        ブラウザ用の読み取り（Tesseract.js を CDN から読み込む）
  serverOcr.ts        サーバー用の読み取り（ショートカットの自動登録）
  songMatch.ts        ジャケット・ノーツ数・枠の色から、曲と難易度を決める
  matchCalc.ts        スコア・勝敗の計算
  rank.ts             ランク・粒の計算ルール（対戦の削除時は、最初から計算し直す）
  recordMatch.ts      対戦の保存＋ランク更新（サーバー、1つのトランザクション）
  session.ts / admin.ts / apiToken.ts   ログイン・管理者・ショートカット用トークン
  schema.ts           テーブルの作成・カラムの追加（自動）
  siteContent.ts      アップデート情報・利用規約・スペシャルサンクスの文章（ここを書き換える）
scripts/backup-db.sh  DBのバックアップ
DEPLOY.md             公開の手順（ドメインなしでの公開・バックアップ）
```

## 文章を書き換えたいとき

アップデート情報・利用規約・スペシャルサンクスは、`lib/siteContent.ts` を書き換えて保存するだけです。

## 公開するとき

`DEPLOY.md` を見てください。
