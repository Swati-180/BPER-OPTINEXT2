import React from 'react';
import { FileCheck2, Users, Clock3, Check, ArrowRight } from 'lucide-react';

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper?: string;
  highlight?: boolean;
}

export function KpiCard({ icon: Icon, label, value, helper, highlight }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-3.5 transition-all shadow-xs ${
        highlight
          ? 'border-[#BFDBFE] bg-gradient-to-br from-[#EFF6FF] via-white to-[#F0F7FF]'
          : 'border-[#E1EAF5] bg-white hover:border-[#CBD5E1]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${highlight ? 'bg-[#DBEAFE] text-[#1E40AF]' : 'bg-[#F1F5F9] text-[#475569]'}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-black tracking-tight ${highlight ? 'text-[#1E3A8A]' : 'text-[#0F172A]'}`}>{value}</span>
      </div>
      {helper && <p className="mt-1 text-[11px] text-[#64748B] truncate">{helper}</p>}
    </div>
  );
}

export interface StandardDashboardSummary {
  totalSubmissions?: number;
  totalStaff?: number;
  totalEmployees?: number;
  vacantPositions?: number;
  pendingReview?: number;
  inScopeTargetHeadcount?: number;
  staffedFte?: number;
  primaryEmployeeFte?: number;
  staffedHours?: number;
  vacantFte?: number;
  vacantHours?: number;
  totalFte?: number;
  workloadVsTargetPct?: number;
  totalHours?: number;
  baselineHoursPerMonth?: number;
  submissionParticipants?: {
    namedStaff: number;
    vacancies: number;
    total: number;
  };
  completeness?: {
    inScopeHeadcount?: number;
    filledSubmitted?: number;
    vacantSubmitted?: number;
    staffedFte?: number;
    vacantFte?: number;
    totalFte?: number;
    baselineHoursPerMonth?: number;
  };
}

interface StandardDashboardSectionsProps {
  summary: StandardDashboardSummary;
  roleLabel?: string;
  isEmpty?: boolean;
}

export function StandardWorkforceSummaryKpis({ summary, roleLabel = 'Admin', isEmpty = false }: StandardDashboardSectionsProps) {
  const totalPositions = isEmpty ? 0 : Number(summary.totalSubmissions || 0);
  const filledEmployees = isEmpty ? 0 : Number(summary.totalStaff != null ? summary.totalStaff : (summary.totalEmployees || 0));
  const vacantPositions = isEmpty ? 0 : Number(summary.vacantPositions || 0);
  const pendingReview = isEmpty ? 0 : Number(summary.pendingReview || 0);

  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Total Workforce Positions */}
      <KpiCard
        icon={FileCheck2}
        label="Total Workforce Positions"
        value={String(totalPositions)}
        helper={
          isEmpty
            ? '0 filled positions + 0 vacant positions'
            : `${filledEmployees} filled positions + ${vacantPositions} vacant positions`
        }
      />

      {/* 2. Employees in Filled Positions */}
      <KpiCard
        icon={Users}
        label="Employees in Filled Positions"
        value={String(filledEmployees)}
        helper={isEmpty ? 'No employee records imported' : 'Employees currently occupying positions'}
      />

      {/* 3. Open Vacant Positions */}
      <KpiCard
        icon={Users}
        label="Open Vacant Positions"
        value={String(vacantPositions)}
        helper={isEmpty ? '0 unfilled positions' : 'Budgeted positions that are currently unfilled'}
      />

      {/* 4. Submissions Awaiting Review */}
      <KpiCard
        icon={Clock3}
        label="Submissions Awaiting Review"
        value={String(pendingReview)}
        helper={
          pendingReview > 0
            ? `Workforce submissions waiting for ${roleLabel.toLowerCase()} action`
            : 'Workforce submissions currently waiting for review or approval'
        }
      />
    </div>
  );
}

