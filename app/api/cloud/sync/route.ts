import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// クラウドからデータを取得（読み込み）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const saveKey = searchParams.get('key');

    if (!saveKey) {
      return NextResponse.json({ error: 'Save key required' }, { status: 400 });
    }

    const result = await query('SELECT backup_data FROM cloud_backups WHERE user_email = $1', [saveKey]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'バックアップデータが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0].backup_data });
  } catch (error) {
    console.error('クラウド読み込みエラー:', error);
    return NextResponse.json({ error: 'Failed to load cloud data' }, { status: 500 });
  }
}

// クラウドへデータを保存
export async function POST(request: Request) {
  try {
    const { saveKey, backupData } = await request.json();

    if (!saveKey || !backupData) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    await query(
      `INSERT INTO cloud_backups (user_email, backup_data, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_email) 
       DO UPDATE SET backup_data = EXCLUDED.backup_data, updated_at = CURRENT_TIMESTAMP;`,
      [saveKey, JSON.stringify(backupData)]
    );

    return NextResponse.json({ success: true, message: 'クラウドにデータを保存しました' });
  } catch (error) {
    console.error('クラウド保存エラー:', error);
    return NextResponse.json({ error: 'Failed to save cloud data' }, { status: 500 });
  }
}