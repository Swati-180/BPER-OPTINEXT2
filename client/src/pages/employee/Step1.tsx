import { ArrowLeft, ArrowRight } from "lucide-react";
import type { EmployeeSnapshot } from "./formTypes";

interface StepProps {
  employee: EmployeeSnapshot;
  windowStatus: any;
  onNext: () => void;
  onPrev: () => void;
}

export function Step1({ employee, windowStatus, onNext, onPrev }: StepProps) {
  const fieldClass = "space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3";
  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
  const valueClass = "text-[15px] font-medium text-slate-900";

  return (
    <div className="bg-white rounded-b-md border-x border-b border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 md:p-8 font-sans">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-2">Verified profile snapshot</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight">Employee Verification</h2>
          </div>
          <div className="max-w-md">
            {windowStatus && !windowStatus.isOpen ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                <p className="text-xs font-bold uppercase tracking-widest mb-1">Submission Window Closed</p>
                <p className="text-sm font-medium">Submissions open on the 20th. {windowStatus.message}.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed">
                Review your read-only profile before entering process data. These fields are pulled from master records.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 mb-10">
          <div className={fieldClass}>
            <p className={labelClass}>Employee ID</p>
            <p className={`${valueClass} break-all`}>{employee.employeeId}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Name</p>
            <p className={valueClass}>{employee.name}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Institutional Email</p>
            <p className={valueClass}>{employee.email}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Title</p>
            <p className={valueClass}>{employee.title}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Department</p>
            <p className={valueClass}>{employee.department}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Primary Location</p>
            <p className={valueClass}>{employee.location}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Primary Tower / Function</p>
            <p className={valueClass}>{employee.primaryTower}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Pay Band / Grade</p>
            <p className={valueClass}>Grade {employee.band}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Supervisor Name</p>
            <p className={valueClass}>{employee.supervisorName || "-"}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Supervisor Title</p>
            <p className={valueClass}>{employee.supervisorTitle || "-"}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Employee Type</p>
            <p className={valueClass}>{employee.employeeType}</p>
          </div>
          <div className={fieldClass}>
            <p className={labelClass}>Assigned Client</p>
            <p className={valueClass}>{employee.assignedClient}</p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Return to Dashboard
          </button>
          <button
            type="button"
            disabled={windowStatus && !windowStatus.isOpen}
            onClick={onNext}
            className={`font-semibold py-3 px-6 rounded-md transition-colors inline-flex items-center justify-center gap-2 shadow-sm ${
              windowStatus && !windowStatus.isOpen
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-700 hover:bg-blue-800 text-white"
            }`}
          >
            Confirm & Continue <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Step1;