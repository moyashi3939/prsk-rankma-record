import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Pool } from 'pg';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: '画像ファイルが見つかりません。' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64Image}`;

    // 🤖 AIには各判定の数値と難易度を正確に読ませる
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `あなたはプロセカ（プロジェクトセカイ）のランクマッチリザルト画面の解析AIです。
画像から以下の情報を正確に読み取り、必ずJSON形式のみで出力してください。
マークダウンのコードブロック(\`\`\`jsonなど)は使わず、純粋なJSON文字列のみを返してください。

JSON構造:
{
  "difficulty": "MASTER または EXPERT または APPEND",
  "myPerfect": 数値,
  "myGreat": 数値,
  "myGood": 数値,
  "myBad": 数値,
  "myMiss": 数値,
  "oppGreat": 数値,
  "oppGood": 数値,
  "oppBad": 数値,
  "oppMiss": 数値,
  "isOpponentHigher": boolean
}`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'このリザルト画面の難易度および自分側の全判定数（Perfect, Great, Good, Bad, Miss）と相手側の判定数を読み取ってください。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 400,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('AIからの解析結果が空です。');
    }

    const parsedData = JSON.parse(content.trim());

    // ➕ 読み取った各判定の数値を足し合わせて「総ノーツ数」を算出
    const calculatedTotalNotes = 
      (Number(parsedData.myPerfect) || 0) +
      (Number(parsedData.myGreat) || 0) +
      (Number(parsedData.myGood) || 0) +
      (Number(parsedData.myBad) || 0) +
      (Number(parsedData.myMiss) || 0);

    console.log('--- [OCR] 計算された総ノーツ数 ---', calculatedTotalNotes);
    console.log('--- [OCR] 難易度 ---', parsedData.difficulty);

    // 🔍 admin/songs 等で登録されているDBから、総ノーツ数と難易度で楽曲を検索
    // ※ 実際のテーブル名やカラム名（例: songs, song_name, total_notes, difficulty）に合わせて調整してください
    const dbResult = await pool.query(
      `SELECT song_name, level FROM songs WHERE total_notes = $1 AND difficulty = $2 LIMIT 1`,
      [calculatedTotalNotes, parsedData.difficulty]
    );

    console.log('--- [DB] 検索結果 ---', dbResult.rows);

    let resolvedSongName = '';
    let resolvedLevel = '';

    if (dbResult.rows.length > 0) {
      resolvedSongName = dbResult.rows[0].song_name;
      resolvedLevel = dbResult.rows[0].level;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...parsedData,
        totalNotes: calculatedTotalNotes,
        songName: resolvedSongName,
        level: resolvedLevel,
      },
    });
  } catch (error: any) {
    console.error('OCR解析＆DB逆引きエラー:', error);
    return NextResponse.json(
      { success: false, error: error.message || '内部サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}