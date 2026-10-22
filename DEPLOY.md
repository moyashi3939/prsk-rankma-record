# 公開の手順（ドメインを取得するまでの間）

このアプリは、**自分のサーバー（VPS）で動かして、無料のサブドメイン + HTTPS で公開**する形がおすすめです。
（DBがすでに VPS 上にあり、サーバーでの画像読み取り＝ショートカットの自動登録も、長く動き続けるサーバーのほうが向いているため）

> Google ログインは、**IPアドレスのままでは使えません**（リダイレクトURIに、IPアドレスは登録できない）。
> そのため、ドメインを買わなくても使える「無料のサブドメイン」を使います。

## 選べる方法

| 方法 | 費用 | URL | 向いている場面 |
|---|---|---|---|
| **A. VPS + DuckDNS + Caddy**（おすすめ） | 無料 | `https://好きな名前.duckdns.org` | しばらくの間、常時公開したい |
| B. VPS + sslip.io + Caddy | 無料 | `https://162-43-77-203.sslip.io` | DuckDNS の登録が面倒なとき。※Googleが受け付けないことがある |
| C. PCから ngrok / Cloudflare Tunnel | 無料 | `https://〇〇.ngrok-free.app` など | 数日だけ試したい。PCの電源が入っている間だけ公開される |

以下は **A** の手順です。

## 0. 公開の前にやること（重要）

- `.env.local` の **`SESSION_SECRET`**（16文字以上のランダムな文字列）と **`ADMIN_EMAILS`** を、本番用に設定する
- **OpenAI のAPIキーは、無効にして、`.env.local` から消す**（もう使っていません）
- **DBのポート（5432）を、外からつなげないようにする**（下の「6. DBを閉じる」）
- `.env.local` は、**Git や zip に入れて渡さない**

## 1. DuckDNS で、無料のサブドメインを作る

1. https://www.duckdns.org にログイン（Google等のアカウントでOK）
2. サブドメイン名（例: `rankma-record`）を作り、**current ip** に VPS のIPアドレス（`162.43.77.203`）を入れて「update ip」
3. これで `rankma-record.duckdns.org` が、VPS を指します

## 2. VPS にアプリを置く

```bash
# Node.js（20以上）が入っていなければ入れる。例: nvm
# プロジェクトをVPSに置く（git clone / scp など）。node_modules と .next は持っていかない
cd ~/prsk-rankma-record

npm install
npm install tesseract.js @napi-rs/canvas   # ショートカットの自動読み取りに必要
```

`.env.local`（VPS上で作る）:

```
# DBはVPSの中なので localhost にする（パスワード等は自分のもの）
DATABASE_URL=postgresql://ユーザー名:パスワード@localhost:5432/discord_bot

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# 公開するURL
NEXT_PUBLIC_BASE_URL=https://rankma-record.duckdns.org

SESSION_SECRET=ここにランダムな文字列（node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"）
ADMIN_EMAILS=あなたのアドレス@gmail.com
```

ビルドして起動（PM2 で、落ちても自動で再起動・OS再起動後も起動するように）:

```bash
npm run build
npm install -g pm2
pm2 start npm --name rankma -- start      # 既定でポート 3000
pm2 save
pm2 startup                               # 表示されたコマンドをそのまま実行
```

## 3. Caddy で HTTPS にする（証明書は自動で取得・更新されます）

```bash
# Caddy を入れる（Ubuntu/Debian の例）
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
rankma-record.duckdns.org {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

- ファイアウォールで **80番と443番**を開けておく（証明書の取得に80番が必要）
- 3000番は、外に開けなくてよい（Caddy が中でつなぐ）
- 昔の「クラウド同期」機能（`cloud_backups` テーブル）は、なくなりました。テーブルが残っていても害はありません（消したいときは `DROP TABLE cloud_backups;`）

## 4. Google Cloud Console の設定

「APIとサービス」→「認証情報」→ OAuth クライアントを開いて:

- **承認済みのリダイレクトURI** に、次を追加:
  `https://rankma-record.duckdns.org/api/auth/google/callback`
- （localhost の分は、残しておいて大丈夫）
- OAuth 同意画面が「テスト」の状態なら、**テストユーザー**に、使う人のGoogleアカウントを追加する
  （公開状態にするには、Googleの確認が必要になることがあります）

## 5. 動作確認

1. `https://rankma-record.duckdns.org` が開く
2. 設定画面から、Googleログインできる
3. 管理者のアカウントで、`/admin/home` が開ける
4. iPhone のショートカットの送信先URLを、`https://rankma-record.duckdns.org/api/shortcut/upload` に変える

## 6. DBを閉じる（セキュリティ）

アプリとDBが同じVPSなら、外部から5432番へつなげる必要はありません。

- ファイアウォールで **5432番を閉じる**（`ufw deny 5432` など）
- PostgreSQL の `postgresql.conf` で `listen_addresses = 'localhost'`
- 他のサービス（Discord Bot など）がこのDBを外から使っている場合は、先にそちらの設定を確認する

## 7. バックアップ（必須）

DBが壊れたり、操作を間違えたりしたときのために、毎日バックアップを取ります。
`scripts/backup-db.sh` が、このアプリのテーブルだけを `pg_dump` して、14日ぶん残します（他のサービスのテーブルは含みません）。

```bash
# 動作確認（VPS で）
sudo apt install -y postgresql-client      # pg_dump が無ければ
cd ~/prsk-rankma-record
set -a; . ./.env.local; set +a
./scripts/backup-db.sh
```

毎日の自動実行（`crontab -e` に追記。毎日 午前4時）:

```
0 4 * * * cd ~/prsk-rankma-record && set -a && . ./.env.local && set +a && ./scripts/backup-db.sh >> ~/rankma-backups/backup.log 2>&1
```

- 保存先は `~/rankma-backups`（`BACKUP_DIR` で変えられます）。VPS の中だけだと、VPS ごと壊れたときに失われるので、
  ときどき、手元のPCにもコピーしてください（例: `scp ユーザー@VPS:~/rankma-backups/最新のファイル .`）
- **復元のしかた**: `gunzip -c バックアップ.sql.gz | psql "$DATABASE_URL"`（同じ名前のテーブルがあると、エラーになります。復元の前に、中身を確認してください）

## 8. アップデートのしかた

```bash
git pull   # または、新しいファイルを上書き
npm install
npm run build
pm2 restart rankma
```

## 9. ドメインを取得したら

1. ドメインの DNS で、`A` レコードを VPS のIPアドレスに向ける
2. `Caddyfile` の `rankma-record.duckdns.org` を、新しいドメインに書き換えて `sudo systemctl reload caddy`
3. `.env.local` の `NEXT_PUBLIC_BASE_URL` を新しいURLに変えて、`pm2 restart rankma`
4. Google Cloud Console の、**リダイレクトURIを新しいURLに追加**
5. iPhone のショートカットの送信先URLを変える（トークンは、そのまま使えます）
6. ログイン用のCookieは、ドメインごとに別なので、**みんな、ログインし直し**になります

## 注意

- サーバーでの画像読み取り（ショートカット）は、メモリを使います（1つあたり、200〜400MB程度）。VPS のメモリが少ないときは、`pm2 monit` で確認してください
- 初回の読み取りのときに、言語データ（eng）をダウンロードするため、VPS がインターネットにつながっている必要があります
- `.tesseract-cache` フォルダは、言語データの保存先です（Git には入れません）
