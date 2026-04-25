import { useState } from 'react';

export type FTEBand = '0–0.25' | '0.25–0.5' | '0.5–0.75' | '0.75–1.0' | '1.0+';

export function getFTEBand(fte: number): FTEBand {
  if (fte < 0.25) return '0–0.25';
  if (fte < 0.5) return '0.25–0.5';
  if (fte < 0.75) return '0.5–0.75';
  if (fte < 1.0) return '0.75–1.0';
  return '1.0+';
}

export function getFTEColor(fte: number): string {
  if (fte < 0.5) return '#22c55e';   // green — low utilization
  if (fte < 0.75) return '#3b82f6';  // blue — healthy
  if (fte < 1.0) return '#f59e0b';   // amber — nearing limit
  return '#ef4444';                  // red — overloaded
}

const BAND_COLORS: Record<FTEBand, string> = {
  '0–0.25': '#86efac',
  '0.25–0.5': '#4ade80',
  '0.5–0.75': '#3b82f6',
  '0.75–1.0': '#f59e0b',
  '1.0+': '#ef4444',
};

const ALL_BANDS: FTEBand[] = ['0–0.25', '0.25–0.5', '0.5–0.75', '0.75–1.0', '1.0+'];

type FTEEntry = { label: string; fte: number };

interface FTEBandChartProps {
  data: FTEEntry[];
  title?: string;
  height?: number;
}

/**
 * FTEBandChart — Shows distribution of FTE values across 5 bands.
 * Input: array of { label, fte } items.
 */
export function FTEBandChart({ data, title, height = 220 }: FTEBandChartProps) {
  const [selectedBand, setSelectedBand] = useState<FTEBand | null>(null);

  // Count entries per band
  const bandCounts = ALL_BANDS.map(band => {
    const items = data.filter(d => getFTEBand(d.fte) === band);
    return { band, count: items.length, items, color: BAND_COLORS[band] };
  });

  const max = Math.max(...bandCounts.map(b => b.count), 1);
  const fullFteCount = data.filter(d => d.fte >= 1.0).length;
  const underFteCount = data.filter(d => d.fte < 0.5).length;

  return (
    <div>
      {title && <p className="mb-2 text-sm font-semibold text-[#102846]">{title}</p>}
      <div className="rounded-xl border border-[#DCE7F4] bg-[#FAFCFF] px-3 py-3" style={{ minHeight: height }}>
        <div className="grid grid-cols-[92px_1fr_auto] items-center gap-2 text-[11px] font-semibold text-[#5F7898]">
          <span>Band</span>
          <span>Distribution</span>
          <span>Count</span>
        </div>
        <div className="mt-2 space-y-2">
          {bandCounts.map((entry) => {
            const widthPct = max > 0 ? Math.max((entry.count / max) * 100, entry.count > 0 ? 8 : 0) : 0;
            return (
              <button
                key={entry.band}
                type="button"
                onClick={() => setSelectedBand(entry.band)}
                title={`${entry.band}: ${entry.count} employees`}
                className="grid w-full grid-cols-[92px_1fr_auto] items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-[#F1F7FF]"
              >
                <span className="text-xs font-semibold text-[#4F6D91]">{entry.band}</span>
                <div className="h-5 rounded-md bg-[#E6EDF7] p-[2px]">
                  <div
                    className="h-full rounded-[4px] transition-all duration-300"
                    style={{
                      width: `${Math.min(widthPct, 100)}%`,
                      backgroundColor: entry.color,
                      opacity: selectedBand && selectedBand !== entry.band ? 0.35 : 1,
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-[#173E6B]">{entry.count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-[#7D93AE]">Click a band to view employee-level entries.</p>
      </div>

      <div className="mt-3 rounded-lg bg-[#F8FBFF] p-3 text-sm text-[#4B6889] border border-[#E3EBF7]">
        <p>
          <strong className="text-[#102846]">{fullFteCount} employees</strong> are working at full capacity (1.0+ FTE).{' '}
          <strong className="text-[#102846]">{underFteCount} employees</strong> are underutilized (below 0.5 FTE).
        </p>
      </div>

      {selectedBand && (
        <div className="mt-4 rounded-xl border border-[#D9E4F2] bg-white shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between border-b border-[#E3EBF7] bg-[#F9FBFF] px-4 py-2.5">
            <h4 className="text-sm font-bold text-[#102846]">Employees in {selectedBand} Band</h4>
            <button 
              onClick={() => setSelectedBand(null)}
              className="text-[#6E86A3] hover:text-[#102846] text-xs font-semibold"
            >
              Close
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white sticky top-0 border-b border-[#E3EBF7] z-10">
                <tr>
                  <th className="px-4 py-2 font-semibold text-[#6E86A3]">Employee Name</th>
                  <th className="px-4 py-2 font-semibold text-[#6E86A3] text-right">FTE Value</th>
                </tr>
              </thead>
              <tbody>
                {bandCounts.find(b => b.band === selectedBand)?.items.map((item, i) => (
                  <tr key={i} className="border-b border-[#F0F4F9] last:border-0 hover:bg-[#F8FBFF]">
                    <td className="px-4 py-2.5 font-medium text-[#102846]">{item.label}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#3B82F6]">{item.fte.toFixed(2)}</td>
                  </tr>
                ))}
                {bandCounts.find(b => b.band === selectedBand)?.items.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-4 text-center text-xs text-[#8BA0BA]">No employees in this band</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface FTEProgressBarProps {
  fte: number;
  label?: string;
  showValue?: boolean;
  height?: number;
}

/**
 * FTEProgressBar — Compact horizontal bar showing FTE utilization.
 * Color changes based on threshold.
 */
export function FTEProgressBar({ fte, label, showValue = true, height = 8 }: FTEProgressBarProps) {
  const pct = Math.min(fte * 100, 150); // Cap display at 150% for visual
  const color = getFTEColor(fte);
  const bgColor = fte >= 1.0 ? '#fef2f2' : fte >= 0.75 ? '#fffbeb' : '#f0fdf4';

  return (
    <div className="space-y-1">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="font-medium text-[#637F9F]">{label}</span>}
          {showValue && (
            <span className="font-bold" style={{ color }}>
              {fte.toFixed(2)} FTE ({(fte * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      )}
      <div className="relative w-full rounded-full overflow-hidden" style={{ height, backgroundColor: '#E5EBF6' }}>
        {/* Target line at 75% */}
        <div className="absolute top-0 bottom-0 w-px bg-[#3b82f6]/60" style={{ left: '75%', zIndex: 2 }} />
        {/* Full line at 100% */}
        <div className="absolute top-0 bottom-0 w-px bg-[#f59e0b]/80" style={{ left: '100%', zIndex: 2 }} />
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
        {/* Overflow indicator */}
        {fte > 1.0 && (
          <div className="absolute right-0 top-0 bottom-0 rounded-r-full" style={{ width: `${Math.min((fte - 1.0) * 100, 50)}%`, backgroundColor: '#ef4444', opacity: 0.4 }} />
        )}
      </div>
    </div>
  );
}
