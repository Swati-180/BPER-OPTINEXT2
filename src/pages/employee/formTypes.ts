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
}

export interface WdtActivityRow {
  activityCategory?: "core" | "support";
  majorProcess: string;
  process: string;
  subProcess: string;
  frequency: string;
  volumesMonthly: number;
  timeTakenHoursPerMonth: number;
  applicationsUsed: string;
  comments: string;
}

export interface WdtPayload {
  employee: EmployeeSnapshot;
  rows: WdtActivityRow[];
}