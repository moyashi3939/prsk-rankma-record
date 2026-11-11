'use client';

import { useId } from 'react';

// 分析画面で使う、小さなグラフの部品（外部のライブラリを使わず、SVGだけで描く。スマホの縦画面でも、横幅に合わせて縮む）

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
}

export function LineChart({
  series,
  height = 180,
  yMin,
  yMax,
  yFormat = (v: number) => String(Math.round(v)),
  refLine,
  ticks,
  xUnit = '戦',
}: {
  series: Series[];
  height?: number;
  yMin?: number;
  yMax?: number;
  yFormat?: (v: number) => string;
  refLine?: { value: number; label: string };
  ticks?: { value: number; label: string }[]; // 縦軸の目盛りを、自分で決めるとき
  xUnit?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const W = 600;
  const PAD = { l: 44, r: 12, t: 10, b: 22 };
  const len = Math.max(0, ...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);

  if (len < 2 || all.length < 2) {
    return <p className="text-[11px] text-slate-500 py-8 text-center">グラフを出すには、2戦以上の記録が必要です。</p>;
  }

  let lo = yMin ?? Math.min(...all);
  let hi = yMax ?? Math.max(...all);
  if (refLine) {
    lo = Math.min(lo, refLine.value);
    hi = Math.max(hi, refLine.value);
  }
  if (hi - lo < 1e-6) {
    hi = lo + 1;
  }
  const pad = yMin === undefined && yMax === undefined ? (hi - lo) * 0.1 : 0;
  lo -= pad;
  hi += pad;

  const x = (i: number) => PAD.l + (len === 1 ? 0 : (i / (len - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (height - PAD.t - PAD.b);

  const gridValues = ticks ? ticks.map((t) => t.value) : [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const gridLabels = ticks ? ticks.map((t) => t.label) : gridValues.map((v) => yFormat(v));

  // null をはさんで、線を切る
  const pathOf = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  const first = series[0];
  const areaPath = (() => {
    const pts = first.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
    if (pts.length < 2) return '';
    const base = (height - PAD.b).toFixed(1);
    return `M${pts[0][0].toFixed(1)},${base} ` + pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0].toFixed(1)},${base} Z`;
  })();

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img">
        <defs>
          <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={first.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={first.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {gridLabels[i]}
            </text>
          </g>
        ))}

        {refLine && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity="0.7" />
            <text x={W - PAD.r} y={y(refLine.value) - 4} textAnchor="end" fontSize="10" fill="#fbbf24">
              {refLine.label}
            </text>
          </g>
        )}

        {areaPath && <path d={areaPath} fill={`url(#g-${gid})`} />}
        {series.map((s) => (
          <path key={s.name} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* 最後の点 */}
        {series.map((s) => {
          const lastIdx = (() => {
            for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return i;
            return -1;
          })();
          return lastIdx < 0 ? null : <circle key={`dot-${s.name}`} cx={x(lastIdx)} cy={y(s.values[lastIdx] as number)} r="3.5" fill={s.color} />;
        })}

        <text x={PAD.l} y={height - 6} fontSize="10" fill="#64748b">
          1{xUnit}
        </text>
        <text x={W - PAD.r} y={height - 6} textAnchor="end" fontSize="10" fill="#64748b">
          {len}
          {xUnit}
        </text>
      </svg>

      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-slate-400">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// 直近の勝敗を、丸で並べる（左が古い・右が新しい）
export function Dots({ outcomes }: { outcomes: ('W' | 'L' | 'D')[] }) {
  const color = { W: 'bg-cyan-400', L: 'bg-pink-500', D: 'bg-slate-500' } as const;
  const label = { W: '勝', L: '負', D: '分' } as const;
  return (
    <div className="flex flex-wrap gap-1.5">
      {outcomes.map((o, i) => (
        <span key={i} title={label[o]} className={`w-5 h-5 rounded-full ${color[o]} text-[9px] font-black text-black/70 flex items-center justify-center`}>
          {label[o]}
        </span>
      ))}
    </div>
  );
}

// 横向きの積み上げ棒（判定の内訳など）
export function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800 border border-white/5">
      {segments.map((s) => (
        <div key={s.label} title={`${s.label} ${s.value.toFixed(2)}%`} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
      ))}
    </div>
  );
}

// 勝率などを、横棒で並べる
export function BarRows({
  rows,
  color = '#22d3ee',
}: {
  rows: { key: string; label: string; value: number; sub?: string; highlight?: 'good' | 'bad' }[];
  color?: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-[11px] mb-0.5">
            <span className={r.highlight === 'good' ? 'text-cyan-300 font-bold' : r.highlight === 'bad' ? 'text-pink-300 font-bold' : 'text-slate-200'}>
              {r.label}
              {r.highlight === 'good' && ' 👍'}
              {r.highlight === 'bad' && ' 🎯'}
            </span>
            <span className="text-slate-400 font-mono">{r.sub}</span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, r.value))}%`, backgroundColor: r.highlight === 'bad' ? '#ec4899' : color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
