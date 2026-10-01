# BPER Platform Production Deployment Guide

This document covers deployment for the BPER platform on **Azure** (primary CI/CD in this repo), and the alternative **Vercel + Render** split.

All email notifications (WDT submissions, manager reviews, employee invites) use **Gmail SMTP** via `server/utils/emailService.js`. Configure Gmail credentials on the backend in every environment.

---

## Gmail SMTP Setup (Required for Email)

1. Enable **2-Step Verification** on the Google account.
2. Create an **App Password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Set these backend environment variables:
   - `GMAIL_USER` — Gmail address that sends platform emails
   - `GMAIL_APP_PASSWORD` — 16-character App Password (spaces are OK)

If these are missing, the API still runs but emails are skipped.

---

## Option A: Azure (GitHub Actions)

Workflow: `.github/workflows/deploy-azure.yml` (runs on push to `main`).

### Backend — Azure Container Apps

- **Dockerfile**: `server/Dockerfile`
- **Build**: `docker build -f server/Dockerfile server/`
- **Start**: `node index.js` (port `5000`)

**Container App environment variables:**

| Variable | Source | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runtime mode |
| `PORT` | `5000` | API port |
| `MONGODB_URI` | GitHub secret | MongoDB Atlas connection |
| `JWT_SECRET` | GitHub secret | JWT signing key |
| `CORS_ORIGIN` | `SWA_URL` in workflow | Allowed frontend origin |
| `FRONTEND_URL` | `SWA_URL` in workflow | Links in outbound emails |
| `GMAIL_USER` | GitHub secret | Gmail SMTP sender |
| `GMAIL_APP_PASSWORD` | GitHub secret | Gmail App Password |

**GitHub repository secrets to configure:**

- `AZURE_CREDENTIALS`
- `AZURE_STATIC_WEB_APPS_API_TOKEN`
- `MONGODB_URI`
- `JWT_SECRET`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

Update `SWA_URL` in the workflow if the Azure Static Web Apps URL changes.

### Frontend — Azure Static Web Apps

- **Root**: `client`
- **Build**: `npm ci && npm run build`
- **Output**: `client/dist`

**Build-time environment variable:**

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | Backend Container App URL (set automatically by the workflow) |

The workflow builds the frontend after the backend deploy and injects the live ACA URL into `VITE_API_URL`.

---

## Option B: Vercel (Frontend) + Render (Backend)

### Render — Backend Web Service

Deploy the `server` directory as a **Web Service**.

- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`

**Environment variables:**

| Variable | Example / Notes |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Strong secret key |
| `NODE_ENV` | `production` |
| `PORT` | `5000` (Render sets this automatically; keep default) |
| `CORS_ORIGIN` | Your Vercel frontend URL, e.g. `https://your-app.vercel.app` |
| `FRONTEND_URL` | Same Vercel URL — used in email invite/review links |
| `GMAIL_USER` | Gmail address for sending |
| `GMAIL_APP_PASSWORD` | Gmail App Password |

### Vercel — Frontend

Deploy the `client` directory (or use root `vercel.json` which builds from `client/`).

- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

**Environment variables:**

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | Your Render backend URL, e.g. `https://your-api.onrender.com` |

Do **not** prefix Gmail variables on Vercel — email is sent from the backend only.

---

## Local vs Production URL Behavior

The frontend uses a centralized API config:

- **Local dev**: `http://localhost:5000` when `VITE_API_URL` is unset.
- **Production build**: uses `VITE_API_URL` from the hosting platform.

The backend uses:

- **`CORS_ORIGIN`**: must match the deployed frontend origin exactly.
- **`FRONTEND_URL`**: must match the deployed frontend base URL so email links resolve correctly.

---

## Post-Deploy Verification

1. Open the frontend and log in with a seeded account.
2. Submit a WDT form — confirm a submission email arrives (if Gmail is configured).
3. From the manager portal, send an employee invite — confirm the invite email and registration link work.
4. Check browser devtools: API calls should target `VITE_API_URL`, not `localhost`.

---

## Security Notes

- Never commit real credentials to source control.
- Store `GMAIL_APP_PASSWORD`, `JWT_SECRET`, and `MONGODB_URI` as platform secrets.
- Use a dedicated Gmail account or Google Workspace sender for production email.
