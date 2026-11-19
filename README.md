# SafeInbox

SafeInbox is a web dashboard that connects to Gmail, scans your **unread** emails and tells you which ones to read and which to ignore. Every email gets a spam score, a type (*likely safe / suspicious / likely spam*), a short summary, the reasons behind the decision, and phishing warnings for dangerous-looking links. You can mark emails as read, delete them, report spam or mark them as not spam directly from the dashboard, or ask the built-in assistant questions such as *"summary"* or *"any phishing?"*.

**Stack:** React (Vite, Tailwind CSS) · Flask · MongoDB · scikit-learn (TF-IDF + Naive Bayes) · sumy/NLTK (TextRank) · Gmail API with Google OAuth 2.0 · Docker · Jenkins

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Google Cloud setup (one time)](#google-cloud-setup-one-time)
4. [Run locally](#run-locally)
5. [Run with Docker](#run-with-docker)
6. [Deploy to the internet (Vercel + Render + MongoDB Atlas)](#deploy-to-the-internet-vercel--render--mongodb-atlas)
7. [CI/CD with Jenkins](#cicd-with-jenkins)
8. [Tests](#tests)
9. [Configuration](#configuration)
10. [API](#api)
11. [Project structure](#project-structure)
12. [Report requirements → implementation](#report-requirements--implementation)

---

## Features

- **Sign in with Gmail** (Google OAuth 2.0). The first sign-in registers the account; sessions survive page reloads.
- **Unread inbox scan**: fetches up to 10/25/50 unread inbox emails (your choice).
- **Preprocessing**: decodes the email, strips HTML, quoted replies and signatures.
- **Spam classification**: TF-IDF + Multinomial Naive Bayes, **95.3 % accuracy** on 1,035 held-out test emails.
- **Confidence scoring**: combines the model with sender information: senders you trusted or reported, and Gmail's SPF/DKIM/DMARC results.
- **Customizable sensitivity**: low / medium / high.
- **Explanations**: the words that pushed the score up or down, and every sender/phishing signal.
- **Phishing detection**: links to raw IP addresses, look-alike (punycode) domains, brand impersonation (`paypal-login.xyz`), link text that shows one site but opens another, link shorteners, risky domain endings, mismatched Reply-To and fake sender names.
- **Extractive summaries** with TextRank, 1–5 sentences (your choice).
- **Actions**: Mark as read, Delete (moves to Trash), Report spam (moves to Gmail Spam and blocks the sender), Not spam (trusts the sender). Read the full cleaned email or open it in Gmail.
- **Assistant (chatbot)**: "summary", "summarize #2", "show spam", "any phishing?", "why is #1 spam?", "set sensitivity to high", "fetch my emails"…
- **Previous mails** history, a spam statistics chart, category filters, and a **dark/light mode**. Works on phones.
- **Learning from users**: Report spam / Not spam choices block or trust that sender for the user. Admins can retrain the model in the background, and a new model only goes live if it keeps accuracy ≥ 90 %. With `STORE_FEEDBACK_TEXT=true` (private demos only), retraining also learns from the reported emails. It's off for public deployments because Google's Limited Use policy forbids training shared models on Gmail data.
- **Role-based access**: accounts listed in `ADMIN_EMAILS` get the *admin* role (statistics, retraining, model rollback).
- **Security & privacy (GDPR)**: email content, names, addresses and Gmail tokens are encrypted at rest with **AES-256-GCM**. Analyses are deleted automatically after 30 days (configurable). Users can **download** or **delete** all their data. Logging out revokes Gmail access.
- **Caching**: emails are analysed once and stored, so refreshing only downloads new emails. Changing settings re-scores stored results without contacting Gmail.

## Architecture

```
Browser (React)  ──/api──►  Flask backend  ──►  Gmail API (OAuth 2.0 access token, stored encrypted)
   │  Google Identity          │
   │  Services popup           ├─ preprocessing.py  clean text, links, sender, SPF/DKIM/DMARC
   │                           ├─ classifier.py     TF-IDF + Naive Bayes (+ per-word explanation)
   │                           ├─ scoring.py        CALCULATE_SPAM_SCORE(probability, text, sender info)
   │                           ├─ phishing.py       link + sender checks
   │                           ├─ summarizer.py     TextRank summary
   │                           ├─ chatbot.py        assistant
   │                           ├─ training.py       background retraining
   │                           └─ MongoDB           users · analyses (encrypted) · feedback · jobs
```

In development, Vite forwards `/api` to Flask on port 5000. In Docker, nginx serves the built React app on port 3000 and forwards `/api` to the backend container.

## Google Cloud setup (one time)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and **enable the Gmail API**.
2. **Google Auth Platform → Branding / Audience**: create the consent screen. Audience: *External*. Under **Test users**, add every Gmail address that will sign in. In Testing mode you can have up to 100.
3. **Clients → Create client → Web application**. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (local development)
   - `http://localhost:3000` (Docker)
4. Copy the **Client ID** (`…apps.googleusercontent.com`). No API key or client secret is needed.

> Gmail's read scopes are *restricted*. While the app is in Testing mode only listed test users can sign in, and they will see an "unverified app" notice. Opening it to everyone requires Google's verification.

## Run locally

Requirements: Python 3.12, Node.js 20+, and optionally Docker (for MongoDB).

**1. Backend** (PowerShell):

```powershell
cd safeinbox-backend
copy .env.example .env          # then set GOOGLE_CLIENT_ID and ADMIN_EMAILS
python -m venv venv
.\venv\Scripts\python -m pip install -r requirements.txt
.\venv\Scripts\python app.py    # http://127.0.0.1:5000
```

MongoDB is optional for local development. The default `MONGO_URI` uses a MongoDB installed on your machine (port 27017). Without one, the backend logs a warning and keeps data in memory until it stops. You can also run MongoDB in Docker instead: run `docker compose up -d mongo` from the project root, then set `MONGO_URI=mongodb://localhost:27018/safeinbox`.

**2. Frontend** (second terminal):

```powershell
cd frontend
copy .env.example .env          # then set VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                     # http://localhost:5173
```

Open **http://localhost:5173** and click **Login with Gmail**.

## Run with Docker

```powershell
copy .env.example .env          # set GOOGLE_CLIENT_ID and ADMIN_EMAILS
docker compose up -d --build
```

Open **http://localhost:3000**. Containers:

| Container | What | Port |
|---|---|---|
| `safeinbox-frontend` | nginx serving the React build, proxying `/api` | 3000 → 80 |
| `safeinbox-backend` | Flask under gunicorn | 5000 |
| `safeinbox-mongo` | MongoDB 7 (named volume `mongo-data`) | 27018 → 27017 |

Encryption and session keys are generated on first start and kept in the `backend-instance` volume. To manage keys yourself, set `DATA_ENCRYPTION_KEY` / `SECRET_KEY` in `.env`. Useful commands:

```powershell
docker compose ps                 # status (all should be "healthy")
docker compose logs -f backend    # backend logs
docker compose down               # stop (data is kept)
docker compose down -v            # stop and DELETE all data
```

## Deploy to the internet (Vercel + Render + MongoDB Atlas)

All three services have free plans:

| Part | Service | Config file |
|---|---|---|
| Frontend (React build) | **Vercel** | `frontend/vercel.json` |
| Backend (Flask in Docker) | **Render** web service | `render.yaml` |
| Database | **MongoDB Atlas** M0 cluster | – |

The browser loads the site from Vercel and calls the backend on Render directly. Render's free server sleeps after 15 minutes without visitors; the next visit wakes it in about a minute, and the login page shows a "Starting the server…" message meanwhile.

**1. MongoDB Atlas.** Create a free **M0** cluster (pick a region near your Render region, e.g. Mumbai or Singapore):
- **Database Access**: add a database user.
- **Network Access**: allow `0.0.0.0/0` (Render's addresses change).
- **Connect → Drivers**: copy the connection string and add `/safeinbox` before the `?`, e.g. `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/safeinbox?retryWrites=true&w=majority`.

**2. Render (backend).** **New → Blueprint** → connect the GitHub repository; Render reads `render.yaml`. Fill in:

| Variable | Value |
|---|---|
| `MONGO_URI` | Atlas connection string from step 1 |
| `GOOGLE_CLIENT_ID` | your OAuth client ID |
| `ADMIN_EMAILS` | your Gmail address |
| `CORS_ORIGINS` | your Vercel address from step 3, e.g. `https://safeinbox.vercel.app` (you can edit this after step 3) |
| `DATA_ENCRYPTION_KEY` | output of `python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"`. **Keep a copy.** |

After the deploy, `https://<your-service>.onrender.com/api/health` should show `"database":"mongodb"`.

**3. Vercel (frontend).** **Add New → Project** → import the GitHub repository, then set:
- **Root Directory**: `frontend`
- **Environment Variables**:
  - `VITE_GOOGLE_CLIENT_ID`: your client ID
  - `VITE_API_BASE_URL`: the Render URL, e.g. `https://safeinbox-backend.onrender.com`
  - `VITE_SUPPORT_EMAIL` (optional): a contact address for the policy pages

Deploy. Then put the Vercel address into Render's `CORS_ORIGINS` if you haven't yet.

**4. Google Cloud (publish the app).**
- **Clients → your client → Authorized JavaScript origins**: add `https://<your-app>.vercel.app`.
- **Branding**:
  - App home page: `https://<your-app>.vercel.app`
  - Privacy policy: `https://<your-app>.vercel.app/privacy`
  - Terms of service: `https://<your-app>.vercel.app/terms`
  - Authorized domains: `<your-app>.vercel.app`
- **Audience → Publish app**. Because Gmail access is a restricted scope and the app is unverified, users see an "unverified app" screen (*Advanced → Go to SafeInbox*), and at most 100 users can sign up.

Both Vercel and Render redeploy automatically on every push to `main`. To make the public site update **only after Jenkins tests pass**:
1. Turn off auto-deploy in Render (Settings → Auto-Deploy: *No*) and in Vercel (Settings → Git → Ignored Build Step: *Don't build anything*, or disconnect Git).
2. Copy each service's **Deploy Hook** URL.
3. Add the URLs to Jenkins as *Secret text* credentials `safeinbox-render-deploy-hook` and `safeinbox-vercel-deploy-hook`. The *Deploy to cloud* stage then triggers them.

## CI/CD with Jenkins

The [`Jenkinsfile`](Jenkinsfile) runs these stages:

| Stage | What happens |
|---|---|
| Checkout | Pulls the latest code from GitHub (polls every ~5 minutes) |
| Backend: tests | `docker build --target test`: installs dependencies and runs the 55 pytest tests |
| Frontend: lint & build | `docker build --target build`: `npm ci`, ESLint and the production build |
| Build images | `docker compose build` |
| Deploy | `docker compose up -d` (skip with the `DEPLOY` parameter) |
| Smoke test | Calls `/api/health` through nginx until the stack is healthy |
| Deploy to cloud | Optional: triggers Render/Vercel deploy hooks if those credentials exist (see above) |

If a stage fails, the container logs are printed; temporary images are always cleaned up.

**Run Jenkins on your machine** (needs Docker Desktop). Everything is configured automatically, so there is no setup wizard:

```powershell
cd ci\jenkins
copy .env.example .env          # set JENKINS_ADMIN_PASSWORD, GOOGLE_CLIENT_ID, SAFEINBOX_ADMIN_EMAILS
docker compose up -d --build
```

On first start, the scripts in `ci/jenkins/init.groovy.d/` create:
- the admin login (from `.env`)
- the `safeinbox-google-client-id` *Secret text* credential
- the **SafeInbox** pipeline job, which uses the `Jenkinsfile` from `https://github.com/ritheshvreddy/SafeInbox.git`, branch `main`

Open **http://localhost:8080** and sign in. Jenkins checks GitHub every 5 minutes, so every push to `main` is tested and deployed automatically. **Build Now** starts a run immediately.

The pipeline deploys to the Docker engine Jenkins is connected to, so locally the app appears at http://localhost:3000. If the repository is private, add a GitHub token under **Manage Jenkins → Credentials** and select it in the job's Git settings.

## Tests

```powershell
cd safeinbox-backend
.\venv\Scripts\python -m pip install -r requirements-dev.txt
.\venv\Scripts\python -m pytest
```

The tests use a fake Gmail service and an in-memory MongoDB, so they need no Google account or network. They cover:

- preprocessing, phishing rules, AES encryption and scoring thresholds
- summaries and every chatbot intent
- sign-in/sessions, fetching and caching, all email actions, preferences
- GDPR export/delete, admin access control, and retraining (with the ≥ 90 % accuracy check)

Frontend: `npm run lint` and `npm run build` in `frontend/`.

## Configuration

Backend environment variables (`safeinbox-backend/.env` locally, the root `.env` for Docker):

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | – | OAuth client ID; sign-in tokens must belong to it |
| `ADMIN_EMAILS` | – | Comma-separated admin accounts |
| `MONGO_URI` | `mongodb://localhost:27017/safeinbox` | MongoDB connection |
| `MONGO_FALLBACK_TO_MEMORY` | `true` | Use an in-memory DB if MongoDB is unreachable (off in Docker) |
| `DATA_ENCRYPTION_KEY` | generated | Base64 32-byte AES-256 key |
| `SECRET_KEY` | generated | Signs session tokens |
| `DATA_RETENTION_DAYS` | `30` | Analyses are deleted after this many days |
| `SESSION_MAX_AGE_SECONDS` | `28800` | Session length (8 h) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed browser origins |
| `MIN_RETRAIN_ACCURACY` | `0.90` | A retrained model must reach this accuracy to be used |
| `STORE_FEEDBACK_TEXT` | `false` | Keep reported emails' text for retraining (private demos only, see Limited Use) |
| `REQUIRE_KEYS` | `false` | Refuse to start unless `SECRET_KEY` and `DATA_ENCRYPTION_KEY` are set (on in `render.yaml`) |
| `PORT` / `WEB_CONCURRENCY` | `5000` / `2` | Port and gunicorn workers in the Docker image |

Frontend:

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth client ID |
| `VITE_API_BASE_URL` | Backend URL on Vercel; leave empty locally and in Docker |
| `VITE_SUPPORT_EMAIL` | Contact address on the policy pages (optional) |
| `VITE_SITE_URL` | Public address for link previews (optional; detected automatically on Vercel) |
| `VITE_BACKEND_URL` | Where the dev proxy forwards `/api` (optional) |

## API

All endpoints except health/check need `Authorization: Bearer <session token>`.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Status, database type, model version |
| `POST /api/check` (also `/check_spam`) | Analyse pasted text without storing it |
| `POST /api/auth/google` | Sign in / register with a Google access token |
| `POST /api/auth/gmail-token` | Reconnect Gmail when Google's 1-hour token expires |
| `GET /api/auth/me` · `POST /api/auth/logout` | Current user · log out (revokes Gmail access) |
| `GET /api/emails[?cached=1]` | Fetch and analyse unread emails (or re-score stored ones) |
| `POST /api/emails/<id>/action` | `{"action": "read" \| "delete" \| "report" \| "keep"}` |
| `GET /api/history` | Previously analysed emails |
| `GET/PUT /api/preferences` | Sensitivity, summary length, emails per refresh, theme |
| `GET /api/senders` · `DELETE /api/senders/<id>` | Trusted/blocked senders |
| `POST /api/chat` | Assistant |
| `GET /api/me/export` · `DELETE /api/me` | GDPR data export · erase account |
| `GET /api/admin/stats` · `POST/GET /api/admin/retrain` · `POST /api/admin/model/reset` | Admin only |

## Project structure

```
├── Jenkinsfile                 CI/CD pipeline
├── docker-compose.yml          mongo + backend + frontend
├── ci/jenkins/                 Local Jenkins (Docker CLI + plugins)
├── frontend/                   React app (Vite, Tailwind), Dockerfile, nginx.conf
│   └── src/components/         Sidebar, EmailCard, ChatPanel, Settings/Info/Admin modals…
└── safeinbox-backend/
    ├── app.py / wsgi.py        Flask app factory / gunicorn entry point
    ├── routes.py               REST API
    ├── auth.py                 OAuth token check, sessions, roles
    ├── services.py             analysis pipeline, caching, serialisation
    ├── preprocessing.py · classifier.py · scoring.py · phishing.py · summarizer.py · chatbot.py
    ├── training.py · TrainModel.py   background retraining · rebuild the base model
    ├── encryption.py · db.py · config.py · gmail_client.py
    ├── spam_classifier.pkl · tfidf_vectorizer.pkl · spam_ham_dataset.csv
    └── tests/                  pytest suite
```

## Report requirements → implementation

| Report requirement | Where |
|---|---|
| F1 User authentication, register/login, sessions, preferences | `auth.py`, `routes.py` (`/api/auth/*`, `/api/preferences`) |
| Role-based access control | `auth.py` (`admin_required`), `ADMIN_EMAILS` |
| F2 Fetch unread emails + preprocessing (HTML, signatures) | `gmail_client.py`, `preprocessing.py` |
| F3 Naive Bayes + TF-IDF spam probability, >90 % accuracy | `classifier.py`, measured 95.3 % |
| Confidence scoring & types (likely safe / suspicious / spam), sender info | `scoring.py` |
| F4 Extractive summarization (TextRank), user-set length | `summarizer.py` |
| F5 Mark as read, delete, keep, report | `routes.py` `/api/emails/<id>/action` |
| F6 Spam analysis display | `EmailCard.jsx`, `SpamChart.jsx` |
| MongoDB storage, indexing, caching | `db.py`, `services.py` |
| Background processing / model retraining | `training.py`, admin panel |
| AES-256 encryption, OAuth, GDPR | `encryption.py`, export/delete endpoints, TTL index |
| Phishing detection | `phishing.py` |
| Customizable filters (sensitivity) | Settings, `scoring.py` |
| Chatbot interaction (UI mock-up, pseudocode) | `chatbot.py`, `ChatPanel.jsx` |
| UI mock-up: previous mails, info, dark mode | `Sidebar.jsx`, `InfoModal.jsx`, theme toggle |
| Responsive web app | Tailwind responsive layout |
| Docker / docker-compose | `*/Dockerfile`, `docker-compose.yml` |
| Jenkins CI/CD (pulls from GitHub, builds, deploys) | `Jenkinsfile`, `ci/jenkins/` (pre-configured Jenkins) |

**Not implemented (Future Scope in the report):**
- image/OCR spam detection
- BERT/RoBERTa classification
- multilingual summaries
- PWA/offline mode

Abstractive summarization (mentioned once in the SRS modules list) is also not included: it needs a large language model (the BERT-style future work). SafeInbox uses extractive TextRank summaries.
