# BPER Platform Production Walkthrough

Welcome to the production-ready BPER-OPTINEXT2 platform. The application has been fully migrated from a hardcoded prototype to a live, API-driven system backed by MongoDB Atlas.

## 1. Credentials & Access
Access the platform using the institutional credentials now persisted in the production database:

*   **Manager Portal**:
    *   **Email**: `admin@BPER.com`
    *   **Password**: `Admin@123`
*   **Employee Portal**:
    *   **Email**: `employee@bper.com`
    *   **Password**: `Employee@123`

## 2. Production Architecture
The platform now operates on a modern, secure stack:
*   **Database**: MongoDB Atlas Cluster (`BPER` namespace).
*   **Security**: Centralized `apiFetch` utility with JWT injection and proactive session expiration auditing.
*   **HRMS Ledger**: Extended `User` model supporting full employee metadata (Employee ID, Band, Designation, Supervisor).

## 3. The End-to-End WDT Cycle
The core Workforce Data Tracking (WDT) flow is now persistent:
1.  **Filing**: Employees (QG User1) submit their BPER forms in the **BPER Form** section. Data is asynchronously saved to Atlas.
2.  **Tracking**: Employees can monitor their submission status in **Form Status**.
3.  **Review**: Managers (QG User2) see pending submissions in their **Review Queue (Forms)**.
4.  **Action**: Managers can "Approve" (Grant) or "Return for Revision" (Flagging) with live comments that reflect immediately on the employee's dashboard.

## 4. Analytics & Talent Matrix
*   **6x6 Analysis**: Dynamically calculates quadrants and talent mapping based on live submission data.
*   **Fitment Engine (360)**: Provides a weighting-based competency analysis for employees, fueled by the `Fitment` API and backend model.
*   **WDT Analytics**: Aggregated real-time views of process distribution and team hour allocation.

## 5. User Management & Onboarding
*   **Live Ledger**: Managers can register new users directly. This creates a real MongoDB document with the correct "Employee" or "Manager" role.
*   **Invite Signup**: A dedicated onboarding page handles new employee registration via shareable URLs.

## 6. How to Seed/Reset
If the database needs to be reset to the standard BPER baseline:
1.  Navigate to `server/`
2.  Run `npm run seed`

---
**Status**: All 18 verified/audit tasks are now **COMPLETE**. The platform is ready for UAT.
