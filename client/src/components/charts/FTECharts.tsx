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

export type CapacityEntry = {
  label: string;
  fte: number;
  name?: string;
  employeeId?: string;
  totalHours?: number;
  capacityPct?: number;
};

interface FTEBandChartProps {
  data: CapacityEntry[];
  title?: string;
  height?: number;
}

/**
 * FTEBandChart / Employee Capacity Distribution Chart
 * Shows distribution of employees by capacity utilization, based on a 160-hour monthly baseline.
 */
export function FTEBandChart({ data, title, height = 220 }: FTEBandChartProps) {
  const [selectedBand, setSelectedBand] = useState<FTEBand | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const totalEligible = data.length;

  // Enrich data entries with capacityPct, hours, and clean name/employeeId
  const enrichedData = data.map(d => {
    let name = d.name;
    let employeeId = d.employeeId;
    if (!name || !employeeId) {
      const match = d.label.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        name = name || match[1].trim();
        employeeId = employeeId || match[2].trim();
      } else {
        name = name || d.label;
        employeeId = employeeId || '—';
      }
    }
    const fte = Number(d.fte) || 0;
    const totalHours = d.totalHours != null ? Number(d.totalHours) : Number((fte * 160).toFixed(2));
    const capacityPct = d.capacityPct != null ? Number(d.capacityPct) : Number((fte * 100).toFixed(1));
    return {
      label: d.label,
      fte,
      name,
      employeeId,
      totalHours,
      capacityPct,
    };
  });

  // Group entries by band
  const bandCounts = ALL_BANDS.map(band => {
    const items = enrichedData.filter(d => getFTEBand(d.fte) === band);
    const count = items.length;
    const pctOfTotal = totalEligible > 0 ? Number(((count / totalEligible) * 100).toFixed(1)) : 0;
    return {
      band,
      count,
      pctOfTotal,
      items,
      color: BAND_COLORS[band],
    };
  });

  const max = Math.max(...bandCounts.map(b => b.count), 1);
  const fullCapacityCount = enrichedData.filter(d => d.fte >= 1.0).length;
  const underCapacityCount = enrichedData.filter(d => d.fte < 0.5).length;
  const fullCapacityPct = totalEligible > 0 ? Number(((fullCapacityCount / totalEligible) * 100).toFixed(1)) : 0;
  const underCapacityPct = totalEligible > 0 ? Number(((underCapacityCount / totalEligible) * 100).toFixed(1)) : 0;

  // Selected band items and search filtering
  const activeBandData = selectedBand ? bandCounts.find(b => b.band === selectedBand) : null;
  const filteredItems = (activeBandData?.items || []).filter(item => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.employeeId.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSelectBand(band: FTEBand) {
    if (selectedBand === band) {
      setSelectedBand(null);
    } else {
      setSelectedBand(band);
      setSearchTerm('');
      setCurrentPage(1);
    }
  }

  return (
    <div>
      {title && <p className="mb-2 text-sm font-semibold text-[#102846]">{title}</p>}
      <div className="rounded-xl border border-[#DCE7F4] bg-[#FAFCFF] px-4 py-3.5" style={{ minHeight: height }}>
        <div className="grid grid-cols-[110px_1fr_160px] items-center gap-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5F7898]">
          <span>Capacity Band</span>
          <span>Distribution</span>
          <span className="text-right">Count & Share</span>
        </div>
        <div className="mt-2.5 space-y-2">
          {bandCounts.map((entry) => {
            const widthPct = max > 0 ? Math.max((entry.count / max) * 100, entry.count > 0 ? 8 : 0) : 0;
            const isSelected = selectedBand === entry.band;
            return (
              <button
                key={entry.band}
                type="button"
                onClick={() => handleSelectBand(entry.band)}
                title={`Click to view all ${entry.count} employee${entry.count === 1 ? '' : 's'} in ${entry.band} band`}
                className={`grid w-full grid-cols-[110px_1fr_160px] items-center gap-3 rounded-lg px-2 py-2 text-left transition-all ${
                  isSelected ? 'bg-[#EBF3FF] ring-1 ring-[#3B82F6]' : 'hover:bg-[#F1F7FF]'
                }`}
              >
                <span className="text-xs font-semibold text-[#324B6D]">{entry.band}</span>
                <div className="h-5.5 rounded-md bg-[#E6EDF7] p-[2px]">
                  <div
                    className="h-full rounded-[4px] transition-all duration-300"
                    style={{
                      width: `${Math.min(widthPct, 100)}%`,
                      backgroundColor: entry.color,
                      opacity: selectedBand && !isSelected ? 0.35 : 1,
                    }}
                  />
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="text-xs font-bold text-[#173E6B]">
                    {entry.count} employee{entry.count === 1 ? '' : 's'}
                  </span>
                  <span className="ml-1 text-[11px] font-medium text-[#6582A4]">
                    · {entry.pctOfTotal}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] text-[#7D93AE]">
          Click any band to view and search the complete list of employees.
        </p>
      </div>

      {/* Dynamic Capacity Distribution Summary */}
      <div className="mt-3 rounded-lg bg-[#F8FBFF] p-3 text-sm text-[#4B6889] border border-[#E3EBF7]">
        <p className="leading-relaxed">
          Distribution across <strong className="text-[#102846]">{totalEligible} distinct named employee{totalEligible === 1 ? '' : 's'}</strong> (excludes vacant positions):{' '}
          <strong className="text-[#102846]">{fullCapacityCount} employee{fullCapacityCount === 1 ? '' : 's'}</strong> ({fullCapacityPct}%) recorded activity effort at or exceeding the 160-hour monthly baseline (1.0+ FTE), while{' '}
          <strong className="text-[#102846]">{underCapacityCount} employee{underCapacityCount === 1 ? '' : 's'}</strong> ({underCapacityPct}%) are below 0.5 FTE.
        </p>
      </div>

      {/* Employee List Table */}
      {selectedBand && activeBandData && (
        <div className="mt-4 rounded-xl border border-[#D9E4F2] bg-white shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3EBF7] bg-[#F9FBFF] px-4 py-3">
            <div>
              <h4 className="text-sm font-bold text-[#102846]">
                Employees in {selectedBand} Capacity Band ({activeBandData.count})
              </h4>
              <p className="text-xs text-[#6A85A4]">
                Showing complete employee capacity details ({activeBandData.pctOfTotal}% of total population).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by name or ID..."
                className="h-8 rounded-lg border border-[#CCD8E8] bg-white px-2.5 text-xs text-[#102846] placeholder-[#90A5BF] outline-none focus:border-[#3B82F6]"
              />
              <button
                onClick={() => setSelectedBand(null)}
                className="rounded-lg border border-[#D0DDEE] bg-white px-2.5 py-1 text-xs font-semibold text-[#6E86A3] hover:bg-[#F2F6FB] hover:text-[#102846]"
              >
                Close
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FBFF] border-b border-[#E3EBF7] text-[#5E7998] uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-2.5">Employee ID</th>
                  <th className="px-4 py-2.5">Employee Name</th>
                  <th className="px-4 py-2.5 text-right">Total Hours</th>
                  <th className="px-4 py-2.5 text-right">FTE</th>
                  <th className="px-4 py-2.5 text-right">Capacity %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F9]">
                {pagedItems.map((item, i) => (
                  <tr key={`${item.employeeId}-${i}`} className="hover:bg-[#F8FBFF] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-medium text-[#496587]">{item.employeeId}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#102846]">
                      {item.name}
                      {item.totalHours > 160 && (
                        <span className="ml-2 inline-flex items-center rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                          &gt;160h Baseline
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#344E6F]">{item.totalHours.toFixed(2)} hrs</td>
                    <td className="px-4 py-2.5 text-right font-bold text-[#1E5EAB]">{item.fte.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-[#102846]">{item.capacityPct.toFixed(1)}%</td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-xs text-[#8BA0BA]">
                      {activeBandData.count === 0 ? 'No employees in this band' : 'No matching employees found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredItems.length > pageSize && (
            <div className="flex items-center justify-between border-t border-[#E3EBF7] bg-[#FAFCFF] px-4 py-2 text-xs text-[#5D7694]">
              <span>
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="rounded border border-[#CCD8E8] bg-white px-2 py-0.5 text-xs font-semibold text-[#254366] hover:bg-[#F0F4FA] disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-1 text-xs">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="rounded border border-[#CCD8E8] bg-white px-2 py-0.5 text-xs font-semibold text-[#254366] hover:bg-[#F0F4FA] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
