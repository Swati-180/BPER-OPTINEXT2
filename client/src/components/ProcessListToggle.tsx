import { useState } from 'react';
import { ChevronDown, ChevronUp, List } from 'lucide-react';

interface ProcessRow {
  subProcess?: string;
  process?: string;
  majorProcess?: string;
  activityCategory?: string;
  timeTakenHoursPerMonth?: number | string;
  frequency?: string;
  volumesMonthly?: number | string;
  applicationsUsed?: string;
  comments?: string;
  [key: string]: unknown;
}

interface ProcessListToggleProps {
  rows: ProcessRow[];
  title: string;
  accentColor?: string;        // border-left color
  defaultCollapsed?: boolean;  // default: collapsed if >5 rows
  showFTE?: boolean;
  onEdit?: () => void;
  editLabel?: string;
}

/**
 * ProcessListToggle — Collapsible/expandable process list.
 * Collapsed: shows summary card with row count and total hours.
 * Expanded: full table with FTE per row.
 */
export function ProcessListToggle({
  rows,
  title,
  accentColor = '#165BAA',
  defaultCollapsed,
  showFTE = true,
  onEdit,
  editLabel = 'Edit',
}: ProcessListToggleProps) {
  const autoCollapse = defaultCollapsed !== undefined ? defaultCollapsed : rows.length > 5;
  const [collapsed, setCollapsed] = useState(autoCollapse);

  const totalHours = rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0);
  const totalFte = totalHours / 160;

  return (
    <div className="mb-6">
      {/* Section Header */}
      <div
        className="flex items-center justify-between mb-2 px-3 py-2 bg-slate-50 border-l-2"
        style={{ borderLeftColor: accentColor }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold text-slate-700 tracking-[0.2em] uppercase">{title}</h3>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              ✏ {editLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            {collapsed ? (
              <><List size={12} /> Show All</>
            ) : (
              <><ChevronUp size={12} /> Collapse</>
            )}
          </button>
        </div>
      </div>

      {/* Collapsed Summary */}
      {collapsed && rows.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Hours</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{totalHours.toFixed(1)}h</p>
            </div>
            {showFTE && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">FTE</p>
                <p className="text-lg font-bold text-blue-700 tabular-nums">{totalFte.toFixed(2)}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Activities</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{rows.length}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 border border-blue-200 rounded-lg px-2.5 py-1 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <ChevronDown size={12} /> Show All {rows.length} Rows
          </button>
        </div>
      )}

      {/* Expanded Table */}
      {!collapsed && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.18em] border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-2">Sub-Process / Activity</th>
                <th className="px-3 py-2 text-right">Hours/Month</th>
                {showFTE && <th className="px-3 py-2 text-right">FTE</th>}
                <th className="px-3 py-2 text-center hidden sm:table-cell">Frequency</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {rows.map((row, index) => {
                const h = Number(row.timeTakenHoursPerMonth || 0);
                const fte = h / 160;
                const fteColor = fte >= 1.0 ? 'text-red-600' : fte >= 0.75 ? 'text-amber-600' : 'text-blue-700';
                return (
                  <tr key={`${row.subProcess}-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-700">{row.subProcess || row.process || '—'}</p>
                      {row.process && row.subProcess && (
                        <p className="text-[11px] text-slate-400">{row.process}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                      {h.toFixed(1)}h
                    </td>
                    {showFTE && (
                      <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${fteColor}`}>
                        {fte.toFixed(3)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center text-[11px] text-slate-500 hidden sm:table-cell">
                      {row.frequency || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Totals</td>
                <td className="px-3 py-2 text-right font-bold text-slate-900 tabular-nums">{totalHours.toFixed(1)}h</td>
                {showFTE && <td className="px-3 py-2 text-right font-bold text-blue-700 tabular-nums">{totalFte.toFixed(3)}</td>}
                <td className="hidden sm:table-cell" />
              </tr>
            </tfoot>
          </table>
          {rows.length > 5 && (
            <div className="border-t border-slate-100 bg-white px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <ChevronUp size={11} /> Collapse List
              </button>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">
          No {title.toLowerCase()} entries.
        </div>
      )}
    </div>
  );
}

export default ProcessListToggle;
