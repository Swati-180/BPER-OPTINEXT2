import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const GAP = 5;

async function capture(el: HTMLElement, pixelRatio = 3): Promise<string> {
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

function prepareSection(root: HTMLElement): () => void {
  const saved: { node: HTMLElement; prop: string; value: string }[] = [];

  function save(node: HTMLElement, prop: string, value: string) {
    saved.push({ node, prop, value: (node.style as any)[prop] });
    (node.style as any)[prop] = value;
  }

  for (const btn of root.querySelectorAll<HTMLElement>('button')) {
    const icon = btn.querySelector('.lucide-download');
    if (!icon) continue;
    const text = btn.textContent?.toLowerCase() ?? '';
    if (text.includes('pdf') || text.includes('exporting')) {
      save(btn, 'display', 'none');
    }
  }

  const scrollEls = root.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"], [class*="overflow-auto"]');
  for (const el of scrollEls) {
    const cs = getComputedStyle(el);
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
      save(el, 'overflow', 'visible');
      if (cs.maxHeight !== 'none') save(el, 'maxHeight', 'none');
      let parent = el.parentElement;
      while (parent && parent !== root) {
        const pcs = getComputedStyle(parent);
        if (pcs.height !== 'auto' && pcs.height !== '0px') {
          save(parent, 'height', 'auto');
        }
        if (pcs.maxHeight !== 'none') {
          save(parent, 'maxHeight', 'none');
        }
        parent = parent.parentElement;
      }
    }
  }

  return () => {
    for (const s of saved) {
      (s.node.style as any)[s.prop] = s.value;
    }
  };
}

export async function exportDashboardPdf(sections: {
  header: HTMLElement | null;
  chartsRow: HTMLElement | null;
  fteBand: HTMLElement | null;
  activitiesUtilization: HTMLElement | null;
  consolidation: HTMLElement | null;
  recentReviews: HTMLElement | null;
}): Promise<void> {
  const entries = (
    Object.entries(sections) as [string, HTMLElement | null][]
  ).filter(([, el]) => el !== null) as [string, HTMLElement][];

  const restorers = entries.map(([, el]) => prepareSection(el));

  try {
    const captures = await Promise.all(
      entries.map(async ([key, el]) => {
        const dataUrl = await capture(el);
        return { key, dataUrl };
      })
    );

    const map = new Map(captures.map((c) => [c.key, c.dataUrl]));
    const cursor: PdfCursor = { value: MARGIN };
    const pdf = new jsPDF('p', 'mm', 'a4');

    await placeImage(pdf, map.get('header')!, cursor);
    await placeImage(pdf, map.get('chartsRow')!, cursor);

    cursor.value = PAGE_H;
    const gap2 = 2;
    const fteBandImg = map.get('fteBand');
    if (fteBandImg) {
      await placeImage(pdf, fteBandImg, cursor, gap2);
    }
    await placeImage(pdf, map.get('activitiesUtilization')!, cursor, gap2);
    await placeImage(pdf, map.get('consolidation')!, cursor, gap2);
    await placeImage(pdf, map.get('recentReviews')!, cursor, gap2);

    pdf.save('Manager-Dashboard-Report.pdf');
  } finally {
    for (const restore of restorers) {
      restore();
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
