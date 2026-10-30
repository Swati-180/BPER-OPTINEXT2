import * as XLSX from 'xlsx';

export interface DashboardExcelExportParams {
  roleLabel: string;
  generatedAt: string;
  summary: {
    totalEmployees?: number;
    totalStaff?: number;
    vacantPositions?: number;
    totalSubmissions?: number;
    pendingReview?: number;
    approved?: number;
    staffedFte?: number;
    totalFte?: number;
    staffedUtilizationPct?: number;
    workloadVsTargetPct?: number;
    avgUtilizationPct?: number;
  };
  towers: Array<{
    tower: string;
    fte: number;
    hours: number;
  }>;
  topActivities: Array<{
    name: string;
    tower?: string;
    monthlyHours: number;
    fte: number;
    consolidate?: boolean;
  }>;
  teamUtilization: Array<{
    label: string;
    totalHours?: number;
    fte?: number;
    utilizationPct: number;
  }>;
  consolidation?: {
    candidateActivities?: number;
    totalActivities?: number;
    savedFte?: number;
    estimatedSavingsCr?: number;
    efficiencyPct?: number;
    costPerFteLakhs?: number;
    screeningCriteria?: {
      highVolumeOnlyCount?: number;
      keywordOnlyCount?: number;
      overlapCount?: number;
      totalUniqueScreened?: number;
    };
    scenarioParameters?: {
      efficiencyFactor?: number;
      costPerFteLakhs?: number;
      standardMonthlyHours?: number;
      screeningThresholdHours?: number;
      screeningKeywords?: string[];
      isScenarioModel?: boolean;
    };
  };
}

