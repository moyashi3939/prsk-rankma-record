'use client';

import { useEffect, useState } from 'react';
import { RANKS, CLASS_COUNT, MAX_GRAINS, BONUS_RULES, MASTER } from '@/lib/rank';
import { toast } from '@/lib/toast';

export interface RankEditValues {
  rankName: string;
  classIndex: number;
  grains: number;
  bonus: number;
  isPlacementCompleted: boolean;
}

// ホーム画面のランク表示から、ランク・クラス・粒・ボーナスを手で修正する画面。
// （読み取りの間違いや、計算のずれが起きたときに、正しい状態へ直せるようにする）
export default function RankEditModal({
  isOpen,
  initial,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  initial: RankEditValues;
  onClose: () => void;
  onSaved: (rankStatus: any) => void;
}) {
  const [rankName, setRankName] = useState('ルーキー');
  const [classIndex, setClassIndex] = useState(0);
  const [grains, setGrains] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [saving, setSaving] = useState(false);

  // 開いたときに、いまの状態を入れる（判定マッチ中は、ルーキーから）
  useEffect(() => {
    if (!isOpen) return;
    const placing = !initial.isPlacementCompleted || !(RANKS as readonly string[]).includes(initial.rankName);
    setRankName(placing ? 'ルーキー' : initial.rankName);
    setClassIndex(placing ? 0 : initial.classIndex);
    setGrains(placing ? 0 : initial.grains);
    setBonus(placing ? 0 : initial.bonus);
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const isMaster = rankName === MASTER;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rank/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rankName, classIndex, grains, bonus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(`修正に失敗しました${data.error ? `：${data.error}` : ''}`, 'error');
        return;
      }
      toast('ランクを修正しました。', 'success');
      onSaved(data.rankStatus);
      onClose();
    } catch (err) {
      console.error('ランクの修正エラー:', err);
      toast('修正中にエラーが発生しました。', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500';

  return (
    <div className="fixed inset-0 bg-[#080910]/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
      <div className="glass-panel border border-cyan-500/40 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        <div>
          <h3 className="text-lg font-black text-cyan-300">✏️ ランク・粒を修正</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            表示が、ゲームの実際の状態とずれているときに、直せます。
            <b className="text-amber-300">修正すると、これより前の対戦は、ランクの計算に使われなくなります</b>
            （履歴には残ります）。これ以降に記録した対戦が、ここから積み上がります。
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">ランク</label>
            <select
              value={rankName}
              onChange={(e) => {
                setRankName(e.target.value);
                if (e.target.value !== MASTER) setGrains((g) => Math.min(g, MAX_GRAINS));
              }}
              className={fieldClass}
            >
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {!isMaster && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">クラス</label>
              <select value={classIndex} onChange={(e) => setClassIndex(parseInt(e.target.value, 10))} className={fieldClass}>
                {Array.from({ length: CLASS_COUNT }, (_, i) => (
                  <option key={i} value={i}>
                    クラス {i + 1}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              {isMaster ? '粒（マスターは累計。上限なし）' : `粒（0〜${MAX_GRAINS}）`}
            </label>
            <input
              type="number"
              min={0}
              max={isMaster ? undefined : MAX_GRAINS}
              value={grains}
              onChange={(e) => {
                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setGrains(isMaster ? n : Math.min(n, MAX_GRAINS));
              }}
              className={fieldClass}
            />
          </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                ランクポイントボーナス（0〜{BONUS_RULES.perGrain - 1}。{BONUS_RULES.perGrain}たまると粒が1つ増えます）
              </label>
              <input
                type="number"
                min={0}
                max={BONUS_RULES.perGrain - 1}
                value={bonus}
                onChange={(e) => {
                  const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  setBonus(Math.min(n, BONUS_RULES.perGrain - 1));
                }}
                className={fieldClass}
              />
            </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs transition"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] bg-gradient-to-r from-pink-600 to-cyan-500 hover:from-pink-500 hover:to-cyan-400 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs tracking-wider transition shadow-lg shadow-cyan-500/20"
          >
            {saving ? '修正中...' : 'この状態に修正する'}
          </button>
        </div>
      </div>
    </div>
  );
}
