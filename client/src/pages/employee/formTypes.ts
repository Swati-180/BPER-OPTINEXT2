export interface EmployeeSnapshot {
  employeeId: string;
  name: string;
  email: string;
  title: string;
  department: string;
  client: string;
  assignedClient: string;
  location: string;
  primaryTower: string;
  band: string;
  employeeType: string;
  supervisorName: string;
  supervisorTitle: string;
  maxMonthlyHours: number;
}

export interface ProcessSelection {
  majorProcess: string;
  process: string;
  subProcess: string;
  isMiscellaneous: boolean;
}

export interface WdtActivityRow {
  activityCategory?: "core" | "support";
  majorProcess: string;
  process: string;
  subProcess: string;
  frequency: string;
  volumesMonthly: number;
  timePerTransactionMinutes: number;
  timeTakenHoursPerMonth: number;
  applicationsUsed: string;
  comments: string;
  isAiMapped?: boolean;
  aiConfidence?: number;
  originalCustomInput?: string;
}

export interface WdtPayload {
  employee: EmployeeSnapshot;
  rows: WdtActivityRow[];
  processSelection?: ProcessSelection;
}