export function StandardFteReconciliationSection({ summary, isEmpty = false }: StandardDashboardSectionsProps) {
  const staffedFte = isEmpty ? 0 : Number(summary.staffedFte != null ? summary.staffedFte : (summary.primaryEmployeeFte || 0));
  const staffedHours = isEmpty ? 0 : Number(summary.staffedHours || 0);
  const vacantFte = isEmpty ? 0 : Number(summary.vacantFte || 0);
  const vacantHours = isEmpty ? 0 : Number(summary.vacantHours || 0);
  const totalFte = isEmpty ? 0 : Number(summary.totalFte != null ? summary.totalFte : staffedFte + vacantFte);
  const totalHours = isEmpty ? 0 : Number(summary.totalHours || staffedHours + vacantHours);
  const filledCount = isEmpty ? 0 : Number(summary.totalStaff != null ? summary.totalStaff : (summary.totalEmployees || 0));
  const vacantCount = isEmpty ? 0 : Number(summary.vacantPositions || 0);
  const baselineHours = summary.completeness?.baselineHoursPerMonth || summary.baselineHoursPerMonth || 160;

  return (
    <div className="mt-3.5 rounded-xl border border-[#DCE7F5] bg-gradient-to-r from-[#F7FAFE] via-white to-[#F7FAFE] p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3EDF9] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#EEF5FF] border border-[#BFD5F2]">
            <Check className="h-3.5 w-3.5 text-[#1E5EAB]" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#102B52]">Workforce Workload Breakdown</h4>
            <p className="text-[10px] text-[#607D9E]">
              Understand how workload is distributed between filled and vacant positions and how it contributes to total workforce demand.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-lg border border-[#CDE0F7] bg-[#EEF5FF] px-2.5 py-0.5 text-[10px] font-bold text-[#1E5EAB]">
          {isEmpty
            ? 'Total Workload: 0.00 FTE · 0.00 Monthly Hours'
            : `Total Workload: ${totalFte.toFixed(2)} FTE · ${totalHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Monthly Hours`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
        {/* 1. Staffed Workload */}
        <div className="rounded-lg bg-white border border-[#E1EAF5] p-3.5 shadow-xs flex flex-col justify-between text-left">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B85A5]">1. Staffed Workload</p>
              <span className="text-[10px] font-semibold text-[#1D4ED8] bg-[#EFF6FF] px-1.5 py-0.5 rounded border border-[#BFDBFE]">
                {filledCount} Filled Positions
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#1D4ED8]">{staffedFte.toFixed(2)}</span>
              <span className="text-xs font-bold text-[#60A5FA]">FTE</span>
            </div>
            <p className="text-xs font-medium text-[#1E40AF] mt-0.5">
              {staffedHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} workload hours
            </p>
          </div>
          <p className="text-[11px] text-[#475569] mt-3 border-t border-[#F1F5F9] pt-2">
            Workload associated with {filledCount} filled positions ({staffedHours.toLocaleString()}h / {baselineHours}h monthly standard).
          </p>
        </div>

        {/* 2. Vacant Position Workload */}
        <div className="rounded-lg bg-white border border-[#E1EAF5] p-3.5 shadow-xs flex flex-col justify-between text-left">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B85A5]">2. Vacant Position Workload</p>
              <span className="text-[10px] font-semibold text-[#D97706] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                {vacantCount} Vacant Positions
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#D97706]">{vacantFte.toFixed(2)}</span>
              <span className="text-xs font-bold text-[#FBBF24]">FTE</span>
            </div>
            <p className="text-xs font-medium text-[#B45309] mt-0.5">
              {vacantHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} workload hours
            </p>
          </div>
          <p className="text-[11px] text-[#475569] mt-3 border-t border-[#F1F5F9] pt-2">
            Workload allocated to {vacantCount} vacant positions ({vacantHours.toLocaleString()}h / {baselineHours}h monthly standard).
          </p>
        </div>

        {/* 3. Total Workload */}
        <div className="rounded-lg bg-white border border-[#BFDBFE] p-3.5 shadow-xs bg-gradient-to-b from-[#EFF6FF] to-white flex flex-col justify-between text-left">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E40AF]">3. Total Workload</p>
              <span className="text-[10px] font-semibold text-[#1E3A8A] bg-[#DBEAFE] px-1.5 py-0.5 rounded border border-[#93C5FD]">
                {isEmpty ? '0 Positions' : `${filledCount + vacantCount} Combined Positions`}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#1E3A8A]">{totalFte.toFixed(2)}</span>
              <span className="text-xs font-bold text-[#3B82F6]">FTE</span>
            </div>
            <p className="text-xs font-medium text-[#1D4ED8] mt-0.5">
              {totalHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} workload hours
            </p>
          </div>
          <p className="text-[11px] text-[#1E3A8A] mt-3 border-t border-[#BFDBFE]/40 pt-2 font-medium">
            Combined workload: {staffedFte.toFixed(2)} FTE + {vacantFte.toFixed(2)} FTE = {totalFte.toFixed(2)} FTE across all positions.
          </p>
        </div>
      </div>
    </div>
  );
}
