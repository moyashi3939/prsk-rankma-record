'use client';

import { useState, useEffect } from 'react';
import {
  analyzeResultImage,
  describeWeakest,
  OCR_TRUST_LOW,
  type JacketHash,
  type JacketRecord,
  type OcrResult,
} from '@/lib/resultOcr';
import { calcMatch } from '@/lib/matchCalc';
import { bonusDelta } from '@/lib/rank';
import { toast } from '@/lib/toast';
import { rankRangeTier } from '@/lib/rankRanges';
import { classifyDifficultyByColor, identifySong, isUsableRingColor, type DifficultyColor } from '@/lib/songMatch';

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
  rankName?: string | null; // いまのランク（ランクごとの選曲範囲を、曲の判別の手がかりにする）
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

export default function RecordModal({ isOpen, onClose, onSubmit, rankName }: RecordModalProps) {
  const [songs, setSongs] = useState<SongFromDB[]>([]);
  const [matchForm, setMatchForm] = useState(initialFormState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState(''); // 読み取り結果についての注意書き
  const [batchProgress, setBatchProgress] = useState(0); // 一括解析で、いま何枚目を読み取っているか
  const [jackets, setJackets] = useState<JacketRecord[]>([]); // 保存済みの曲ジャケット
  const [inbox, setInbox] = useState<{ id: number; reason?: string | null }[]>([]); // ショートカットから届いた、確認待ちの画像（受信箱）
  const [difficultyColors, setDifficultyColors] = useState<DifficultyColor[]>([]); // 覚えている、難易度ごとの枠の色
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

      // 難易度ごとの「ジャケットのまわりの色」（難易度の判別に使う）
      fetch('/api/difficulty-colors')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setDifficultyColors(data);
        })
        .catch(() => {
          setDifficultyColors([]);
        });

      // ショートカットから届いた画像（ログイン中のみ）
      fetch('/api/shortcut/inbox', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setInbox(data);
        })
        .catch(() => {
          setInbox([]);
        });
    }
  }, [isOpen]);

  // 曲名・難易度が決まったら、レベルを、登録されている曲のレベルに自動でそろえる。
  // （画面での選択・候補の選択・画像の読み取り・複数枚の切り替え、どの経路でも、難易度とレベルが食い違わないようにする）
  useEffect(() => {
    const forSong = songs.filter((s) => s.song_name === matchForm.songNameInput);
    if (forSong.length === 0) return; // 登録されていない曲は、レベルを手で入力できる

    const order = ['EXPERT', 'MASTER', 'APPEND'];
    const diffs = forSong.map((s) => s.difficulty).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    // この曲にない難易度が選ばれていたら、ある難易度に直す
    const difficulty = diffs.includes(matchForm.difficulty) ? matchForm.difficulty : diffs.includes('MASTER') ? 'MASTER' : diffs[0];
    const level = String(forSong.find((s) => s.difficulty === difficulty)!.level);

    if (difficulty !== matchForm.difficulty || level !== matchForm.level) {
      setMatchForm((prev) => ({ ...prev, difficulty, level }));
    }
  }, [songs, matchForm.songNameInput, matchForm.difficulty, matchForm.level]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // OCR結果をフォームの値に変換する。
  // 曲・難易度は、ジャケット・総ノーツ数（自分の判定の合計）・ジャケットのまわりの色から決める（lib/songMatch.ts）。
  // 決まったものを入力したうえで、念のため、他の候補も出す。
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

    const mine = [m.perfect, m.great, m.good, m.bad, m.miss];
    const total = mine.every((v) => v !== null) ? (mine as number[]).reduce((a, b) => a + b, 0) : null;
    if (total === null) {
      notes.push('自分の判定を読み取れなかった項目があります。手動で入力してください。');
    }

    const id = identifySong({
      total,
      jacketHex: ocr.jacket?.hex ?? null,
      ring: ocr.jacket?.ring ?? null,
      preferredDifficulty: base.difficulty,
      rankName,
      songs,
      jackets,
      difficultyColors,
    });

    if (id.chart) {
      form.songNameInput = id.chart.song_name;
      form.difficulty = id.chart.difficulty;
      form.level = String(id.chart.level);
    } else if (id.songName) {
      form.songNameInput = id.songName;
    }
    notes.push(...id.reasons);

    if (ocr.trust < OCR_TRUST_LOW) {
      notes.push(`読み取りに自信がない項目があります（${describeWeakest(ocr.weakest)}）。数値を確認してください。`);
    }

    return { form, note: notes.join(' '), candidates: id.others as SongFromDB[] };
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

  // 保存した譜面の難易度と、ジャケットのまわりの色を結びつけて覚える（次から、色で難易度を判別できるようにする）
  const learnDifficultyColor = (jacket: JacketHash | null | undefined) => {
    const ring = jacket?.ring;
    if (!isUsableRingColor(ring)) return;
    if (!['EXPERT', 'MASTER', 'APPEND'].includes(matchForm.difficulty)) return;

    fetch('/api/difficulty-colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: matchForm.difficulty, r: ring.r, g: ring.g, b: ring.b }),
    }).catch((err) => console.error('難易度の色の登録エラー:', err));
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
      toast('画像の解析に失敗しました。ネットワーク接続（初回のOCR読み込みに必要）と画像を確認してください。', 'error');
    } finally {
      setOcrLoading(false);
    }
  };

  // 📸 一括画像選択 ＆ 自動連続解析
  const handleBatchFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processBatchFiles(files, []);
  };

  // 画像をまとめて解析して、1枚ずつ確認しながら登録できる状態にする
  // uploadIds … ショートカットから届いた画像のとき、その受信箱でのID（保存したら受信箱から消す）
  const processBatchFiles = async (files: File[], uploadIds: (number | null)[]) => {
    setBatchFiles(files);
    setBatchCurrentIndex(0);
    setOcrNote('');
    setOcrLoading(true);
    const parsedArray = [];

    // 順番に一括解析
    for (let i = 0; i < files.length; i++) {
      setBatchProgress(i + 1);
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
          uploadId: uploadIds[i] ?? null,
        });
      } catch (err) {
        console.error(`一括解析エラー (${i + 1}枚目):`, err);
      }
    }

    setBatchProgress(0);
    setBatchResults(parsedArray);
    if (parsedArray.length > 0) {
      setMatchForm(parsedArray[0].data);
      setPreviewUrl(parsedArray[0].previewUrl);
      setOcrNote(parsedArray[0].note || '');
    }
    setOcrLoading(false);
  };

  // 📥 ショートカットから届いた画像を取り込んで、一括モードで1枚ずつ確認できるようにする
  const importFromInbox = async () => {
    if (inbox.length === 0) return;

    setMode('batch');
    setOcrLoading(true);
    try {
      const files: File[] = [];
      const ids: number[] = [];
      for (const item of inbox) {
        const res = await fetch(`/api/shortcut/inbox/${item.id}`, { cache: 'no-store' });
        if (!res.ok) continue;
        const blob = await res.blob();
        files.push(new File([blob], `shortcut-${item.id}`, { type: blob.type }));
        ids.push(item.id);
      }
      setInbox([]);

      if (files.length === 0) {
        setOcrLoading(false);
        toast('届いた画像を取り込めませんでした。', 'error');
        return;
      }
      await processBatchFiles(files, ids);
    } catch (err) {
      console.error('受信箱の取り込みエラー:', err);
      setOcrLoading(false);
      toast('受信箱の取り込み中にエラーが発生しました。', 'error');
    }
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
      toast('すべての連続登録が完了しました！ 🎉', 'success');
      handleClose();
    }
  };

  const processSubmitData = () => {
    const currentJacketForSave = mode === 'batch' ? batchResults[batchCurrentIndex]?.jacket : pendingJacket;
    learnJacket(currentJacketForSave);
    learnDifficultyColor(currentJacketForSave);

    const currentSongData = songs.find((s) => s.song_name === matchForm.songNameInput && s.difficulty === matchForm.difficulty);

    // スコア・勝敗・AP/FC などの計算（lib/matchCalc.ts。サーバーの自動登録と同じ計算）
    const calc = calcMatch({
      totalNotes: currentSongData ? Number(currentSongData.total_notes) : 0,
      myPerfect: parseInt(matchForm.myPerfect) || 0,
      myGreat: parseInt(matchForm.myGreat) || 0,
      myGood: parseInt(matchForm.myGood) || 0,
      myBad: parseInt(matchForm.myBad) || 0,
      myMiss: parseInt(matchForm.myMiss) || 0,
      oppGreat: parseInt(matchForm.oppGreat) || 0,
      oppGood: parseInt(matchForm.oppGood) || 0,
      oppBad: parseInt(matchForm.oppBad) || 0,
      oppMiss: parseInt(matchForm.oppMiss) || 0,
    });

    onSubmit({
      ...matchForm,
      songName: matchForm.songNameInput,
      difficulty: matchForm.difficulty,
      level: matchForm.level,
      myPerf: calc.myPerf,
      oppPerf: calc.oppPerf,
      myScore: calc.myScore,
      oppScore: calc.oppScore,
      myIsAP: calc.myIsAP,
      myIsFC: calc.myIsFC,
      isLifeZero: calc.isLifeZero,
      isBothAP: calc.isBothAP,
      result: calc.result,
    });

    // ショートカットから届いた画像だったら、保存したので受信箱から消す
    const uploadId = mode === 'batch' ? batchResults[batchCurrentIndex]?.uploadId : null;
    if (uploadId) {
      fetch(`/api/shortcut/inbox/${uploadId}`, { method: 'DELETE' }).catch((err) =>
        console.error('受信箱の画像削除エラー:', err)
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processSubmitData();
    resetForm();
    onClose();
  };

  const uniqueSongNames = Array.from(new Set(songs.map((s) => s.song_name)));
  const availableSongsForCurrent = songs.filter((s) => s.song_name === matchForm.songNameInput);
  const DIFFICULTY_ORDER = ['EXPERT', 'MASTER', 'APPEND'];
  const availableDifficulties = availableSongsForCurrent
    .map((s) => s.difficulty)
    .sort((a, b) => DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b));
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

  // 曲名を入れたとき：いま選んでいる難易度がその曲にあれば残し（なければ MASTER → 最初の難易度）、レベルも合わせる
  const handleSongInputChange = (value: string) => {
    setMatchForm((prev) => {
      const matched = songs.filter((s) => s.song_name === value);
      if (matched.length === 0) return { ...prev, songNameInput: value };
      const chart =
        matched.find((s) => s.difficulty === prev.difficulty) ??
        matched.find((s) => s.difficulty === 'MASTER') ??
        matched[0];
      return { ...prev, songNameInput: value, difficulty: chart.difficulty, level: String(chart.level) };
    });
  };

  return (
    <div className="fixed inset-0 bg-[#080910]/85 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-panel border border-white/15 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 neon-glow-pink my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start md:items-center gap-3 border-b border-white/10 pb-4 sticky top-0 bg-[#080910]/90 backdrop-blur-md z-10 -mx-6 -mt-6 p-4 md:-mx-8 md:-mt-8 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
            <h3 className="text-base md:text-xl font-black text-white flex items-center space-x-2">
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
            className="text-slate-400 hover:text-white text-xl font-bold px-3 py-2 -mr-2 shrink-0"
          >
            ✕
          </button>
        </div>

        {inbox.length > 0 && batchResults.length === 0 && (
          <div className="bg-amber-950/20 border border-amber-500/40 p-4 rounded-2xl flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-amber-300">📥 確認待ちの画像が {inbox.length} 枚あります</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                ショートカットで送った画像のうち、読み取りに自信がなかったものです（自信があるものは、自動で登録されています）。取り込むと、1枚ずつ確認しながら登録できます。
              </p>
              {inbox[0]?.reason && <p className="text-[10px] text-slate-500 mt-0.5">例）{inbox[0].reason}</p>}
            </div>
            <button
              type="button"
              onClick={importFromInbox}
              disabled={ocrLoading}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition shrink-0"
            >
              取り込む
            </button>
          </div>
        )}

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
              {ocrLoading && <span className="text-xs text-cyan-300 animate-pulse font-bold">全画像を順次解析中... ({batchProgress}/{batchFiles.length}枚目)</span>}
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
            <img src={currentJacket.preview} alt="読み取ったジャケット" className="w-12 h-12 rounded-lg border border-white/10 shrink-0" />
            <div className="space-y-1">
              <p>読み取ったジャケット（曲の特定に使います。ジャケット以外が写っているときは、位置の調整が必要です）</p>
              {currentJacket.ring && (
                <p className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-sm border border-white/20"
                    style={{ backgroundColor: `rgb(${currentJacket.ring.r}, ${currentJacket.ring.g}, ${currentJacket.ring.b})` }}
                  />
                  <span>
                    枠の色
                    {(() => {
                      const d = classifyDifficultyByColor(currentJacket.ring, difficultyColors);
                      return d ? `：${d} に見えます` : '：難易度を判別できませんでした';
                    })()}
                  </span>
                </p>
              )}
            </div>
          </div>
        )}

        {currentCandidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-400">
              {matchForm.songNameInput
                ? '他の候補です。違うときは、選び直せます（保存すると、この画像のジャケットが、選んだ曲として登録されます）。'
                : '候補です。選ぶと曲名・難易度が入力されます（保存すると、この画像のジャケットが、その曲として登録されます）。'}
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
                  {rankRangeTier(rankName, c.difficulty, c.level) === 2 && (
                    <span className="ml-1.5 text-[9px] font-normal text-amber-300">ランク範囲外</span>
                  )}
                </button>
              ))}
            </div>
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
                onChange={(e) => {
                  const difficulty = e.target.value;
                  const chart = songs.find((s) => s.song_name === matchForm.songNameInput && s.difficulty === difficulty);
                  // 登録されている曲なら、その難易度のレベルに自動で変わる
                  setMatchForm({ ...matchForm, difficulty, level: chart ? String(chart.level) : matchForm.level });
                }}
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                レベル
                <span className="ml-1 text-[10px] font-normal text-slate-500">
                  {currentSongDiffData ? '（難易度に合わせて自動）' : '（登録のない曲は、手入力）'}
                </span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={matchForm.level}
                readOnly={!!currentSongDiffData}
                onChange={(e) => setMatchForm({ ...matchForm, level: e.target.value })}
                className={`w-full border rounded-xl px-4 py-2.5 text-cyan-400 font-bold text-center focus:outline-none text-xs ${
                  currentSongDiffData ? 'bg-slate-900/50 border-white/5 cursor-not-allowed' : 'bg-slate-900 border-white/10'
                }`}
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
              <span className="text-xs font-semibold text-slate-200">🔥 格上マッチ相手だった（上位クラスの相手）</span>
            </label>

            {/* ランクポイントボーナスの予告（判定マッチ後のみ） */}
            {rankName && (myCalculatedScore > 0 || oppCalculatedScore > 0) && (() => {
              const res = myCalculatedScore > oppCalculatedScore ? 'WIN' : myCalculatedScore < oppCalculatedScore ? 'LOSE' : 'DRAW';
              const delta = bonusDelta(res, { isAP, isFC, isLifeZero, isOpponentHigher: matchForm.isOpponentHigher });
              return (
                <p className="text-[11px] text-slate-400 mt-2 px-1">
                  ランクポイントボーナス：
                  <b className={delta > 0 ? 'text-amber-300' : delta < 0 ? 'text-red-300' : 'text-slate-300'}>
                    {delta > 0 ? `+${delta}` : delta}
                  </b>
                  <span className="text-slate-500">
                    {'　'}（AP +20 ／ FC +10 ／ 格上に勝ち +10 ／ ライフ0 −30）
                  </span>
                </p>
              );
            })()}
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
            <div className="flex flex-wrap justify-between items-center gap-2">
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

          {/* 保存ボタン：スマホでは、画面の下に固定して、長いフォームでも押しやすくする */}
          <div className="flex space-x-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sticky bottom-0 -mx-6 px-6 bg-[#080910]/95 backdrop-blur-md border-t border-white/10 md:static md:mx-0 md:px-0 md:pb-0 md:bg-transparent md:backdrop-blur-none md:border-t-0">
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