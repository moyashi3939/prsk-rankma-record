import { Pool } from 'pg';

// グローバル変数として保持し、ビルド時の不要な接続を防ぐ
let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  const client = await getPool().connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

// トランザクション用に、1本の接続を専有して使う場合はこちら（使い終わったら release() すること）
export async function getClient() {
  return getPool().connect();
}
