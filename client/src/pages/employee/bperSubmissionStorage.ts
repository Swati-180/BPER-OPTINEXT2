import type { EmployeeSnapshot, WdtPayload } from "./formTypes";
import { demoEmployeeProfile } from "./demoEmployeeData";
import { API_BASE_URL } from "../../lib/config";

export type BperSubmissionStatus = "Under Review" | "Approved" | "Changes Requested";

export interface BperReviewEvent {
  reviewedAt: string;
  managerName: string;
  status: BperSubmissionStatus;
  comment: string;
}

export interface BperSubmissionRecord {
  referenceId: string;
  submittedAt: string;
  month: number;
  year: number;
  status: BperSubmissionStatus;
  employee: EmployeeSnapshot;
  payload: WdtPayload;
  totalHours: number;
  coreCount: number;
  supportCount: number;
  pendingFrom: string;
  reviewHistory: BperReviewEvent[];
}

const STORAGE_KEY = "bper.employee.submissions";
const ACTIVE_UNDER_REVIEW_KEY = "bper.employee.activeUnderReviewRef";
const DRAFT_KEY = "bper.employee.formDraft";

async function readJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return response.json().catch(() => null);
}

function emitDataUpdatedEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('bper:data-updated'));
}

export async function saveBperDraft(payload: WdtPayload | null) {
  if (typeof window === "undefined") return;
  if (!payload) {
    window.localStorage.removeItem(DRAFT_KEY);
  } else {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }
}

export function loadBperDraft(): WdtPayload | null {
  if (typeof window === "undefined") return null;
  const draft = window.localStorage.getItem(DRAFT_KEY);
  if (!draft) return null;
  try {
    return JSON.parse(draft);
  } catch {
    return null;
  }
}

const DEFAULT_MANAGER_NAME = "QG User2";

const seededRecords: BperSubmissionRecord[] = [
  {
    referenceId: "BPER-1004-6AGZI",
    submittedAt: "2025-10-20T09:00:00.000Z",
    month: 10,
    year: 2025,
    status: "Changes Requested",
    employee: {
      ...demoEmployeeProfile,
      supervisorName: DEFAULT_MANAGER_NAME,
      supervisorTitle: "Manager",
    },
    payload: {
      employee: {
        ...demoEmployeeProfile,
        supervisorName: DEFAULT_MANAGER_NAME,
        supervisorTitle: "Manager",
      },
      rows: [
        {
          activityCategory: "core",
          majorProcess: "Accounts Payable",
          process: "Invoice Processing",
          subProcess: "Validation and Posting",
          frequency: "Daily",
          volumesMonthly: 840,
          timePerTransactionMinutes: 2.57,
          timeTakenHoursPerMonth: 36,
          applicationsUsed: "SAP",
          comments: "Existing baseline submission used for demo workflow.",
        },
      ],
    },
    totalHours: 36,
    coreCount: 1,
    supportCount: 0,
    pendingFrom: DEFAULT_MANAGER_NAME,
    reviewHistory: [
      {
        reviewedAt: "2025-10-20T15:10:00.000Z",
        managerName: DEFAULT_MANAGER_NAME,
        status: "Changes Requested",
        comment: "Please refine the time split for invoice validation and add clearer process-control comments before resubmission.",
      },
    ],
  },
];

export function buildBperSubmission(payload: WdtPayload, profile?: EmployeeSnapshot, existingRefId?: string): BperSubmissionRecord {
  const emp = profile || payload.employee;
  const totalHours = payload.rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0);
  const coreCount = payload.rows.filter((row) => row.activityCategory !== "support").length;
  const supportCount = payload.rows.filter((row) => row.activityCategory === "support").length;
  const now = new Date();
  const submittedAt = now.toISOString();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const referenceId = existingRefId || `BPER-${emp.employeeId || "NEW"}-${Date.now().toString().slice(-5)}`;

  return {
    referenceId,
    submittedAt,
    month,
    year,
    status: "Under Review",
    employee: emp,
    payload: { ...payload, employee: emp },
    totalHours,
    coreCount,
    supportCount,
    pendingFrom: DEFAULT_MANAGER_NAME,
    reviewHistory: [],
  };
}

