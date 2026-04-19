<div align="center">
   <img src="https://quintesglobal.com/wp-content/uploads/2021/11/logo-quintesglobal-1.png" alt="QG Tools logo" width="220" />

   # QG Tools - BPER Platform

   **BPER: Business Process and Efforts Review**  
   **QG: Quintes-Global**

   A role-based platform to capture employee process effort data, standardize it through taxonomy mapping, and generate manager-ready operational analytics.
</div>

---

## Table of Contents

- [Overview](#overview)
- [Core Capabilities](#core-capabilities)
- [User Roles and Flows](#user-roles-and-flows)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Seed Data and Demo Accounts](#seed-data-and-demo-accounts)
- [API Surface (High Level)](#api-surface-high-level)
- [Deployment](#deployment)
- [Known Notes](#known-notes)
- [Team](#team)
- [Acknowledgements](#acknowledgements)
- [Documentation](#documentation)

## Overview

QG Tools - BPER Platform is an internal workflow intelligence system designed to:

- Collect detailed employee process/effort inputs through structured submissions.
- Map captured data into a central process taxonomy.
- Support manager review and governance of submitted records.
- Deliver analytics views such as WDT, 6x6 analysis, utilization, FTE, fitment, and consolidation.

The application is split into two portals backed by a shared API:

- Employee portal for submission and status tracking.
- Manager portal for administration, review, taxonomy operations, analytics, and audit visibility.

## Core Capabilities

- Secure JWT-based authentication and role-based route access.
- Employee form submission lifecycle (create, submit, review feedback loop, resubmit).
- Dynamic process/taxonomy-backed activity selection.
- Manager user management and bulk actions.
- Reporting and analytics endpoints for operational decision support.
- Audit logging for critical actions and governance traceability.

## User Roles and Flows

### Employee

- Logs in through employee-specific authentication.
- Completes and submits BPER entries.
- Tracks submission status and review outcomes.

### Manager/Admin

- Logs in through manager authentication and selects manager portal.
- Reviews submissions and user records.
- Monitors dashboards and deep analysis modules.
- Manages taxonomy/process dimensions and audit logs.

## Architecture

```text
Client (React + Vite)  --->  Server (Express + Node.js)  --->  MongoDB
            |                           |
            |                           +--> Auth, WDT, Taxonomy, Reports, Analysis, Activities
            |
            +--> Employee Portal + Manager Portal (RBAC)
```

## Tech Stack

### Frontend

- React 19 + TypeScript
- Vite
- React Router
- Tailwind CSS
- Motion + Lucide icons

### Backend

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- bcrypt password hashing

## Project Structure

```text
client/
   src/
      pages/
         employee/
         manager/
      layouts/
      lib/
server/
   controllers/
   routes/
   models/
   middleware/
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- MongoDB instance (local or hosted)

### 1) Install dependencies

```bash
cd client
npm install

cd ../server
npm install
```

### 2) Configure backend environment

Create a `.env` file in `server/`:

```env
MONGODB_URI=<your_mongodb_connection_string>
JWT_SECRET=<your_strong_jwt_secret>
PORT=5000
NODE_ENV=development
```

### 3) Configure frontend environment

Create a `.env` file in `client/`:

```env
VITE_API_URL=http://localhost:5000
```

### 4) Run backend

```bash
cd server
npm run dev
```

### 5) Run frontend

```bash
cd client
npm run dev
```

Frontend default URL: `http://localhost:3000`

## Environment Variables

### Server (`server/.env`)

- `MONGODB_URI`: MongoDB connection URI.
- `JWT_SECRET`: Secret key used to sign JWT tokens.
- `PORT`: API port (default: `5000`).
- `NODE_ENV`: Runtime mode.

### Client (`client/.env`)

- `VITE_API_URL`: Backend base URL.

## Seed Data and Demo Accounts

To seed local development data:

```bash
cd server
npm run seed
```

Quick sign-in credentials:

1. Name: QG Admin  
   Email: admin@BPER.com  
   Password: Admin@123  
   Role: admin (manager portal access)

2. Name: QG Employee  
   Email: employee@bper.com  
   Password: Employee@123  
   Role: employee

Use seeded accounts only for local development/testing.

## API Surface (High Level)

Primary backend route groups:

- `/api/auth` - signup, login, profile, and user administration.
- `/api/wdt` - submission and review workflows.
- `/api/reports` - dashboard and analytics reports.
- `/api/analysis` - analysis framework outputs.
- `/api/taxonomy` - taxonomy/process mapping operations.
- `/api/activities` - activity/tower/process list and custom entries.
- `/api/fitment` - fitment profile operations.

## Deployment

Recommended split deployment:

- Frontend: Vercel (root: `client`)
- Backend: Render (root: `server`)

Set production environment variables securely in hosting platforms.
Do not commit credentials or secrets to source control.

## Known Notes

- The backend can attempt an in-memory MongoDB fallback if primary DB connection fails, but production should always use a managed MongoDB URI.
- If changing API base URL behavior, ensure frontend API utilities and environment config remain consistent; some legacy calls may still need manual alignment.

## Team

| Person | Role | Primary Responsibility | Support / Notes |
| --- | --- | --- | --- |
| Swati Borkar | Frontend Owner | Frontend work and integration work across tasks | Primary owner for auth, routing, employee flows, and key portal integration |
| Yash Raj | Frontend | Frontend work and integration work support | Supports portal separation, WDT UI, dashboards, reports, and fixes |
| Ujjwal | Frontend | Frontend support and implementation support | Supports frontend tasks and fixes; not primary owner for frontend subtasks |
| Ayan Baraskar | Backend | Auth, WDT workflow, review workflow, audit, admin approvals | Primary backend owner for auth and WDT-heavy tasks |
| Akshat Tamrakar | Backend | AI mapping, reports, 6x6, fitment, process visibility, API consistency | Primary backend owner for analytics and business logic tasks |
| Aryan Goti | Database / Atlas | Atlas setup, seed data, schema/data verification | Primary owner for database readiness and DB-side validation |
| Abhay Singh | Database / Atlas | Atlas support, data checks, query/data validation | Supports seed data, DB debugging, and validation |
| Chitrekha Sahu | Helper / QA | Review support, testing, validation, and selected non-critical helper tasks | Supports retesting, validation, documentation checks, and light helper work; not primary owner for highly technical subtasks |
| Aashna Tamrakar | Helper / QA | Review support, testing, validation, and selected non-critical helper tasks | Supports retesting, validation, data checks, and light helper work; not primary owner for highly technical subtasks |

## Acknowledgements

Special thanks to Rupsi Madam and Soumya Madam for their guidance and continuous support throughout this project.

Special thanks to Sameer Sir and CS AI Labs for providing this opportunity to learn and gain real-world skills and hands-on experience.

## Documentation

- `PRODUCT_REQUIREMENT_DOCUMENT.md` - product requirements and goals.
- `deployment_guide.md` - deployment reference.
- `WALKTHROUGH.md` - implementation walkthrough.
- `PHASE_UPDATES.md` - phase-wise delivery notes.

