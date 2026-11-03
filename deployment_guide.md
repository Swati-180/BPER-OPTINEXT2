


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
