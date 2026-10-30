import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
} from 'docx';

interface DashboardWordReportOptions {
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
  };
  towers: Array<{
    tower: string;
    fte: number;
    hours?: number;
  }>;
  topActivities: Array<{
    name: string;
    tower: string;
    monthlyHours: number;
    fte: number;
    consolidate?: boolean;
  }>;
  teamUtilization?: Array<{
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
  };
}

const PRIMARY_COLOR = '0F2649';
const ACCENT_COLOR = '1E5EA9';
const LIGHT_BG = 'F4F7FB';
const BORDER_COLOR = 'D9E4F2';

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];

function createHeaderCell(text: string, widthPct: number, align: AlignmentValue = AlignmentType.LEFT): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: PRIMARY_COLOR },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text,
            bold: true,
            color: 'FFFFFF',
            size: 18, // 9pt
            font: 'Arial',
          }),
        ],
      }),
    ],
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
  });
}

function createDataCell(
  text: string,
  widthPct: number,
  isAlt = false,
  align: AlignmentValue = AlignmentType.LEFT,
  bold = false,
  color = '244161'
): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: isAlt ? { type: ShadingType.SOLID, color: LIGHT_BG } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text,
            size: 18, // 9pt
            color,
            bold,
            font: 'Arial',
          }),
        ],
      }),
    ],
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
  });
}

