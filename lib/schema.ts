// lib/schema.ts
import { query } from '@/lib/db';

// app_settings を「既に古い形で存在していても」必要なカラム・制約が揃うように整える。
// CREATE TABLE IF NOT EXISTS は既存テーブルにカラムを足してくれないため、ALTER も併用する。
// プロセス内で1回だけ実行する（毎リクエストの DDL をやめる）。
let appSettingsEnsured: Promise<void> | null = null;

export function ensureAppSettings(): Promise<void> {
  if (!appSettingsEnsured) {
    appSettingsEnsured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id SERIAL PRIMARY KEY,
          user_name VARCHAR(100) DEFAULT 'プロセカプレイヤー',
          custom_id VARCHAR(50) DEFAULT 'player_default',
          user_id VARCHAR(50) DEFAULT '1234567890',
          user_email VARCHAR(255),
          current_season VARCHAR(50) DEFAULT 'Season 1',
          season_end_days INT DEFAULT 80,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 古いテーブルに足りないカラムを補う
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS user_name VARCHAR(100) DEFAULT 'プロセカプレイヤー'`);
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS custom_id VARCHAR(50) DEFAULT 'player_default'`);
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS user_id VARCHAR(50) DEFAULT '1234567890'`);
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS user_email VARCHAR(255)`);
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS current_season VARCHAR(50) DEFAULT 'Season 1'`);
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS season_end_days INT DEFAULT 80`);
      await query(`ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

      // ON CONFLICT (user_email) に必要な一意制約（NULL は重複OK）
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS app_settings_user_email_uidx ON app_settings (user_email)`);
    })().catch((err) => {
      appSettingsEnsured = null; // 失敗したら次のリクエストでやり直す
      throw err;
    });
  }
  return appSettingsEnsured;
}

// matches / rank_status を「ユーザー別」にするための owner_id カラムを用意する。
// owner_id は、ログイン中ならメールアドレス、ゲストなら "guest:<ランダムID>"。
let ownerColumnsEnsured: Promise<void> | null = null;

