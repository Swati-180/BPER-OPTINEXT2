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
- [ ] **Deep Reports (Task 9)**
    - [ ] Replace static arrays in Report tabs with live API aggregation
    - [ ] Connect multi-tab reports to live backend endpoints
- [ ] **Fitment Module (Task 11)**
    - [ ] Connect Fitment scoring UI to real backend results
- [ ] **Analytics Polish (Task 8)**
    - [ ] Ensure charts do not break when API data is empty or partial
    - [ ] Render live summary counts across all dashboard cards

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
| **Fitment Analysis** | **MOCK** (Static State) | Development |
| **Deep Reports / Utilization** | **HYBRID** (Calculated from Live but showing static exports) | Development |
| **WDT Utilization Graphs** | **LIVE** (Computed from Submissions) | High |
