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