export function ensureOwnerColumns(): Promise<void> {
  if (!ownerColumnsEnsured) {
    ownerColumnsEnsured = (async () => {
      await query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255)`);
      await query(`CREATE INDEX IF NOT EXISTS matches_owner_idx ON matches (owner_id)`);

      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255)`);
      // 1ユーザーにつきランク状態は1行（NULL の旧データは重複してもOK）
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS rank_status_owner_uidx ON rank_status (owner_id)`);

      // 「最初の状態」を覚えておくためのカラム（対戦履歴を削除したとき、最初から計算し直すのに使う）
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS setup_done BOOLEAN DEFAULT FALSE`); // 最初の状態を選び終わったか
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS baseline_known BOOLEAN DEFAULT FALSE`); // 最初の状態が分かっているか
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS start_rank_name TEXT`); // NULL = 判定マッチから開始
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS start_class_index INT DEFAULT 0`);
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS start_grains INT DEFAULT 0`);
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS placement_rank_name TEXT`); // 判定マッチのあとに選んだランク
      await query(`ALTER TABLE rank_status ADD COLUMN IF NOT EXISTS placement_class_index INT`);
    })().catch((err) => {
      ownerColumnsEnsured = null;
      throw err;
    });
  }
  return ownerColumnsEnsured;
}

// ログイン時に、既存データをそのアカウントに引き継ぐ。
// 1. すでにそのアカウントのデータがあれば何もしない
// 2. ゲストとして使っていたデータがあれば、それを引き継ぐ
// 3. どちらもなければ、owner_id が空の旧データ（ユーザー別にする前のデータ）を引き継ぐ
export async function adoptDataOnLogin(email: string, guestId?: string | null): Promise<void> {
  await ensureOwnerColumns();

  const existing = await query(
    `SELECT 1 FROM rank_status WHERE owner_id = $1
     UNION ALL
     SELECT 1 FROM matches WHERE owner_id = $1
     LIMIT 1`,
    [email]
  );
  if (existing.rows.length > 0) return;

  if (guestId) {
    const guestOwner = `guest:${guestId}`;
    const m = await query('UPDATE matches SET owner_id = $1 WHERE owner_id = $2', [email, guestOwner]);
    const r = await query('UPDATE rank_status SET owner_id = $1 WHERE owner_id = $2', [email, guestOwner]);
    if ((m.rowCount ?? 0) > 0 || (r.rowCount ?? 0) > 0) return;
  }

  // 旧データ：rank_status は最新の1行だけ残す（owner_id の一意制約のため）
  await query(
    `DELETE FROM rank_status
     WHERE owner_id IS NULL
       AND id <> (SELECT MAX(id) FROM rank_status WHERE owner_id IS NULL)`
  );
  await query('UPDATE matches SET owner_id = $1 WHERE owner_id IS NULL', [email]);
  await query('UPDATE rank_status SET owner_id = $1 WHERE owner_id IS NULL', [email]);
}

// 曲ごとのジャケット（モザイクのhex と、確認用サムネイル）を保存するテーブル。
// ジャケットは同じ曲なら難易度が違っても同じなので、曲名(song_name)ごとに1行。
let songJacketsEnsured: Promise<void> | null = null;

export function ensureSongJackets(): Promise<void> {
  if (!songJacketsEnsured) {
    songJacketsEnsured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS song_jackets (
          song_name TEXT PRIMARY KEY,
          hex TEXT NOT NULL,
          thumb TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // 確認用のサムネイル（あとから追加したカラム）
      await query(`ALTER TABLE song_jackets ADD COLUMN IF NOT EXISTS thumb TEXT`);
    })().catch((err) => {
      songJacketsEnsured = null;
      throw err;
    });
  }
  return songJacketsEnsured;
}

// 新しく作るランク状態の初期シーズン（開催中のシーズンがあればそれ、なければ Season 1）
export async function getDefaultSeason(): Promise<string> {
  try {
    const res = await query('SELECT season_name FROM seasons WHERE is_current = TRUE LIMIT 1');
    return res.rows[0]?.season_name || 'Season 1';
  } catch {
    return 'Season 1';
  }
}

// iOSショートカット連携用のテーブル
//  api_tokens        … アカウントごとのトークン（ハッシュだけを保存。1アカウントにつき1つ）
//  shortcut_uploads  … ショートカットから届いた画像の受信箱（アプリで取り込んで保存したら消える）
let shortcutTablesEnsured: Promise<void> | null = null;

export function ensureShortcutTables(): Promise<void> {
  if (!shortcutTablesEnsured) {
    shortcutTablesEnsured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id SERIAL PRIMARY KEY,
          owner_id VARCHAR(255) NOT NULL UNIQUE,
          token_hash VARCHAR(64) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMP
        );
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS shortcut_uploads (
          id SERIAL PRIMARY KEY,
          owner_id VARCHAR(255) NOT NULL,
          mime VARCHAR(50) NOT NULL,
          image BYTEA NOT NULL,
          size INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await query(`CREATE INDEX IF NOT EXISTS shortcut_uploads_owner_idx ON shortcut_uploads (owner_id, id)`);
      // 同じ画像を2回送ってしまったときに、二重に登録しないためのハッシュ
      await query(`ALTER TABLE shortcut_uploads ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64)`);
      // 受信箱（保留）に入れた理由
      await query(`ALTER TABLE shortcut_uploads ADD COLUMN IF NOT EXISTS reason TEXT`);
      // 自動で登録した・取り込み済みの画像のハッシュ（30日で消える）
      await query(`
        CREATE TABLE IF NOT EXISTS shortcut_processed (
          owner_id VARCHAR(255) NOT NULL,
          sha256 VARCHAR(64) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (owner_id, sha256)
        );
      `);
    })().catch((err) => {
      shortcutTablesEnsured = null;
      throw err;
    });
  }
  return shortcutTablesEnsured;
}

// 難易度ごとの「ジャケットのまわりの色」を、記録した画像から覚えておくテーブル（全員で共通）
let difficultyColorsEnsured: Promise<void> | null = null;

export function ensureDifficultyColors(): Promise<void> {
  if (!difficultyColorsEnsured) {
    difficultyColorsEnsured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS difficulty_colors (
          difficulty VARCHAR(20) PRIMARY KEY,
          r REAL NOT NULL,
          g REAL NOT NULL,
          b REAL NOT NULL,
          n INT NOT NULL DEFAULT 1,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    })().catch((err) => {
      difficultyColorsEnsured = null;
      throw err;
    });
  }
  return difficultyColorsEnsured;
}
