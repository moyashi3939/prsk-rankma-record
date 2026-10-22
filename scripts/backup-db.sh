#!/usr/bin/env bash
# scripts/backup-db.sh
# このアプリのテーブルだけを、DBからバックアップする（pg_dump）。古いバックアップは自動で消す。
#
# 使い方:
#   DATABASE_URL=postgresql://ユーザー:パスワード@localhost:5432/DB名 ./scripts/backup-db.sh
#   （.env.local を読み込むなら: set -a; . ./.env.local; set +a; ./scripts/backup-db.sh）
#
# 環境変数（省略できます）:
#   BACKUP_DIR  … 保存先（既定: ~/rankma-backups）
#   KEEP_DAYS   … 何日ぶん残すか（既定: 14）
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL を設定してください}"

BACKUP_DIR="${BACKUP_DIR:-$HOME/rankma-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

FILE="$BACKUP_DIR/rankma-$(date +%Y%m%d-%H%M%S).sql.gz"

# 他のサービス（Discord Bot など）のテーブルは含めず、このアプリのテーブルだけを保存する。
# （shortcut_uploads は、画像が入っていて大きいので、含めない）
TABLES=(app_settings matches rank_status songs seasons song_jackets difficulty_colors friendships api_tokens)
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "$t")
done

pg_dump --no-owner --no-privileges "${TABLE_ARGS[@]}" "$DATABASE_URL" | gzip > "$FILE"

# 古いバックアップを消す
find "$BACKUP_DIR" -name 'rankma-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "バックアップ完了: $FILE ($(du -h "$FILE" | cut -f1))"
