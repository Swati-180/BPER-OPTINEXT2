# Phase Updates: BPER OptiNext

## Phase 4: Connect Employee Process & Activity Dropdowns
**Status: COMPLETED**
- **Central Process Database**: A live taxonomy of work processes (Major Process → Process → Sub-Process) is now implemented in MongoDB Atlas.
- **Dynamic Dropdowns**: The Employee Form now fetches real-time suggestions from the backend instead of using hardcoded arrays.
- **Improved UX**: Sub-process suggestions filter automatically based on the selected parent process, ensuring high-quality data collection.
- **NLP Mapping Baseline**: The groundwork for Section 5.4 of the PRD is laid, as the form now supports both structured selection and natural language entries.

---

## Phase 5: Connect Employee WDT Submission Flow
**Status: IN PROGRESS (First Milestones Reached)**
- **Resubmission Flow**: Employees can now "Revise" forms that have a "Changes Requested" status. This loads the historical submission data back into the form wizard.
- **Autosave Drafts**: Implemented local storage persistence. If an employee's browser crashes or they refresh the page, their work-in-progress is automatically restored.
- **Manager-to-Employee Feedback**: The manager's review status now correctly triggers the visibility of the "Revise" button for the specific employee.
- **Single Submission Retrieval**: Added backend API support to fetch individual historical records by reference ID.

- **Manager Review Modal**: Added a formal confirmation dialog on the Manager Dashboard. Managers can now provide aggregated feedback when returning forms, including an automated summary of flagged rows.
- **UI Hardening**: Resolved navigation inconsistencies and column duplication in the Employee Portal status view.
- **Improved Feedback Loop**: The manager's custom comments are now clearly visible to the employee when clicking "Comments" in their history.

### **Identified Improvements (Next Steps)**
1. **Submission Deadlines**: Implement the "Submission Window" logic to close the form after the quarterly deadline.
2. **Numeric Validation**: Add stricter range checks (e.g., hours per month cannot exceed 744) in the Step 2 editor.

---

## Phase 8: Live Reports, Dashboard Analytics, and Employee 360 Decommission
**Status: COMPLETED**
- **Computed Reports API Layer**: Added live manager-report endpoints backed by MongoDB aggregation logic in backend controllers.
	- `/api/reports/dashboard`
	- `/api/reports/utilization`
	- `/api/reports/fte-summary`
	- `/api/reports/fte-consolidation-summary`
	- `/api/reports/fitment-summary`
- **Role-Based Access Hardening**: Report routes are token-protected and manager-only; employee access is explicitly denied with `403`.
- **Manager Dashboard Refactor**: Replaced hardcoded KPI/card/chart/table data with live report payloads.
	- Added robust loading, empty, and error states.
	- Added submission-window status rendering directly in dashboard summary.
- **WDT Analytics Refactor**: Connected analytics cards/charts/tables to live utilization report payloads with safe handling for empty/partial data.
- **Live Refresh Reliability**:
	- Introduced data update event emission after submission and manager review updates.
	- Added event-driven and periodic refresh on manager dashboard/analytics pages to keep summaries in sync.
- **Employee 360 Removal**:
	- Removed manager route and all UI navigation links to Employee 360.
	- Deleted Employee 360 page implementation as requested.
- **Verification Tooling Added**:
	- Added `npm run verify:reports` script in backend.
	- Verifier confirms manager access, employee denial, and cross-report submission-count consistency.
	- If `MONGODB_URI` is provided, verifier can additionally run direct DB parity checks.

### **Validation Outcome (Phase 8)**
1. Manager report access: **PASS**
2. Employee access blocked on manager reports: **PASS (403)**
3. Dashboard/utilization submission-count consistency: **PASS**
4. Direct DB parity: **Conditionally supported** (runs when `MONGODB_URI` is configured)
