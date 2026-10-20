// lib/csv.ts
// CSV（RFC 4180）を読み取る。
// ・"..." で囲まれた欄の中のカンマ・改行はそのまま欄の内容として扱う（例: "Hello,WORLD!"）
// ・欄の中の "" は " 1文字として扱う
// ・先頭のBOM（Excelが付ける目印）は取り除く
// 戻り値は、行ごとの欄の配列（空行は含まない）
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let atFieldStart = true; // いま欄の先頭かどうか（"で囲み始められるのは欄の先頭だけ）

  const endField = () => {
    row.push(field);
    field = '';
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    // 完全に空の行は捨てる
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // "" は " 1文字
          i++;
        } else {
          inQuotes = false; // 閉じる
        }
      } else {
        field += ch; // 引用符の中は、カンマも改行もそのまま
      }
      continue;
    }

    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      // 改行コードの \r は無視する（\r\n の \n 側で行を区切る）
    } else {
      field += ch;
      atFieldStart = false;
    }
  }

  // 最後の行に改行がないとき
  if (field !== '' || row.length > 0) endRow();

  return rows;
}