export async function loadBperSubmissions(): Promise<BperSubmissionRecord[]> {
  try {
    const token = localStorage.getItem('bper.auth.token');
    const response = await fetch(`${API_BASE_URL}/api/wdt/submissions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await readJson<BperSubmissionRecord[]>(response);
    return response.ok ? (Array.isArray(data) ? data : []) : [];
  } catch (error) {
    console.error('Failed to load submissions:', error);
    return [];
  }
}

export async function saveBperSubmission(record: BperSubmissionRecord) {
  try {
    const token = localStorage.getItem('bper.auth.token');
    const response = await fetch(`${API_BASE_URL}/api/wdt/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(record)
    });
    
    if (!response.ok) {
      const errorData = await readJson<{ message?: string }>(response);
      throw new Error(errorData?.message || `Server error: ${response.status}`);
    }
    
    const data = await readJson<{ referenceId?: string }>(response);
    if (typeof window !== 'undefined') {
      if (data?.referenceId) {
        window.localStorage.setItem(ACTIVE_UNDER_REVIEW_KEY, data.referenceId);
      }
    }
    emitDataUpdatedEvent();
    return data;
  } catch (error: any) {
    console.error('Failed to save submission:', error);
    throw error;
  }
}

export function getLatestBperSubmission() {
  return loadBperSubmissions()[0] || null;
}

export function formatBperSubmittedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" });
}

export function formatDateISO(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

export function getActiveUnderReviewReferenceId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_UNDER_REVIEW_KEY);
}

export function clearActiveUnderReviewReferenceId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_UNDER_REVIEW_KEY);
}

export async function applyManagerReviewToSubmission(input: {
  referenceId: string;
  status: "Approved" | "Changes Requested" | "Grant Edit";
  comment: string;
  managerName?: string;
}) {
  try {
    const token = localStorage.getItem('bper.auth.token');
    const response = await fetch(`${API_BASE_URL}/api/wdt/submissions/${input.referenceId}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: input.status,
        comment: input.comment,
        managerName: input.managerName || "Manager"
      })
    });
    
    if (response.ok) {
      clearActiveUnderReviewReferenceId();
      const updated = await readJson<BperSubmissionRecord>(response);
      emitDataUpdatedEvent();
      return updated;
    }
  } catch (error) {
    console.error('Failed to update submission:', error);
    return null;
  }
}

export async function resetEmployeeReviewQueueToSinglePending(input: {
  employeeId: string;
  payload: WdtPayload;
}) {
  if (typeof window === "undefined") return null;

  const records = await loadBperSubmissions();
  const pending = buildBperSubmission(input.payload);

  const next = [pending, ...records.filter((record) => record.employee.employeeId !== input.employeeId)];

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.localStorage.setItem(ACTIVE_UNDER_REVIEW_KEY, pending.referenceId);

  return pending;
}

function normalizeRecord(value: unknown): BperSubmissionRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<BperSubmissionRecord> & { status?: string; reviewHistory?: BperReviewEvent[] };

  if (!record.referenceId || !record.submittedAt || !record.employee || !record.payload) return null;

  const normalizedStatus: BperSubmissionStatus =
    record.status === "Approved" || record.status === "Changes Requested"
      ? record.status
      : "Under Review";

  const normalizedHistory = Array.isArray(record.reviewHistory)
    ? record.reviewHistory.filter(
        (item) =>
          item &&
          typeof item.reviewedAt === "string" &&
          typeof item.managerName === "string" &&
          typeof item.comment === "string" &&
          (item.status === "Under Review" || item.status === "Approved" || item.status === "Changes Requested")
      )
    : [];

  return {
    referenceId: record.referenceId,
    submittedAt: record.submittedAt,
    status: normalizedStatus,
    employee: record.employee,
    payload: record.payload,
    totalHours: Number(record.totalHours || 0),
    coreCount: Number(record.coreCount || 0),
    supportCount: Number(record.supportCount || 0),
    pendingFrom:
      typeof record.pendingFrom === "string" && record.pendingFrom.trim().length > 0
        ? record.pendingFrom
        : normalizedStatus === "Under Review"
          ? DEFAULT_MANAGER_NAME
          : "NA",
    month: Number(record.month || 0),
    year: Number(record.year || 0),
    reviewHistory: normalizedHistory,
  };
}

function sortBySubmittedAtDesc(records: BperSubmissionRecord[]) {
  return [...records].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

function retainLatestUnderReview(records: BperSubmissionRecord[]) {
  let seenUnderReview = false;

  return records.filter((record) => {
    if (record.status !== "Under Review") return true;
    if (seenUnderReview) return false;
    seenUnderReview = true;
    return true;
  });
}