export function exportDashboardExcel(params: DashboardExcelExportParams): void {
  const { summary, towers, topActivities, teamUtilization, consolidation, generatedAt } = params;

  const wb = XLSX.utils.book_new();

  // ----------------------------------------------------
  // Sheet 1: Executive KPIs
  // ----------------------------------------------------
  const kpiData = [
    ['Enterprise BPER Dashboard — Executive Summary'],
    [`Generated: ${new Date(generatedAt).toLocaleString()}`],
    [],
    ['Key Performance Indicator', 'Value', 'Unit / Details'],
    ['Filled In-Scope Headcount', summary.totalEmployees ?? summary.totalStaff ?? 0, 'Active Employees'],
    ['Vacant Positions', summary.vacantPositions ?? 0, 'Approved Vacancies'],
    ['Total Forms Submitted', summary.totalSubmissions ?? 0, 'Submissions'],
    ['Pending Reviews', summary.pendingReview ?? 0, summary.pendingReview ? 'Action Required' : 'Queue Clear'],
    ['Approved Submissions', summary.approved ?? 0, 'Verified Forms'],
    ['Staffed FTE Allocation', Number((summary.staffedFte ?? 0).toFixed(2)), 'FTE (Filled Workforce)'],
    ['Total Portfolio FTE', Number((summary.totalFte ?? 0).toFixed(2)), 'FTE (Total Workload / 160h)'],
    ['Staffed Capacity Utilization', `${Number((summary.staffedUtilizationPct ?? summary.avgUtilizationPct ?? 0).toFixed(1))}%`, 'Workload vs 160h standard capacity'],
    ['Workload vs Headcount Target', summary.workloadVsTargetPct ? `${Number(summary.workloadVsTargetPct.toFixed(1))}%` : 'N/A', 'Workforce Alignment'],
  ];
  const wsKpis = XLSX.utils.aoa_to_sheet(kpiData);
  wsKpis['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsKpis, 'Executive KPIs');

  // ----------------------------------------------------
  // Sheet 2: 18 Functional Towers
  // ----------------------------------------------------
  const totalFte = towers.reduce((acc, t) => acc + (Number(t.fte) || 0), 0);
  const totalHours = towers.reduce((acc, t) => acc + (Number(t.hours) || 0), 0);

  const towerRows: any[] = [
    ['Functional Tower Distribution (All 18 Functional Towers)'],
    [`Generated: ${new Date(generatedAt).toLocaleString()}`],
    [],
    ['#', 'Functional Tower', 'Monthly Workload Hours', 'FTE Allocation', '% Portfolio Share']
  ];

  towers.forEach((t, idx) => {
    const fteNum = Number(t.fte) || 0;
    const hrsNum = Number(t.hours) || 0;
    const sharePct = totalFte > 0 ? (fteNum / totalFte) * 100 : 0;
    towerRows.push([
      idx + 1,
      t.tower,
      hrsNum,
      Number(fteNum.toFixed(2)),
      `${sharePct.toFixed(1)}%`
    ]);
  });

  // Totals row
  towerRows.push([]);
  towerRows.push([
    '',
    'Total (18 Functional Towers)',
    totalHours,
    Number(totalFte.toFixed(2)),
    '100.0%'
  ]);

  const wsTowers = XLSX.utils.aoa_to_sheet(towerRows);
  wsTowers['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 24 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsTowers, '18 Functional Towers');

  // ----------------------------------------------------
  // Sheet 3: Top Activities
  // ----------------------------------------------------
  const activityRows: any[] = [
    ['Top Operational Activities Ranked by FTE Consumption'],
    [`Generated: ${new Date(generatedAt).toLocaleString()}`],
    [],
    ['Rank', 'Activity Description', 'Functional Tower', 'Monthly Hours', 'FTE Requirement', 'Consolidation Candidate']
  ];

  topActivities.forEach((act, idx) => {
    activityRows.push([
      idx + 1,
      act.name,
      act.tower || 'Unassigned',
      Number(act.monthlyHours.toFixed(1)),
      Number(act.fte.toFixed(2)),
      act.consolidate ? 'Candidate' : 'Standard'
    ]);
  });

  const wsActivities = XLSX.utils.aoa_to_sheet(activityRows);
  wsActivities['!cols'] = [{ wch: 8 }, { wch: 50 }, { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsActivities, 'Top Activities');

  // ----------------------------------------------------
  // Sheet 4: Department / Team Utilization
  // ----------------------------------------------------
  const teamRows: any[] = [
    ['Department & Team Capacity Utilization'],
    [`Generated: ${new Date(generatedAt).toLocaleString()}`],
    [],
    ['#', 'Department / Team Name', 'Monthly Workload Hours', 'FTE Equivalent', 'Capacity Utilization %']
  ];

  teamUtilization.forEach((team, idx) => {
    teamRows.push([
      idx + 1,
      team.label,
      team.totalHours != null ? Number(team.totalHours.toFixed(1)) : 'N/A',
      team.fte != null ? Number(team.fte.toFixed(2)) : 'N/A',
      `${Number(team.utilizationPct.toFixed(1))}%`
    ]);
  });

  const wsTeam = XLSX.utils.aoa_to_sheet(teamRows);
  wsTeam['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 24 }, { wch: 18 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsTeam, 'Team Utilization');

  // ----------------------------------------------------
  // Sheet 5: Consolidation & Assumptions
  // ----------------------------------------------------
  const consolidationRows: any[] = [
    ['Process Consolidation Platform (PCP) — Scenario Modeling & Assumptions'],
    [`Generated: ${new Date(generatedAt).toLocaleString()}`],
    [],
    ['Parameter / Dimension', 'Value', 'Operational Interpretation'],
    [
      'Screened Candidate Activities',
      consolidation?.candidateActivities ?? 0,
      `Activities meeting high-volume or cross-tower consolidation criteria out of ${consolidation?.totalActivities ?? 0} total`
    ],
    [
      'Potential FTE Optimization',
      `${Number((consolidation?.savedFte ?? 0).toFixed(2))} FTE`,
      'Estimated potential workload rationalization across target clusters'
    ],
    [
      'Estimated Annualized Cost Impact',
      `INR ${Number((consolidation?.estimatedSavingsCr ?? 0).toFixed(2))} Cr`,
      `Computed @ ₹${consolidation?.costPerFteLakhs ?? 10} Lakhs/FTE benchmark and ${((consolidation?.efficiencyPct ?? 0.35) * 100).toFixed(0)}% efficiency factor`
    ],
    [],
    ['Organizational Scenario Assumptions', 'Setting Value', 'Governance Baseline'],
    ['Standard Monthly Hours / FTE', consolidation?.scenarioParameters?.standardMonthlyHours ?? 160, '160 Hours (8h/day × 20 days)'],
    ['Consolidation Efficiency Factor', `${((consolidation?.efficiencyPct ?? 0.35) * 100).toFixed(0)}%`, '35% post-centralization automation and standardization rate'],
    ['Benchmark Cost Per FTE', `INR ${consolidation?.costPerFteLakhs ?? 10} Lakhs`, 'Annualized corporate cost assumption per resource'],
    ['High-Volume Screening Threshold', `${consolidation?.scenarioParameters?.screeningThresholdHours ?? 160} Hours/Month`, '1.0 FTE threshold for centralization candidates'],
    [
      'Screening Automation Keywords',
      (consolidation?.scenarioParameters?.screeningKeywords || ['reconciliation', 'reporting', 'processing', 'entry', 'verification', 'audit']).join(', '),
      'Standard pattern search terms for repetitive operational activities'
    ]
  ];

  const wsConsolidation = XLSX.utils.aoa_to_sheet(consolidationRows);
  wsConsolidation['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, wsConsolidation, 'Consolidation & Assumptions');

  // ----------------------------------------------------
  // Download workbook
  // ----------------------------------------------------
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Admin-Executive-Dashboard-${dateStr}.xlsx`);
}
