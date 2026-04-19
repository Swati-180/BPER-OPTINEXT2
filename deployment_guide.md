# OptiNext Production Deployment Guide

This document contains the exact settings and environment variables needed to deploy the OptiNext platform on **Vercel** (Frontend) and **Render** (Backend).

## 1. Render (Backend)
Deploy the `server` directory as a **Web Service**.

- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`
- **Environment Variables**:
    - `MONGODB_URI`: `mongodb+srv://OptiNxt_db_user:bOmbXEllFiC2E7Px@optinxt.khgupmq.mongodb.net/?appName=OptiNxt`
    - `JWT_SECRET`: `supersecretkey`
    - `NODE_ENV`: `production`

## 2. Vercel (Frontend)
Deploy the `client` directory.

- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
    - `VITE_API_URL`: *[Paste your Render Web Service URL here, e.g., https://optinext-api.onrender.com]*

---

## Technical Note: Environment Switching
The frontend has been updated to use a centralized configuration. It will automatically:
1. Use `http://localhost:5000` when running locally (`npm run dev`).
2. Use the `VITE_API_URL` when built for production.

**To fix the 'Old Version' issue on Vercel:**
After you are comfortable with the local changes, push the updated code to GitHub. Vercel will automatically detect the push and redeploy the site with the latest features (including the Taxonomy Audit Trails).
