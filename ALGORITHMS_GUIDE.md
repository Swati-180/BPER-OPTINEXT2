# OptiNext Algorithm Documentation

This document outlines the mathematical frameworks and decision logic used in the OptiNext platform for Workload Distribution (WDT) and 6x6 Matrix Analysis.

---

## 1. Workload Distribution Tool (WDT) Algorithm
The WDT measures employee productivity and time allocation across core and support processes.

### Core Calculations
The following math is processed automatically in `server/models/WDTSubmission.js` during the pre-save lifecycle.

#### A. Total Activity Hours
Calculates monthly effort for a specific task based on throughput.
$$ \text{Total Hours} = \frac{\text{Monthly Volume} \times \text{Time per Transaction (minutes)}}{60} $$

#### B. Full-Time Equivalent (FTE)
Determines how many "people equivalents" are required for a specific task based on a standard **160-hour work month**.
$$ \text{FTE} = \frac{\text{Activity Hours}}{160} $$

#### C. Process Share (%)
Measures the percentage of an employee's total logged time dedicated to one specific task.
$$ \text{Process Share %} = \left( \frac{\text{Activity Hours}}{\text{Total Logged Hours}} \right) \times 100 $$

#### D. Utilization Rate
Measures the overall workload of an employee against the organizational standard.
$$ \text{Utilization} = \frac{\sum(\text{Total Hours})}{160} $$
*   **> 1.0 (100%):** Over-capacity / Overtime.
*   **< 1.0 (100%):** Under-utilization.

---

## 2. 6x6 Matrix Analysis Algorithm
The 6x6 Matrix evaluates business activities to determine if they are suitable for consolidation (centralization).

### The Parameters
Activities are assessed across 12 parameters (6 Performance, 6 Characteristics).

| Group | Parameter | Target for Consolidation |
| :--- | :--- | :--- |
| **Performance** | Multiple Locations | **High (H)** |
| | Routine | **High (H)** |
| | Volumes | **High (H)** |
| | Manpower | **High (H)** |
| | SOPs | **High (H)** |
| | ERP/Tech | **High (H)** |
| **Characteristics** | Sensitivity | **Low (L)** |
| | Criticality | **Low (L)** |
| | Controls | **Low (L)** |
| | Proximity | **Low (L)** |
| | Regulatory | **Low (L)** |
| | Skill | **Low (L)** |

### Scoring Logic
Points are awarded based on how "consolidation-friendly" a parameter is. 
*   **+1 point** for every **'High'** in Performance Indicators.
*   **+1 point** for every **'Low'** in Process Characteristics.

#### Decision Formula
$$ \text{Total Score} = \text{Count('H' in Performance)} + \text{Count('L' in Characteristics)} $$

### Output Interpretations
The system flags the outcome based on the calculated score (Scale 0-12):
*   **Score ≥ 7:** **Consolidatable**. High benefit, low risk for centralization.
*   **Score < 7:** **Not Consolidatable**. High complexity or risk; should remain decentralized.

---

## 3. Integration & Data Flow
1.  **WDT Capture:** Employees provide Volumes and Time-Per-Transaction metrics.
2.  **Normalization:** Analytics Engine standardizes time into FTE and Utilization.
3.  **Strategic Alignment:** Managers use the 6x6 Matrix to evaluate high-volume (high WDT effort) but low-complexity (high 6x6 score) tasks for potential cost optimization and centralization.
