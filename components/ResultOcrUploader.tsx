'use client';

import { useState } from 'react';

interface ResultOcrUploaderProps {
  onResultParsed?: (data: any) => void;
}

export default function ResultOcrUploader({ onResultParsed }: ResultOcrUploaderProps) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<any | null>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setOcrResult(null);

    const fullImageUrl = URL.createObjectURL(file);
    setPreviewUrl(fullImageUrl);

    const img = new Image();
    img.src = fullImageUrl;

    img.onload = async () => {
      // Canvasで中央のリザルトエリア（PERFECT〜MISSの表）だけを自動で切り抜く
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setLoading(false);
        return;
      }

      // 端末のアスペクト比に影響されないよう中央の約45%〜75%の範囲（判定表）を抽出
      const cropX = img.width * 0.28;
      const cropY = img.height * 0.25;
      const cropWidth = img.width * 0.44;
      const cropHeight = img.height * 0.50;

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      setCroppedPreview(croppedDataUrl);

      // 切り抜いた画像を Blob に変換して API に送信
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('image', blob, 'result_cropped.png');

        try {
          const res = await fetch('/api/ocr', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (data.success) {
            setOcrResult(data.parsed);
            if (onResultParsed) {
              onResultParsed(data.parsed);
            }
          } else {
            alert('読み取りに失敗しました。画像を確認してください。');
          }
        } catch (err) {
          console.error('OCRエラー:', err);
          alert('通信エラーが発生しました。');
        } finally {
          setLoading(false);
        }
      }, 'image/png');
    };
  };

  return (
    <div className="glass-panel p-6 rounded-3xl border border-pink-500/30 bg-pink-950/10 space-y-4">
      <h3 className="text-base font-black text-pink-400 flex items-center gap-2">
        <span>📸 リザルト画像から自動読み取り</span>
      </h3>

      <p className="text-xs text-slate-400">
        プロセカの対戦リザルト画面のスクショを選択すると、中央の数値（判定数・総ノーツ数）を解析して自動入力します。
      </p>

      <input
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        disabled={loading}
        className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-pink-600 file:text-white hover:file:bg-pink-500 cursor-pointer disabled:opacity-50"
      />

      {loading && (
        <div className="text-xs text-pink-300 animate-pulse font-bold flex items-center gap-2">
          <span>🔍 中央リザルト表を切り抜き＆解析中...</span>
        </div>
      )}

      {/* 切り抜きプレビューと抽出結果の表示 */}
      {ocrResult && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {croppedPreview && (
            <div className="bg-slate-950 p-3 rounded-2xl border border-white/10 space-y-2">
              <span className="text-[10px] text-slate-400 block font-mono">✂️ 自動抽出された解析エリア:</span>
              <img src={croppedPreview} alt="解析部分" className="w-full rounded-xl border border-white/5" />
            </div>
          )}

          <div className="bg-slate-950 p-4 rounded-2xl border border-white/10 space-y-3 text-xs">
            <span className="text-[10px] text-pink-400 font-bold block font-mono">✨ 解析成功データ</span>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">総ノーツ数:</span>
                <span className="font-mono font-bold text-cyan-300">{ocrResult.my.totalNotes} ノーツ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">クリア状態:</span>
                <span className="font-bold text-pink-400">
                  {ocrResult.my.isAP ? 'ALL PERFECT 🎉' : ocrResult.my.isFC ? 'FULL COMBO ✨' : 'CLEAR'}
                </span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block">【自分】</span>
                <div>PERFECT: {ocrResult.my.perfect}</div>
                <div>GREAT: {ocrResult.my.great}</div>
                <div>GOOD: {ocrResult.my.good}</div>
                <div>BAD: {ocrResult.my.bad}</div>
                <div>MISS: {ocrResult.my.miss}</div>
              </div>
              <div>
                <span className="text-slate-500 block">【相手】</span>
                <div>PERFECT: {ocrResult.enemy.perfect}</div>
                <div>GREAT: {ocrResult.enemy.great}</div>
                <div>GOOD: {ocrResult.enemy.good}</div>
                <div>BAD: {ocrResult.enemy.bad}</div>
                <div>MISS: {ocrResult.enemy.miss}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}