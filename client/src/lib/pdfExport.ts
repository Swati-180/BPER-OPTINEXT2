import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const GAP = 5;

export interface ExportTimings {
  cloningMs: number;
  sectionCapturesMs: Record<string, number>;
  totalCaptureMs: number;
  pdfLayoutAndConversionMs: number;
  pdfSaveMs: number;
  totalExportMs: number;
}

// Global hook for performance monitoring
declare global {
  interface Window {
    __lastPdfExportTimings?: ExportTimings;
  }
}

async function capture(el: HTMLElement, pixelRatio = 2): Promise<string> {
  return toPng(el, { quality: 1, pixelRatio, cacheBust: true });
}

interface PdfCursor {
  value: number;
}

function addImage(pdf: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  pdf.addImage(dataUrl, 'PNG', x, y, w, h);
}

async function placeImage(pdf: jsPDF, dataUrl: string, cursor: PdfCursor, gap?: number): Promise<void> {
  const props = pdf.getImageProperties(dataUrl);
  const w = CONTENT_W;
  const h = (props.height / props.width) * w;

  if (cursor.value + h > PAGE_H - MARGIN) {
    if (cursor.value > MARGIN) {
      pdf.addPage();
      cursor.value = MARGIN;
    }
  }

  addImage(pdf, dataUrl, MARGIN, cursor.value, w, h);
  cursor.value += h + (gap ?? GAP);
}

function createIsolatedCaptureClone(original: HTMLElement): { clone: HTMLElement; cleanup: () => void } {
  const rect = original.getBoundingClientRect();
  const clone = original.cloneNode(true) as HTMLElement;

  clone.style.position = 'fixed';
  clone.style.left = '-9999px';
  clone.style.top = '0px';
  clone.style.width = `${rect.width > 0 ? rect.width : original.offsetWidth}px`;
  clone.style.zIndex = '-9999';
  clone.style.pointerEvents = 'none';

  for (const btn of clone.querySelectorAll<HTMLElement>('button')) {
    const text = btn.textContent?.toLowerCase() ?? '';
    const hasDownloadIcon = btn.querySelector('.lucide-download') !== null;
    const isExportBtn = text.includes('pdf') || text.includes('word') || text.includes('excel') || text.includes('exporting') || text.includes('generating');
    if (hasDownloadIcon || isExportBtn) {
      btn.style.display = 'none';
    }
  }

  const scrollEls = clone.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"], [class*="overflow-auto"]');
  for (const el of scrollEls) {
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
    el.style.height = 'auto';

    let parent = el.parentElement;
    while (parent && parent !== clone) {
      parent.style.height = 'auto';
      parent.style.maxHeight = 'none';
      parent = parent.parentElement;
    }
  }

  document.body.appendChild(clone);

  return {
    clone,
    cleanup: () => {
      try {
        if (clone.parentNode) {
          clone.parentNode.removeChild(clone);
        }
      } catch (err) {
        console.warn('Error cleaning up capture clone:', err);
      }
    },
  };
}

export async function exportDashboardPdf(sections: {
  header: HTMLElement | null;
  chartsRow: HTMLElement | null;
  fteBand: HTMLElement | null;
  activitiesUtilization: HTMLElement | null;
  consolidation: HTMLElement | null;
  recentReviews?: HTMLElement | null;
}): Promise<void> {
  const tStart = performance.now();
  const entries = (
    Object.entries(sections) as [string, HTMLElement | null][]
  ).filter(([, el]) => el !== null) as [string, HTMLElement][];

  const clonedEntries: Array<{ key: string; clone: HTMLElement; cleanup: () => void }> = [];

  const timings: ExportTimings = {
    cloningMs: 0,
    sectionCapturesMs: {},
    totalCaptureMs: 0,
    pdfLayoutAndConversionMs: 0,
    pdfSaveMs: 0,
    totalExportMs: 0,
  };

  try {
    const tCloneStart = performance.now();
    for (const [key, el] of entries) {
      clonedEntries.push({ key, ...createIsolatedCaptureClone(el) });
    }
    timings.cloningMs = Math.round(performance.now() - tCloneStart);

    const tCapturesStart = performance.now();
    const captures = await Promise.all(
      clonedEntries.map(async ({ key, clone }) => {
        const tSecStart = performance.now();
        const dataUrl = await capture(clone);
        timings.sectionCapturesMs[key] = Math.round(performance.now() - tSecStart);
        return { key, dataUrl };
      })
    );
    timings.totalCaptureMs = Math.round(performance.now() - tCapturesStart);

    const tPdfStart = performance.now();
    const map = new Map(captures.map((c) => [c.key, c.dataUrl]));
    const cursor: PdfCursor = { value: MARGIN };
    const pdf = new jsPDF('p', 'mm', 'a4');

    const headerImg = map.get('header');
    if (headerImg) {
      await placeImage(pdf, headerImg, cursor);
    }

    const chartsRowImg = map.get('chartsRow');
    if (chartsRowImg) {
      await placeImage(pdf, chartsRowImg, cursor);
    }

    cursor.value = PAGE_H;
    const gap2 = 2;
    const fteBandImg = map.get('fteBand');
    if (fteBandImg) {
      await placeImage(pdf, fteBandImg, cursor, gap2);
    }

    const activitiesUtilizationImg = map.get('activitiesUtilization');
    if (activitiesUtilizationImg) {
      await placeImage(pdf, activitiesUtilizationImg, cursor, gap2);
    }

    const consolidationImg = map.get('consolidation');
    if (consolidationImg) {
      await placeImage(pdf, consolidationImg, cursor, gap2);
    }

    const recentReviewsImg = map.get('recentReviews');
    if (recentReviewsImg) {
      await placeImage(pdf, recentReviewsImg, cursor, gap2);
    }
    timings.pdfLayoutAndConversionMs = Math.round(performance.now() - tPdfStart);

    const tSaveStart = performance.now();
    pdf.save('Manager-Dashboard-Report.pdf');
    timings.pdfSaveMs = Math.round(performance.now() - tSaveStart);

    timings.totalExportMs = Math.round(performance.now() - tStart);
    if (typeof window !== 'undefined') {
      window.__lastPdfExportTimings = timings;
    }
    console.log('[PDF_PROFILER_TIMINGS]', JSON.stringify(timings));
  } finally {
    for (const item of clonedEntries) {
      item.cleanup();
    }
  }
}

export async function exportChartPdf(el: HTMLElement, filename: string): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const dataUrl = await capture(el, 4);
  const props = pdf.getImageProperties(dataUrl);
  const w = CONTENT_W;
  const h = (props.height / props.width) * w;
  const maxH = PAGE_H - MARGIN * 2;

  let imgW = w;
  let imgH = h;
  if (h > maxH) {
    imgH = maxH;
    imgW = (imgH / h) * w;
  }

  const y = Math.max(MARGIN, (PAGE_H - imgH) / 2);
  const x = MARGIN + (CONTENT_W - imgW) / 2;

  addImage(pdf, dataUrl, x, y, imgW, imgH);
  pdf.save(`${filename}.pdf`);
}
