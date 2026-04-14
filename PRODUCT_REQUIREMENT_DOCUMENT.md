# Product Requirement Document (PRD): OptiNext

## 1. Overview
OptiNext is an organizational productivity and process optimization platform designed to capture, standardize, and analyze employee work processes. It enables structured data collection from employees and provides managers with actionable insights using predefined analytical frameworks such as WDT (Work Distribution Tracking) and 6x6 Metrics Framework.

> [!NOTE]
> **Current Status**: Phase 4 Complete. The Central Process Database (Taxonomy) is fully operational and is now powering dynamic selection in the Employee Portal.

---

## 2. Objectives
- Capture detailed process-level work data from employees.
- Standardize unstructured and structured inputs into a central process taxonomy.
- Enable managers to analyze aggregated data across teams and departments.
- Apply analytical frameworks (WDT, 6x6) on standardized data for insights.
- Provide flexibility for employees while ensuring backend standardization.

---

## 3. User Personas

### 3.1 Employee
- Individual contributors across the organization.
- Responsible for reporting their work processes and time allocation.

### 3.2 Manager
- Supervisors managing teams, departments, or multiple hierarchical levels.
- Responsible for reviewing, analyzing, and refining process data.

---

## 4. System Components

### 4.1 Employee Portal
Interface where employees input their work-related data.

### 4.2 Manager Portal
Interface where managers view, manage, and analyze aggregated employee data.

### 4.3 Central Process Database
Master repository of all standardized processes.

### 4.4 NLP Mapping Engine
Maps free-text inputs from employees to standardized processes.

### 4.5 Analytics Engine
Applies WDT and 6x6 frameworks on standardized data.

---

## 5. Functional Requirements

### 5.1 Employee Portal Requirements
**5.1.1 Process Input Form**
Employees must be able to:
- Select processes from a predefined list (fetched from Central Process Database).
- OR enter processes in natural language.

**5.1.2 Data Fields**
Each submission should include:
- Process name (selected or entered)
- Description (optional)
- Time spent (hours/minutes)
- Tools used
- Frequency (daily/weekly/monthly)
- Additional metadata (if required)

**5.1.3 Process Selection Behavior**
- The system must display only relevant processes assigned to the employee’s group/team.
- Employees can: Select from the list OR input custom process via natural language.

**5.1.4 Natural Language Mapping**
- Any free-text process entered must be semantically mapped to a corresponding process in the Central Process Database.
- Suggest matches or flag for review if confidence is low.

### 5.2 Manager Portal Requirements
**5.2.1 Data Visualization**
Managers must be able to:
- View aggregated employee data.
- Filter by: Team, Department, Time period, Process.
- Drill down into individual employee data.

**5.2.2 Process Management**
- View the central process list.
- Enable/disable processes for specific teams or employee groups.

**5.2.3 Hierarchical Access**
- Access data across multiple levels (team → department → organization).
- View roll-ups at each level.

**5.2.4 Data Processing Visibility**
- See raw collected data.
- See data processed through WDT and 6x6 frameworks.

### 5.3 Central Process Database
- Stores standardized list of processes (Unique ID, Name, Category, Tags).
- Accessible by Employee Portal (Read-only) and Manager Portal (Read/Write).

### 5.4 NLP Mapping Engine
- Semantic matching between free-text and database entries.
- Return best match (confidence score) and alternative suggestions.

### 5.5 Analytics Engine
- **WDT Processing**: Analyze time distribution across processes.
- **6x6 Framework Processing**: Categorize processes into 6 Performance + 6 Characteristic dimensions.

---

## 6. Data Flow
1. Employee submits process data.
2. NLP engine maps input to standardized process.
3. Data stored in normalized format.
4. Analytics engine processes data (WDT + 6x6).
5. Data available in Manager Portal.

---

## 7. Key Constraints & Rules
- Analytics must run only on standardized process IDs.
- Natural language inputs must be mapped before processing.
- Managers control process availability for employees.

---

## 8. Non-Functional Requirements
- **Performance**: NLP mapping < 2s; Dashboards < 3s.
- **Scalability**: Support multi-level organizational hierarchies.
- **Security**: Role-based access control (RBAC).
- **Auditability**: Track changes to process database and mapping decisions.
