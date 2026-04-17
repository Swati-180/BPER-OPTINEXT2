# OptiNext Master Task List & Roadmap

## Phase 1-4: Core Platform & Foundation
- [x] Basic Employee Portal Setup
- [x] Basic Manager Portal Setup
- [x] MongoDB Atlas Integration
- [x] Role-Based Access Control (RBAC)
- [x] BPER Form Wizard (Steps 1-3)
- [x] Manage Users & Approval Flow
- [x] Basic Dashboard Charts

## Phase 5: Hardening & Business Logic (COMPLETED)
- [x] **Submission Window Enforcement** (20th-31st)
- [x] **Duplicate Submission Prevention** (By Month/Year)
- [x] **Strict Frontend Validation** (Disable 'Next' if hours = 0 or fields empty)
- [x] **Autosave "Saved √" Visual Indicator**
- [x] **Dashboard Deadline Alert** (Live countdown to window closure)
- [x] **Bug Fix**: Employee Login (Corrected `employee@bper.com` seed)
- [x] **Bug Fix**: Reference ID "BPER-undefined-1" (Profile hydration fix)
- [x] **Bug Fix**: 6x6 Analysis empty state (Database seeding)
- [x] **Bug Fix**: Stats Overlapping in Manager Forms (Responsive CSS fix)
- [x] **Bug Fix**: 6x6 Matrix Cryptic Headers (Added tooltips)

## Phase 6: AI Integration & Process Governance (PENDING)
- [ ] **AI Mapping (Task 6)**
    - [ ] add custom activity input flow in employee form
    - [ ] show mapped suggestion to user
    - [ ] show confidence or mapping result clearly
    - [ ] connect custom input to AI mapping API
    - [ ] backend: confirm AI mapping route returns usable response
- [ ] **Manager Process Control (Task 12)**
    - [ ] Build Taxonomy Management Dashboard
    - [ ] Implement Team/Department level visibility rules in `/api/taxonomy`
- [ ] **Audit Trail (Task 13)**
    - [ ] Log status changes (Approve/Return) with timestamps
    - [ ] Track AI mapping decisions and overrides
- [ ] **Manager Reviews Enhancement (Task 7)**
    - [x] Display real submission rows and statuses
    - [x] Connect approve/return action routes
    - [ ] Implement **"Grant Edit"** functionality

## Phase 7: Advanced Analytics & Reporting (PENDING)
- [x] **Deep Reports (Task 9)**
    - [x] Replace static arrays in Report tabs with live API aggregation
    - [x] Connect multi-tab reports to live backend endpoints
- [x] **Fitment Module (Task 11)**
    - [x] Connect Fitment scoring UI to real backend results
- [ ] **Analytics Polish (Task 8)**
    - [ ] Ensure charts do not break when API data is empty or partial
    - [ ] Render live summary counts across all dashboard cards

## Phase 9: Deep Reports and Export-Ready Views (COMPLETED)
- [x] **Deep Analysis Reports API Layer**
    - [x] Add FTE analysis, Consolidation analysis, Fitment analysis, Utilization analysis endpoints
    - [x] Return detailed tabs data for each analysis type
- [x] **Frontend Deep Analysis Page (Consolidated)**
    - [x] Create unified Deep Analysis page with 4 main tabs
    - [x] FTE Analysis tab (4 sub-tabs) with CSV export
    - [x] Consolidation Analysis tab (3 sub-tabs) with CSV export
    - [x] Fitment Analysis tab (3 sub-tabs) with CSV export
    - [x] Utilization Analysis tab (5 sub-tabs) with CSV export
- [x] **Export Functionality**
    - [x] Implement CSV export helper in API client
    - [x] Wire export buttons to live report data
    - [x] Support contextual headers and date-stamped filenames
- [x] **Tab State Management**
    - [x] Add loading states (Loader2 spinners) to all tabs
    - [x] Add empty states for no-data scenarios
    - [x] Add error states with retry logic
    - [x] Department filters for scoped analysis
- [x] **UI Consistency**
    - [x] Match dashboard color scheme and typography
    - [x] Standardize KPI card layouts
    - [x] Consistent table styling across all sub-tabs
    - [x] Responsive grid for mobile/tablet/desktop
- [x] **Navigation & Routing**
    - [x] Add single "Deep Analysis" menu item to sidebar
    - [x] Register `/manager/deep-analysis` route in App.tsx
    - [x] Auto-refresh via event listener and polling
- [x] **Sidebar Optimization**
    - [x] Consolidate 4 report pages into 1 page with main tabs
    - [x] Reduce sidebar clutter from 9 items to 6 items
    - [x] Use Briefcase icon for Deep Analysis menu item
- [x] **Data Validation**
    - [x] Verify tab data matches dashboard calculations
    - [x] Verify export contains live data
    - [x] Test loading/empty/error states on all sub-tabs

## Phase 8: Live Reports Completion & Cleanup (COMPLETED)
- [x] **Computed Reports API Layer**
    - [x] Add dashboard, utilization, FTE summary, FTE consolidation summary, and fitment summary endpoints
    - [x] Compute report payloads directly from MongoDB submissions and fitment data
- [x] **Manager Report Security**
    - [x] Enforce manager-only access for report routes
    - [x] Verify employee requests return `403` on manager report endpoints
- [x] **Manager Dashboard Refactor**
    - [x] Replace hardcoded KPI cards and charts with live report data
    - [x] Show submission window status on the dashboard
    - [x] Refresh dashboard summaries after submissions and manager reviews
- [x] **WDT Analytics Refactor**
    - [x] Replace hardcoded chart/table values with utilization report data
    - [x] Add loading, empty, and error-safe chart states
    - [x] Refresh analytics after live submission updates
- [x] **Employee 360 Removal**
    - [x] Remove manager route and navigation links for Employee 360
    - [x] Delete obsolete Employee 360 page implementation
- [x] **Verification & Validation**
    - [x] Add automated report verification script
    - [x] Validate manager access, employee denial, and report consistency checks

---

## Technical Audit: Algorithms & Data Integrity

### 1. Algorithm Overview
| Framework | Logic / Algorithm | Status |
| :--- | :--- | :--- |
| **WDT (Work Distribution)** | Time-aggregation: Groups `hours` by `majorProcess` and `activityCategory`. | **Active** |
| **6x6 Matrix Scoring** | Scoring logic: Mapping 12 criteria to consolidation strength. | **Active** |
| **Submission Window** | Date-range validation: Enforces `20th <= day <= 31st`. | **Active** |
| **NLP Mapping** | *Proposed: Vector embeddings (Cosine Similarity).* | **Draft** |

### 2. Live Data vs. Mock Data Status
| Page / Widget | Data Source | Reliability |
| :--- | :--- | :--- |
| **Employee Dashboard** | **LIVE** (Mongo Atlas) | High |
| **Manager Submission Queue** | **LIVE** (Mongo Atlas) | High |
| **6x6 Analysis Matrix** | **LIVE** (Mongo Atlas) | High |
| **FTE Analysis** | **LIVE** (API: `/reports/fte-analysis`) | High |
| **Consolidation Analysis** | **LIVE** (API: `/reports/consolidation-analysis`) | High |
| **Fitment Analysis** | **LIVE** (API: `/reports/fitment-analysis`) | High |
| **Utilization Analysis** | **LIVE** (API: `/reports/utilization-analysis`) | High |
| **WDT Utilization Graphs** | **LIVE** (Computed from Submissions) | High |
| **Deep Report Exports** | **LIVE** (CSV from API data) | High |
