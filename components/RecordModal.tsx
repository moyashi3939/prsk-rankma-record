'use client';

import { useState, useEffect } from 'react';
import {
  analyzeResultImage,
  describeWeakest,
  findJacketMatches,
  OCR_TRUST_LOW,
  type JacketHash,
  type JacketRecord,
  type OcrResult,
} from '@/lib/resultOcr';

interface SongFromDB {
  id: number;
  song_name: string;
  difficulty: string;
  level: string;
  total_notes: number;
}

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (recordData: any) => void;
}

const initialFormState = {
  songNameInput: '',
  difficulty: 'MASTER',
  level: '31',
  isOpponentHigher: false,
  myPerfect: '',
  myGreat: '',
  myGood: '',
  myBad: '',
  myMiss: '',
  oppGreat: '',
  oppGood: '',
  oppBad: '',
  oppMiss: '',
};

export default function RecordModal({ isOpen, onClose, onSubmit }: RecordModalProps) {
  const [songs, setSongs] = useState<SongFromDB[]>([]);
  const [matchForm, setMatchForm] = useState(initialFormState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState(''); // 読み取り結果についての注意書き
  const [jackets, setJackets] = useState<JacketRecord[]>([]); // 保存済みの曲ジャケット
  const [pendingJacket, setPendingJacket] = useState<JacketHash | null>(null); // 単発モードで読み取ったジャケット
  const [candidates, setCandidates] = useState<SongFromDB[]>([]); // 単発モードの曲の候補（総ノーツ数が同じ曲）

  // 🔄 モード切り替え ('single' | 'batch')
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // 📦 一括モード用ステート
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<any[]>([]);

  const resetForm = () => {
    setMatchForm(initialFormState);
    setPreviewUrl(null);
    setOcrLoading(false);
    setOcrNote('');
    setPendingJacket(null);
    setCandidates([]);
    setBatchFiles([]);
    setBatchCurrentIndex(0);
    setBatchResults([]);
    setMode('single');
  };

  useEffect(() => {
    if (isOpen) {
      fetch('/api/songs')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setSongs(data);
        })
        .catch(() => {
          setSongs([]);
        });

      fetch('/api/songs/jackets')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setJackets(data);
        })
        .catch(() => {
          setJackets([]);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // OCR結果をフォームの値に変換する。
  // 曲は「ジャケット」で曲名を絞り、「自分の判定の合計＝総ノーツ数」で譜面（難易度）を決める
  const applyOcr = (ocr: OcrResult, base: typeof initialFormState) => {
    const m = ocr.me;
    const o = ocr.opponent;
    const str = (v: number | null, prev: string) => (v === null ? prev : String(v));

    const form = {
      ...base,
      myPerfect: str(m.perfect, base.myPerfect),
      myGreat: str(m.great, base.myGreat),
      myGood: str(m.good, base.myGood),
      myBad: str(m.bad, base.myBad),
      myMiss: str(m.miss, base.myMiss),
      oppGreat: str(o.great, base.oppGreat),
      oppGood: str(o.good, base.oppGood),
      oppBad: str(o.bad, base.oppBad),
      oppMiss: str(o.miss, base.oppMiss),
    };

    const notes: string[] = [];
    let choices: SongFromDB[] = []; // 曲を1つに決められなかったときの候補

    const mine = [m.perfect, m.great, m.good, m.bad, m.miss];
    const total = mine.every((v) => v !== null) ? (mine as number[]).reduce((a, b) => a + b, 0) : null;
    if (total === null) {
      notes.push('自分の判定を読み取れなかった項目があります。手動で入力してください。');
    }

    const applyChart = (chart: SongFromDB) => {
      form.songNameInput = chart.song_name;
      form.difficulty = chart.difficulty;
      form.level = String(chart.level);
    };

    // 1) ジャケットに近い曲（近い順）
    const jacketMatches = ocr.jacket ? findJacketMatches(ocr.jacket.hex, jackets) : [];
    let decided = false;

    if (jacketMatches.length > 0) {
      const names = jacketMatches.map((j) => j.songName);
      const rank = (s: SongFromDB) => names.indexOf(s.song_name);

      // ジャケットが近い曲のうち、総ノーツ数が合う譜面
      const charts = total === null ? [] : songs.filter((s) => names.includes(s.song_name) && Number(s.total_notes) === total);

      if (charts.length > 0) {
        const bestRank = Math.min(...charts.map(rank));
        const best = charts.filter((s) => rank(s) === bestRank); // いちばんジャケットが近い曲の譜面
        if (best.length === 1) {
          applyChart(best[0]);
          decided = true;
        } else {
          // 同じ曲で総ノーツ数が同じ譜面が複数あるときは、選択中の難易度で決める
          const same = best.filter((s) => s.difficulty === base.difficulty);
          if (same.length === 1) {
            applyChart(same[0]);
          } else {
            form.songNameInput = best[0].song_name;
            choices = best;
            notes.push('同じ曲で総ノーツ数が同じ譜面が複数あります。下の候補から選んでください。');
          }
          decided = true;
        }
      } else {
        // 曲名だけ分かった場合
        form.songNameInput = jacketMatches[0].songName;
        decided = true;
        notes.push(
          total === null
            ? `ジャケットから「${jacketMatches[0].songName}」と判断しました。難易度を選んでください。`
            : `ジャケットから「${jacketMatches[0].songName}」と判断しましたが、総ノーツ数 ${total} の譜面が見つかりません。難易度を確認してください。`
        );
      }
    }

    // 2) ジャケットで決まらなかったときは、総ノーツ数だけで探す
    if (!decided && total !== null) {
      const sameNotes = songs.filter((s) => Number(s.total_notes) === total);

      if (sameNotes.length === 1) {
        applyChart(sameNotes[0]);
      } else if (sameNotes.length > 1) {
        // 総ノーツ数が同じ曲が複数あるときは、候補として出す
        choices = sameNotes;

        // 選択中の難易度で1曲に絞れたときは、そのまま入力する（候補も残すので、違うときは選び直せる）
        const sameDiff = sameNotes.filter((s) => s.difficulty === base.difficulty);
        if (sameDiff.length === 1) {
          applyChart(sameDiff[0]);
          notes.push(
            `総ノーツ数 ${total} の曲が${sameNotes.length}件ありましたが、選択中の難易度（${base.difficulty}）で1曲に絞れたため入力しました。違う場合は下の候補から選び直してください。`
          );
        } else {
          notes.push(`総ノーツ数 ${total} に当てはまる曲が${sameNotes.length}件あります。下の候補から選んでください。`);
        }
      } else {
        notes.push(`総ノーツ数 ${total} の曲が登録されていません。曲名と難易度は手動で入力してください。`);
      }
    }

    if (ocr.trust < OCR_TRUST_LOW) {
      notes.push(`読み取りに自信がない項目があります（${describeWeakest(ocr.weakest)}）。数値を確認してください。`);
    }

    return { form, note: notes.join(' '), candidates: choices };
  };

  // 保存した曲にまだジャケットがなければ、読み取ったジャケットをその曲として登録する
  // （次回から、ジャケットで曲を特定できるようになる）
  const learnJacket = (jacket: JacketHash | null | undefined) => {
    if (!jacket) return;
    const name = matchForm.songNameInput;
    if (!name) return;
    if (!songs.some((s) => s.song_name === name)) return; // 登録済みの曲だけ
    if (jackets.some((j) => j.songName === name)) return; // すでにジャケットがある曲は何もしない

    fetch('/api/songs/jackets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songName: name, hex: jacket.hex, thumb: jacket.preview }),
    })
      .then(() => setJackets((prev) => [...prev, { songName: name, hex: jacket.hex }]))
      .catch((err) => console.error('ジャケット登録エラー:', err));
  };

  // いま確認中の画像のジャケット・曲の候補（確認用の表示に使う）
  const currentJacket = mode === 'batch' ? batchResults[batchCurrentIndex]?.jacket : pendingJacket;
  const currentCandidates: SongFromDB[] = mode === 'batch' ? batchResults[batchCurrentIndex]?.candidates || [] : candidates;

  // 候補から曲（譜面）を選んだとき
  const pickCandidate = (chart: SongFromDB) => {
    setMatchForm((prev) => ({
      ...prev,
      songNameInput: chart.song_name,
      difficulty: chart.difficulty,
      level: String(chart.level),
    }));
    if (mode === 'batch') {
      setBatchResults((prev) => prev.map((r, i) => (i === batchCurrentIndex ? { ...r, candidates: [] } : r)));
    } else {
      setCandidates([]);
    }
  };

  // 📸 単発画像解析（ブラウザの中で読み取る。外部サービスは使わない）
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setOcrNote('');
    setPendingJacket(null);
    setCandidates([]);
    setOcrLoading(true);

    try {
      const ocr = await analyzeResultImage(file);
      const { form, note, candidates: cands } = applyOcr(ocr, matchForm);
      setMatchForm(form);
      setOcrNote(note);
      setPendingJacket(ocr.jacket);
      setCandidates(cands);
    } catch (err) {
      console.error('OCRエラー:', err);
      alert('画像の解析に失敗しました。ネットワーク接続（初回のOCR読み込みに必要）と画像を確認してください。');
    } finally {
      setOcrLoading(false);
    }
  };

  // 📸 一括画像選択 ＆ 自動連続解析
  const handleBatchFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setBatchFiles(files);
    setBatchCurrentIndex(0);
    setOcrNote('');
    setOcrLoading(true);
    const parsedArray = [];

    // 順番に一括解析
    for (let i = 0; i < files.length; i++) {
      try {
        const ocr = await analyzeResultImage(files[i]);
        const { form, note, candidates: cands } = applyOcr(ocr, initialFormState);
        parsedArray.push({
          file: files[i],
          previewUrl: URL.createObjectURL(files[i]),
          data: { ...form, isOpponentHigher: false }, // 常に手動操作（初期値オフ）にする
          note,
          jacket: ocr.jacket,
          candidates: cands,
        });
      } catch (err) {
        console.error(`一括解析エラー (${i + 1}枚目):`, err);
      }
    }

    setBatchResults(parsedArray);
    if (parsedArray.length > 0) {
      setMatchForm(parsedArray[0].data);
      setPreviewUrl(parsedArray[0].previewUrl);
      setOcrNote(parsedArray[0].note || '');
    }
    setOcrLoading(false);
  };

  // 一括モードで「保存して次へ」進むときの処理
  const handleBatchNextSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    processSubmitData();

    const nextIndex = batchCurrentIndex + 1;
    if (nextIndex < batchResults.length) {
      setBatchCurrentIndex(nextIndex);
      setMatchForm(batchResults[nextIndex].data);
      setPreviewUrl(batchResults[nextIndex].previewUrl);
      setOcrNote(batchResults[nextIndex].note || '');
    } else {
      alert('すべての連続登録が完了しました！ 🎉');
      handleClose();
    }
  };

  const processSubmitData = () => {
    learnJacket(mode === 'batch' ? batchResults[batchCurrentIndex]?.jacket : pendingJacket);

    const currentSongData = songs.find((s) => s.song_name === matchForm.songNameInput && s.difficulty === matchForm.difficulty);
    const totalNotes = currentSongData ? currentSongData.total_notes : (
      (parseInt(matchForm.myPerfect) || 0) + (parseInt(matchForm.myGreat) || 0) + (parseInt(matchForm.myGood) || 0) + (parseInt(matchForm.myBad) || 0) + (parseInt(matchForm.myMiss) || 0)
    );

    const myPer = parseInt(matchForm.myPerfect) || 0;
    const myGr = parseInt(matchForm.myGreat) || 0;
    const myGo = parseInt(matchForm.myGood) || 0;
    const myBd = parseInt(matchForm.myBad) || 0;
    const myMs = parseInt(matchForm.myMiss) || 0;

    const oppGr = parseInt(matchForm.oppGreat) || 0;
    const oppGo = parseInt(matchForm.oppGood) || 0;
    const oppBd = parseInt(matchForm.oppBad) || 0;
    const oppMs = parseInt(matchForm.oppMiss) || 0;

    const myCalculatedPerf = myPer > 0 ? myPer : Math.max(0, totalNotes - (myGr + myGo + myBd + myMs));
    const oppCalculatedPerf = Math.max(0, totalNotes - (oppGr + oppGo + oppBd + oppMs));

    const calculateScore = (perf: number, great: number, good: number) => perf * 3 + great * 2 + good * 1;
    const myCalculatedScore = calculateScore(myCalculatedPerf, myGr, myGo);
    const oppCalculatedScore = calculateScore(oppCalculatedPerf, oppGr, oppGo);

    const myDamage = myMs * 80 + myBd * 50;
    const myRemainingLife = Math.max(0, 1000 - myDamage);
    const isLifeZero = myRemainingLife <= 0;

    const isAP = myGr === 0 && myGo === 0 && myBd === 0 && myMs === 0 && myCalculatedPerf > 0;
    const isFC = !isAP && myGo === 0 && myBd === 0 && myMs === 0 && (myCalculatedPerf > 0 || myGr > 0);
    const oppIsAP = oppGr === 0 && oppGo === 0 && oppBd === 0 && oppMs === 0 && oppCalculatedPerf > 0;

    let result: 'WIN' | 'LOSE' | 'DRAW' = 'DRAW';
    if (myCalculatedScore > oppCalculatedScore) result = 'WIN';
    else if (myCalculatedScore < oppCalculatedScore) result = 'LOSE';

    const isBothAP = result === 'DRAW' && isAP && oppIsAP;

    onSubmit({
      ...matchForm,
      songName: matchForm.songNameInput,
      difficulty: matchForm.difficulty,
      level: matchForm.level,
      myPerf: myCalculatedPerf,
      oppPerf: oppCalculatedPerf,
      myScore: myCalculatedScore,
      oppScore: oppCalculatedScore,
      myIsAP: isAP,
      myIsFC: isFC,
      isLifeZero,
      isBothAP,
      result,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processSubmitData();
    resetForm();
    onClose();
  };

  const uniqueSongNames = Array.from(new Set(songs.map((s) => s.song_name)));
  const availableSongsForCurrent = songs.filter((s) => s.song_name === matchForm.songNameInput);
  const availableDifficulties = availableSongsForCurrent.map((s) => s.difficulty);
  const currentSongDiffData = availableSongsForCurrent.find((s) => s.difficulty === matchForm.difficulty);
  const totalNotes = currentSongDiffData ? currentSongDiffData.total_notes : ((parseInt(matchForm.myPerfect) || 0) + (parseInt(matchForm.myGreat) || 0) + (parseInt(matchForm.myGood) || 0) + (parseInt(matchForm.myBad) || 0) + (parseInt(matchForm.myMiss) || 0));

  const myPer = parseInt(matchForm.myPerfect) || 0;
  const myGr = parseInt(matchForm.myGreat) || 0;
  const myGo = parseInt(matchForm.myGood) || 0;
  const myBd = parseInt(matchForm.myBad) || 0;
  const myMs = parseInt(matchForm.myMiss) || 0;
  const myCalculatedPerf = myPer > 0 ? myPer : Math.max(0, totalNotes - (myGr + myGo + myBd + myMs));

  const oppGr = parseInt(matchForm.oppGreat) || 0;
  const oppGo = parseInt(matchForm.oppGood) || 0;
  const oppBd = parseInt(matchForm.oppBad) || 0;
  const oppMs = parseInt(matchForm.oppMiss) || 0;
  const oppCalculatedPerf = Math.max(0, totalNotes - (oppGr + oppGo + oppBd + oppMs));

  const calculateScore = (perf: number, great: number, good: number) => perf * 3 + great * 2 + good * 1;
  const myCalculatedScore = calculateScore(myCalculatedPerf, myGr, myGo);
  const oppCalculatedScore = calculateScore(oppCalculatedPerf, oppGr, oppGo);

  const myDamage = myMs * 80 + myBd * 50;
  const myRemainingLife = Math.max(0, 1000 - myDamage);
  const isLifeZero = myRemainingLife <= 0;
  const isAP = myGr === 0 && myGo === 0 && myBd === 0 && myMs === 0 && myCalculatedPerf > 0;
  const isFC = !isAP && myGo === 0 && myBd === 0 && myMs === 0 && (myCalculatedPerf > 0 || myGr > 0);
  const oppIsAP = oppGr === 0 && oppGo === 0 && oppBd === 0 && oppMs === 0 && oppCalculatedPerf > 0;

  let result: 'WIN' | 'LOSE' | 'DRAW' = 'DRAW';
  if (myCalculatedScore > oppCalculatedScore) result = 'WIN';
  else if (myCalculatedScore < oppCalculatedScore) result = 'LOSE';
  const isBothAP = result === 'DRAW' && isAP && oppIsAP;

  const handleSongInputChange = (value: string) => {
    setMatchForm((prev) => ({ ...prev, songNameInput: value }));
    const matched = songs.filter((s) => s.song_name === value);
    if (matched.length > 0) {
      setMatchForm((prev) => ({
        ...prev,
        songNameInput: value,
        difficulty: matched[0].difficulty,
        level: matched[0].level,
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-[#080910]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-panel border border-white/15 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 neon-glow-pink my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-white/10 pb-4 sticky top-0 bg-[#080910]/90 backdrop-blur-md z-10 -mx-6 -mt-6 p-6 md:-mx-8 md:-mt-8 md:p-8">
          <div className="flex items-center space-x-4">
            <h3 className="text-xl font-black text-white flex items-center space-x-2">
              <span className="w-2.5 h-6 bg-pink-500 rounded-full"></span>
              <span>新規対戦レコード登録</span>
            </h3>
            {/* モード切り替えタブ */}
            <div className="bg-slate-900 p-1 rounded-xl border border-white/10 flex text-xs">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`px-3 py-1 rounded-lg font-bold transition ${mode === 'single' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                1枚ずつ登録
              </button>
              <button
                type="button"
                onClick={() => setMode('batch')}
                className={`px-3 py-1 rounded-lg font-bold transition ${mode === 'batch' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                ⚡ 複数一括連続登録
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* 📸 画像アップロードエリア（モード別） */}
        {mode === 'single' ? (
          <div className="bg-pink-950/10 border border-pink-500/30 p-4 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-pink-400">📸 リザルト画像から自動入力</span>
              {ocrLoading && <span className="text-xs text-pink-300 animate-pulse font-bold">画像を解析中...（初回は読み込みに少し時間がかかります）</span>}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={ocrLoading}
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-pink-600 file:text-white hover:file:bg-pink-500 cursor-pointer disabled:opacity-50"
            />
            {previewUrl && (
              <div className="flex items-center gap-3 pt-1">
                <img src={previewUrl} alt="プレビュー" className="w-24 h-12 object-cover rounded-lg border border-white/10" />
                <span className="text-[10px] text-slate-400">画像読み込み完了</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-cyan-950/10 border border-cyan-500/30 p-4 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-cyan-400">⚡ 複数スクショ一括連続アップロード</span>
              {ocrLoading && <span className="text-xs text-cyan-300 animate-pulse font-bold">全画像を順次解析中... ({batchFiles.length}枚)</span>}
              {batchResults.length > 0 && !ocrLoading && (
                <span className="text-xs text-cyan-200 font-bold bg-cyan-500/20 px-2 py-0.5 rounded">
                  進捗: {batchCurrentIndex + 1} / {batchResults.length} 枚目
                </span>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleBatchFilesChange}
              disabled={ocrLoading}
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer disabled:opacity-50"
            />
            {previewUrl && (
              <div className="flex items-center gap-3 pt-1">
                <img src={previewUrl} alt="現在処理中のプレビュー" className="w-24 h-12 object-cover rounded-lg border border-cyan-500/40" />
                <span className="text-[10px] text-cyan-300 font-semibold">現在確認中の画像（内容を確認して「保存して次へ」を押してください）</span>
              </div>
            )}
          </div>
        )}

        {currentJacket && (
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <img src={currentJacket.preview} alt="読み取ったジャケット" className="w-12 h-12 rounded-lg border border-white/10" />
            <span>読み取ったジャケット（曲の特定に使います。ジャケット以外が写っているときは、位置の調整が必要です）</span>
          </div>
        )}

        {currentCandidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-400">
              総ノーツ数が同じ曲の候補です。選ぶと曲名・難易度が入力されます（保存すると、この画像のジャケットがその曲として登録されます）。
            </p>
            <div className="flex flex-wrap gap-2">
              {currentCandidates.slice(0, 12).map((c) => (
                <button
                  key={`${c.song_name}-${c.difficulty}`}
                  type="button"
                  onClick={() => pickCandidate(c)}
                  className="bg-white/10 hover:bg-cyan-500/30 border border-white/10 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  {c.song_name}
                  <span className="ml-1.5 text-[10px] text-cyan-300">
                    {c.difficulty} Lv.{c.level}
                  </span>
                </button>
              ))}
            </div>
            {currentCandidates.length > 12 && (
              <p className="text-[10px] text-slate-500">ほか {currentCandidates.length - 12} 件は、曲名を入力して探してください。</p>
            )}
          </div>
        )}

        {ocrNote && (
          <div className="bg-amber-950/20 border border-amber-500/40 text-amber-200 text-xs rounded-xl px-4 py-3">
            ⚠️ {ocrNote}
          </div>
        )}

        <form onSubmit={mode === 'batch' && batchResults.length > 0 && batchCurrentIndex < batchResults.length - 1 ? handleBatchNextSubmit : handleSubmit} className="space-y-6 text-sm pt-2">
          {/* 曲名・難易度・レベル */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">曲名 (サジェスト対応)</label>
              <input
                type="text"
                list="song-suggestions"
                required
                placeholder="例: フォニイ"
                value={matchForm.songNameInput}
                onChange={(e) => handleSongInputChange(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500 text-xs"
              />
              <datalist id="song-suggestions">
                {uniqueSongNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">難易度</label>
              <select
                value={matchForm.difficulty}
                onChange={(e) => setMatchForm({ ...matchForm, difficulty: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500 text-xs"
              >
                {availableDifficulties.length > 0 ? (
                  availableDifficulties.map((diff) => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))
                ) : (
                  <>
                    <option value="EXPERT">EXPERT</option>
                    <option value="MASTER">MASTER</option>
                    <option value="APPEND">APPEND</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">レベル</label>
              <input
                type="text"
                value={matchForm.level}
                onChange={(e) => setMatchForm({ ...matchForm, level: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-cyan-400 font-bold text-center focus:outline-none text-xs"
              />
            </div>
          </div>

          <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10 p-3 rounded-xl border border-white/10 flex justify-between items-center text-xs">
            <span className="text-slate-300">算出された総ノーツ数: <strong className="text-white font-mono text-sm">{totalNotes}</strong></span>
            <span className="text-cyan-400 font-semibold">※判定数から自動計算されます</span>
          </div>

          {/* 格上チェック */}
          <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
            <label className="flex items-center space-x-3 cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition">
              <input
                type="checkbox"
                checked={matchForm.isOpponentHigher}
                onChange={(e) => setMatchForm({ ...matchForm, isOpponentHigher: e.target.checked })}
                className="w-4 h-4 accent-pink-500 rounded cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-200">🔥 格上マッチ相手だった</span>
            </label>
          </div>

          {/* 自分のリザルト */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-cyan-400 text-xs tracking-wider">自分の判定数 ＆ スコア</span>
                {isAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-md">ALL PERFECT</span>}
                {isFC && <span className="bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">FULL COMBO</span>}
                {isLifeZero && <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-black px-2 py-0.5 rounded-md">❤️ ライフ0耐え</span>}
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-[11px] text-slate-400 font-mono">残ライフ: <span className={`font-bold ${isLifeZero ? 'text-red-400' : 'text-cyan-300'}`}>{myRemainingLife} / 1000</span></span>
                <span className="text-xs bg-cyan-500/20 text-cyan-300 px-3 py-1 rounded-full font-mono font-bold">
                  算出スコア: {myCalculatedScore} pt
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-amber-400 mb-1">PERFECT</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="自動"
                  value={matchForm.myPerfect}
                  onChange={(e) => setMatchForm({ ...matchForm, myPerfect: e.target.value })}
                  className="w-full bg-slate-900 border border-amber-500/30 rounded-lg px-2 py-2 text-center text-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GREAT (2pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myGreat}
                  onChange={(e) => setMatchForm({ ...matchForm, myGreat: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GOOD (1pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myGood}
                  onChange={(e) => setMatchForm({ ...matchForm, myGood: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">BAD (50dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myBad}
                  onChange={(e) => setMatchForm({ ...matchForm, myBad: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">MISS (80dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.myMiss}
                  onChange={(e) => setMatchForm({ ...matchForm, myMiss: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* 相手のリザルト */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-pink-400 text-xs tracking-wider">相手のリザルト ＆ スコア</span>
                {oppIsAP && <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-0.5 rounded-md">OPP ALL PERFECT</span>}
              </div>
              <span className="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-mono font-bold">
                算出スコア: {oppCalculatedScore} pt
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-[10px] text-amber-400 mb-1">PERFECT (自動)</label>
                <div className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-2 py-2 text-center text-amber-300 font-mono font-bold text-xs">
                  {oppCalculatedPerf}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GREAT (2pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppGreat}
                  onChange={(e) => setMatchForm({ ...matchForm, oppGreat: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GOOD (1pt)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppGood}
                  onChange={(e) => setMatchForm({ ...matchForm, oppGood: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">BAD (50dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppBad}
                  onChange={(e) => setMatchForm({ ...matchForm, oppBad: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">MISS (80dmg)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={matchForm.oppMiss}
                  onChange={(e) => setMatchForm({ ...matchForm, oppMiss: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>
          </div>

          {/* プレビュー */}
          <div className="p-4 rounded-2xl border flex items-center justify-between bg-slate-900/80 border-white/10">
            <span className="text-xs text-slate-400 font-semibold">判定されるマッチ結果：</span>
            <span
              className={`text-sm font-black px-4 py-1.5 rounded-xl tracking-wider ${
                result === 'WIN' || isBothAP
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : result === 'LOSE'
                  ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-[0_0_10px_rgba(236,72,153,0.3)]'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {result === 'WIN' ? '🎉 WIN (粒 +1)' : isBothAP ? '⭐ BOTH AP (粒 +1)' : result === 'LOSE' ? '💀 LOSE (粒 -1)' : '⚖️ DRAW (変動なし)'}
            </span>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="w-1/3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition text-xs"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="w-2/3 bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 text-white font-black py-3 rounded-xl transition shadow-lg shadow-pink-600/30 text-xs tracking-wider"
            >
              {mode === 'batch' && batchResults.length > 0 && batchCurrentIndex < batchResults.length - 1
                ? `保存して次へ (${batchCurrentIndex + 1}/${batchResults.length}) ➔`
                : 'レコードを保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}