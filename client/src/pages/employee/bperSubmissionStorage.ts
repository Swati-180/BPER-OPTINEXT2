import type { EmployeeSnapshot, WdtPayload } from "./formTypes";
import { demoEmployeeProfile } from "./demoEmployeeData";

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

const DEFAULT_MANAGER_NAME = "QG User2";

const seededRecords: BperSubmissionRecord[] = [
  {
    referenceId: "BPER-1004-6AGZI",
    submittedAt: "2025-10-20T09:00:00.000Z",
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

export function buildBperSubmission(payload: WdtPayload): BperSubmissionRecord {
  const totalHours = payload.rows.reduce((sum, row) => sum + Number(row.timeTakenHoursPerMonth || 0), 0);
  const coreCount = payload.rows.filter((row) => row.activityCategory !== "support").length;
  const supportCount = payload.rows.filter((row) => row.activityCategory === "support").length;
  const submittedAt = new Date().toISOString();
  const referenceId = `BPER-${payload.employee.employeeId}-${Date.now().toString().slice(-5)}`;

  return {
    referenceId,
    submittedAt,
    status: "Under Review",
    employee: payload.employee,
    payload,
    totalHours,
    coreCount,
    supportCount,
    pendingFrom: DEFAULT_MANAGER_NAME,
    reviewHistory: [],
  };
}

export function loadBperSubmissions(): BperSubmissionRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seededRecords));
      return seededRecords;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return seededRecords;

    const normalized = parsed.map(normalizeRecord).filter((item): item is BperSubmissionRecord => item !== null);
    const hasSeeded = normalized.some((item) => item.referenceId === seededRecords[0].referenceId);
    const next = hasSeeded ? normalized : [...normalized, ...seededRecords];
    const cleaned = retainLatestUnderReview(sortBySubmittedAtDesc(next));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return seededRecords;
  }
}

export function saveBperSubmission(record: BperSubmissionRecord) {
  if (typeof window === "undefined") return;

  const existing = loadBperSubmissions();
  const next = [
    record,
    ...existing.filter((item) => item.referenceId !== record.referenceId && item.status !== "Under Review"),
  ];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.localStorage.setItem(ACTIVE_UNDER_REVIEW_KEY, record.referenceId);
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

export function applyManagerReviewToSubmission(input: {
  referenceId: string;
  status: "Approved" | "Changes Requested";
  comment: string;
  managerName?: string;
}) {
  if (typeof window === "undefined") return null;

  const records = loadBperSubmissions();
  const managerName = input.managerName?.trim() || DEFAULT_MANAGER_NAME;
  const comment = input.comment.trim();
  const reviewedAt = new Date().toISOString();

  let updatedRecord: BperSubmissionRecord | null = null;

  const next = records.map((record) => {
    if (record.referenceId !== input.referenceId) return record;

    updatedRecord = {
      ...record,
      status: input.status,
      pendingFrom: "NA",
      reviewHistory: [
        {
          reviewedAt,
          managerName,
          status: input.status,
          comment:
            comment ||
            (input.status === "Approved"
              ? "Submission approved by manager."
              : "Changes requested. Please revise and resubmit."),
        },
        ...record.reviewHistory,
      ],
    };

    return updatedRecord;
  });

  if (!updatedRecord) return null;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  clearActiveUnderReviewReferenceId();

  return updatedRecord;
}

export function resetEmployeeReviewQueueToSinglePending(input: {
  employeeId: string;
  payload: WdtPayload;
}) {
  if (typeof window === "undefined") return null;

  const records = loadBperSubmissions();
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