export async function exportDashboardWord(options: DashboardWordReportOptions): Promise<void> {
  const { roleLabel, generatedAt, summary, towers, topActivities, teamUtilization, consolidation } = options;

  // 1. KPI Table (2 rows x 5 columns)
  const kpiLabels = [
    'Filled Employees',
    'Forms Submitted',
    'Pending Review',
    'Approved Submissions',
    'Staffed FTE',
  ];
  const kpiValues = [
    String(summary.totalStaff || summary.totalEmployees || 0),
    String(summary.totalSubmissions || 0),
    String(summary.pendingReview || 0),
    String(summary.approved || 0),
    `${(summary.staffedFte || 0).toFixed(2)} FTE`,
  ];
  const kpiSubtexts = [
    `${summary.totalStaff || 0} filled · ${summary.vacantPositions || 0} vacant`,
    '100% submission rate',
    summary.pendingReview ? 'Action needed' : 'Queue clear',
    'Review completed',
    `Staffed Util: ${(summary.staffedUtilizationPct || 0).toFixed(1)}%`,
  ];

  const kpiTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
    },
    rows: [
      new TableRow({
        children: kpiLabels.map((label) => createHeaderCell(label, 20, AlignmentType.CENTER)),
      }),
      new TableRow({
        children: kpiValues.map((val) =>
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: LIGHT_BG },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: val, bold: true, size: 24, color: ACCENT_COLOR, font: 'Arial' })],
              }),
            ],
            margins: { top: 120, bottom: 80, left: 100, right: 100 },
          })
        ),
      }),
      new TableRow({
        children: kpiSubtexts.map((sub) =>
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: sub, size: 15, color: '667085', font: 'Arial' })],
              }),
            ],
            margins: { top: 60, bottom: 100, left: 100, right: 100 },
          })
        ),
      }),
    ],
  });

  // 2. Tower Distribution Table (All 18 Towers)
  const totalTowerFte = towers.reduce((acc, t) => acc + (t.fte || 0), 0);
  const totalTowerHours = towers.reduce((acc, t) => acc + (t.hours || (t.fte || 0) * 160), 0);

  const towerRows = towers.map((t, idx) => {
    const hours = t.hours != null ? t.hours : (t.fte || 0) * 160;
    const sharePct = totalTowerFte > 0 ? ((t.fte / totalTowerFte) * 100).toFixed(1) : '0.0';
    return new TableRow({
      children: [
        createDataCell(String(idx + 1), 8, idx % 2 === 1, AlignmentType.CENTER),
        createDataCell(t.tower, 46, idx % 2 === 1, AlignmentType.LEFT, true),
        createDataCell(Math.round(hours).toLocaleString(), 18, idx % 2 === 1, AlignmentType.RIGHT),
        createDataCell(t.fte.toFixed(2), 14, idx % 2 === 1, AlignmentType.RIGHT, true, ACCENT_COLOR),
        createDataCell(`${sharePct}%`, 14, idx % 2 === 1, AlignmentType.RIGHT),
      ],
    });
  });

  // Tower Totals Row
  towerRows.push(
    new TableRow({
      children: [
        createDataCell('', 8, true),
        createDataCell(`Total (${towers.length} Functional Towers)`, 46, true, AlignmentType.LEFT, true),
        createDataCell(Math.round(totalTowerHours).toLocaleString(), 18, true, AlignmentType.RIGHT, true),
        createDataCell(totalTowerFte.toFixed(2), 14, true, AlignmentType.RIGHT, true, ACCENT_COLOR),
        createDataCell('100.0%', 14, true, AlignmentType.RIGHT, true),
      ],
    })
  );

  const towerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
    },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('#', 8, AlignmentType.CENTER),
          createHeaderCell('Functional Tower', 46),
          createHeaderCell('Workload Hours', 18, AlignmentType.RIGHT),
          createHeaderCell('FTE Allocation', 14, AlignmentType.RIGHT),
          createHeaderCell('% Portfolio', 14, AlignmentType.RIGHT),
        ],
      }),
      ...towerRows,
    ],
  });

  // 3. Top Activities Table
  const activityRows = topActivities.slice(0, 50).map((act, idx) => {
    return new TableRow({
      children: [
        createDataCell(String(idx + 1), 6, idx % 2 === 1, AlignmentType.CENTER),
        createDataCell(act.name, 48, idx % 2 === 1, AlignmentType.LEFT, false),
        createDataCell(act.tower, 24, idx % 2 === 1, AlignmentType.LEFT),
        createDataCell(act.monthlyHours.toFixed(1), 11, idx % 2 === 1, AlignmentType.RIGHT),
        createDataCell(act.fte.toFixed(2), 11, idx % 2 === 1, AlignmentType.RIGHT, true, ACCENT_COLOR),
      ],
    });
  });

  const activitiesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
    },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('#', 6, AlignmentType.CENTER),
          createHeaderCell('Activity Definition', 48),
          createHeaderCell('Tower', 24),
          createHeaderCell('Monthly Hours', 11, AlignmentType.RIGHT),
          createHeaderCell('FTE', 11, AlignmentType.RIGHT),
        ],
      }),
      ...activityRows,
    ],
  });

  // 4. Team Utilization Table
  const utilizationRows = (teamUtilization || []).map((team, idx) => {
    return new TableRow({
      children: [
        createDataCell(team.label, 50, idx % 2 === 1, AlignmentType.LEFT, true),
        createDataCell(team.totalHours != null ? team.totalHours.toFixed(1) : '-', 25, idx % 2 === 1, AlignmentType.RIGHT),
        createDataCell(`${team.utilizationPct.toFixed(1)}%`, 25, idx % 2 === 1, AlignmentType.RIGHT, true, ACCENT_COLOR),
      ],
    });
  });

  const utilizationTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
    },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('Department / Team', 50),
          createHeaderCell('Monthly Hours', 25, AlignmentType.RIGHT),
          createHeaderCell('Capacity Utilization', 25, AlignmentType.RIGHT),
        ],
      }),
      ...utilizationRows,
    ],
  });

  // 5. Document Assembly
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 in margins
          },
        },
        children: [
          // Header / Title Block
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: `${roleLabel} Executive Dashboard Report`,
                bold: true,
                size: 36, // 18pt
                color: PRIMARY_COLOR,
                font: 'Arial',
              }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on: ${new Date(generatedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })} | Enterprise Operational Intelligence`,
                size: 18,
                color: '667085',
                font: 'Arial',
              }),
            ],
            spacing: { after: 250 },
          }),

          // Section 1: Executive KPI Summary
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: '1. Executive KPI Summary',
                bold: true,
                size: 24, // 12pt
                color: PRIMARY_COLOR,
                font: 'Arial',
              }),
            ],
            spacing: { before: 200, after: 120 },
          }),
          kpiTable,

          // Section 2: Functional Tower Breakdown
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: `2. Functional Tower Breakdown (All ${towers.length} Towers)`,
                bold: true,
                size: 24,
                color: PRIMARY_COLOR,
                font: 'Arial',
              }),
            ],
            spacing: { before: 300, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Workload effort and FTE distribution across all ${towers.length} operational towers based on a 160-hour baseline:`,
                size: 18,
                color: '475467',
                font: 'Arial',
              }),
            ],
            spacing: { after: 150 },
          }),
          towerTable,

          // Section 3: Activities Breakdown
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: '3. Activities by FTE (Top Ranked Preview)',
                bold: true,
                size: 24,
                color: PRIMARY_COLOR,
                font: 'Arial',
              }),
            ],
            spacing: { before: 300, after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Ranked operational activities summary (showing top ${Math.min(50, topActivities.length)} of ${topActivities.length} distinct activity definitions):`,
                size: 18,
                color: '475467',
                font: 'Arial',
              }),
            ],
            spacing: { after: 150 },
          }),
          activitiesTable,

          // Section 4: Team Utilization Breakdown
          ...(teamUtilization && teamUtilization.length > 0
            ? [
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  children: [
                    new TextRun({
                      text: '4. Team Capacity & Utilization Breakdown',
                      bold: true,
                      size: 24,
                      color: PRIMARY_COLOR,
                      font: 'Arial',
                    }),
                  ],
                  spacing: { before: 300, after: 120 },
                }),
                utilizationTable,
              ]
            : []),

          // Section 5: Scenario & Consolidation Modeling
          ...(consolidation
            ? [
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  children: [
                    new TextRun({
                      text: '5. Platform Insights — Consolidation Modeling',
                      bold: true,
                      size: 24,
                      color: PRIMARY_COLOR,
                      font: 'Arial',
                    }),
                  ],
                  spacing: { before: 300, after: 120 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Candidate Activities Screened: ${consolidation.candidateActivities || 0} of ${consolidation.totalActivities || 0} | Scenario Saved FTE: ${(consolidation.savedFte || 0).toFixed(2)} FTE | Estimated Cost Impact: INR ${(consolidation.estimatedSavingsCr || 0).toFixed(2)} Cr (@ ${((consolidation.efficiencyPct || 0.35) * 100).toFixed(0)}% efficiency & ₹${consolidation.costPerFteLakhs || 10}L/FTE)`,
                      size: 18,
                      color: '475467',
                      font: 'Arial',
                    }),
                  ],
                  spacing: { after: 150 },
                }),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${roleLabel}-Dashboard-Report-${dateStr}.docx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
