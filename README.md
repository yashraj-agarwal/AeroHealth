# AeroHealth 🏥

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)
![Azure AI](https://img.shields.io/badge/Azure_AI-Language-0078D4?style=flat&logo=microsoftazure&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat&logo=socket.io&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat&logo=python&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

**Real-time AI-driven healthcare routing platform for Bengaluru metropolitan hospitals.**

AeroHealth routes incoming patients to the optimal hospital by combining an NLP triage engine (Azure AI Language — Text Analytics for Health), a 6-variable capacity forecasting model, and a live Socket.IO dispatch system. The Command Center admin dashboard delivers real-time telemetry, triage queues, and spatial ambulance routing.

---

## Features

- **AI Triage Engine** — Azure AI Language (Text Analytics for Health) classifies free-text symptom descriptions into one of 11 departments and 5 urgency levels
- **6-Variable Capacity Forecasting** — predicts each hospital's ward occupancy 60 minutes into the future using a transparent weighted linear model
- **Live Hospital Capacity** — real-time occupancy, ICU, and emergency bed tracking across 6 Bengaluru hospitals
- **Dynamic Rerouting** — ambulances are automatically redirected if a destination hospital reaches saturation during transit
- **Weighted Hospital Scoring** — ranks candidate hospitals using 6 configurable weights (urgency match, dept availability, occupancy, predicted load, travel time, ICU availability)
- **Route Simulation** — animated ambulance routing with Haversine distance calculation and peak-hour traffic modelling
- **Admin Command Center** — real-time dashboard with live map, triage feed, hospital health scores, telemetry feed, predictive load charts, analytics summary, and system health monitoring

---

## Architecture Decisions

> These are the four biggest design choices in the project — each involved a real alternative with a measurable cost. This section documents the reasoning, not just the outcome.

### 1. Azure AI Language (managed SaaS) over a self-hosted NLP model

**Decision:** Use Azure AI Language — Text Analytics for Health via the `@azure/ai-language-text` SDK rather than hosting an open-source clinical NLP model (e.g. Med7, scispaCy, or fine-tuned BioBERT).

**Alternative considered:** Self-host a Hugging Face clinical NER model on an Azure VM or AKS cluster.

**Why not:** A self-hosted model requires a GPU-enabled VM (minimum NC6s v3, ~$0.90/hr), a custom inference API, model versioning, and ongoing retraining as clinical vocabulary evolves. For a healthcare deployment where auditability matters, a Microsoft-backed managed service with a clear data processing agreement is the lower-risk path. The free tier (5,000 records/month) is zero-cost for this use case.

**Trade-off accepted:** External SaaS dependency. If Azure is unreachable, classification falls back to the rule-based keyword classifier (fallback branch in `triageService.js`). The fallback is always present and tested — the system degrades gracefully, never fails hard.

---

### 2. Socket.IO over HTTP polling for the live triage queue

**Decision:** Use Socket.IO (WebSocket with long-poll fallback) to push triage queue updates to the Admin Command Center in real time.

**Alternative considered:** Client-side `setInterval` polling — the dashboard hits `GET /api/queue` every 2–3 seconds.

**Why not:** Polling generates a fixed HTTP round-trip per client regardless of whether anything changed. At 3-second intervals with 10 concurrent admin sessions, that is ~200 requests/minute of pure overhead. More critically, polling introduces a 0–3 second lag on critical events (new cardiac patient arriving, ICU saturation alert). Socket.IO pushes updates within milliseconds of the event using a single persistent connection.

**Trade-off accepted:** Socket.IO is stateful. Horizontal scaling (multiple Node.js instances) requires a Redis adapter (`socket.io-adapter-redis`) to share state across instances. The current single-process implementation is sufficient for a prototype; the migration path is well-documented and non-breaking.

---

### 3. OSRM (open-source routing) over a paid routing API

**Decision:** Use the OSRM routing engine (`router.project-osrm.org`) in the Python simulator, with a Haversine straight-line fallback built into `SpatialService`.

**Alternative considered:** Azure Maps Route API or Google Maps Directions API.

**Why not:** Azure Maps charges per transaction (Route Matrix: $5.50/1,000 calls; Directions: $4.50/1,000). For a real-time system running a route calculation on every dispatch or reroute event, costs scale fast. OSRM runs on OpenStreetMap data, is MIT-licensed, and the self-hosted version has no per-call cost. The public demo server is acceptable for a prototype.

**Trade-off accepted:** The public OSRM demo server has no SLA and occasionally throttles. When it does, `simulate.py` falls back to Haversine distance, which slightly overestimates ETA (straight-line vs road network). In production, OSRM would be self-hosted on an Azure VM (~$30/month) or replaced with Azure Maps once usage volume is validated.

---

### 4. In-memory rate limiting over a Redis-backed solution

**Decision:** Implement a sliding-window rate limiter (10 req/IP/minute on `POST /api/triage`) using a plain JavaScript `Map` in the Node.js process, rather than an external store.

**Alternative considered:** `express-rate-limit` with an `ioredis` store backed by Azure Cache for Redis.

**Why not:** Azure Cache for Redis adds $16–55/month (Basic C1–C2 tier), an additional network hop, and operational overhead. For a single-instance prototype, an in-memory store is functionally equivalent at zero cost. The logic is 10 lines and trivially replaceable.

**Trade-off accepted:** The in-memory store resets on server restart and does not share state across horizontal instances. The code comment in `server.js` explicitly calls this out. The decision is deliberate, documented, and reversible — a production migration only requires swapping the `isRateLimited()` function body.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, CSS-in-JS |
| Backend | Node.js, Express, Socket.IO |
| **AI Triage** | **Azure AI Language — Text Analytics for Health** (`@azure/ai-language-text`) |
| Simulation | Python, Requests, OSRM API (road routing) |
| Spatial routing | Haversine formula (Azure Maps-ready) |

---

## Architecture

```
Patient (browser)
    │
    │ POST /api/classify (symptom text)
    ▼
backend/server.js  ──────────────────────────────────────────────────────┐
    │                                                                     │
    ├─► backend/services/triageService.js                                │
    │       │  Azure AI Language → AnalyzeHealthcareEntitiesAction       │
    │       │  extracts clinical NLP entities (symptoms, diagnoses,      │
    │       │  body structures) from free text                           │
    │       │  → entity scores mapped to department + urgency level      │
    │       │  Fallback: keyword classifier (no Azure key required)      │
    │       └─► { dept, urgency, urgencyLabel, confidence, source }      │
    │                                                                     │
    ├─► backend/services/capacityService.js                              │
    │       │  6-variable linear model forecasts p60 occupancy           │
    │       └─► { p60, trend, variables }                                │
    │                                                                     │
    └─► Socket.IO → Admin Command Center (real-time queue updates) ──────┘

simulate.py (Python)
    │  OSRM API road routing → ambulance telemetry
    │  POST /api/triage (patient + GPS)
    └──► backend/server.js → AI triage → queue → Socket.IO broadcast
```

### AI Triage Flow

```
Symptom text (free text, any length)
    │
    ▼
Azure AI Language — Text Analytics for Health
    extracts: SymptomOrSign, Diagnosis, BodyStructure entities
    │
    ▼
Domain mapper (triageService.js)
    entity text → keyword scoring → department (1 of 11)
    entity category + urgency signals → urgency (1–5)
    │
    ▼
{ dept, urgency, urgencyLabel, confidence, source: "azure" | "fallback" }
    │
    ▼
Hospital ranking (ScoreEngine)
    scores each hospital on: urgency match × dept availability ×
    occupancy × predicted load × travel time × ICU availability
    │
    ▼
Optimal hospital dispatched
```

---

## AI Triage: 11 Departments & 5 Urgency Levels

**Departments:**

| # | Department | Key Conditions |
|---|---|---|
| 1 | Emergency | Trauma, cardiac arrest, unconscious, severe bleeding |
| 2 | Cardiology | Chest pain, heart attack, arrhythmia, angina |
| 3 | Neurology | Stroke, seizure, head injury, paralysis |
| 4 | Pulmonology | Respiratory failure, asthma, pneumonia, COPD |
| 5 | Orthopedics | Fractures, joint injuries, spine, disc |
| 6 | Pediatrics | Children, infants, neonatal |
| 7 | Obstetrics | Labour, pregnancy, delivery, eclampsia |
| 8 | Gastroenterology | Abdominal pain, liver, GI bleeding |
| 9 | Psychiatry | Suicidal ideation, panic attacks, psychosis |
| 10 | ENT | Ear, throat, sinus, vertigo |
| 11 | General Medicine | Fever, infections, flu, chronic conditions |

**Urgency Levels:**

| Level | Label | Criteria |
|---|---|---|
| 5 | Critical | Unconscious, cardiac arrest, not breathing, stroke |
| 4 | High | Chest pain, head injury, seizure, high fever, overdose |
| 3 | Moderate | Moderate pain, vomiting, infection, dizziness |
| 2 | Low | Mild pain, mild fever, fatigue, rash |
| 1 | Non-Urgent | Minor symptoms, routine follow-up |

---

## 6-Variable Capacity Forecasting Model

The model produces a 60-minute occupancy forecast per hospital using six independently-sourced variables in a weighted linear formula. It is implemented in [`backend/services/capacityService.js`](backend/services/capacityService.js) (backend) and mirrored in `src/App.jsx` `PredictiveService` (frontend).

| Variable | Source | Role |
|---|---|---|
| **V1** `wardOccupancyRate` | Live — `occ / beds` | Current capacity pressure |
| **V2** `dischargeRate` | Derived — `occ / avgLosHours` | Beds freed per hour |
| **V3** `incomingAmbulanceCount` | Live — triage queue count | Near-term admission demand |
| **V4** `avgLengthOfStayHours` | Per-hospital config | Bed turnover speed |
| **V5** `deptBedRatio` | Per-hospital config | Specialist bed flexibility |
| **V6** `timeOfDayLoadFactor` | 24-point empirical curve | Hour-of-day admission pattern |

**Formula:**

```
netChange   = (incomingAmbulanceCount − dischargeRate) / totalBeds
deptPressure = 0.8 + deptBedRatio × 0.4           # maps [0,1] → [0.8,1.2]
p60 = clamp((currentOcc% + netChange×100) × timeOfDayLoadFactor × deptPressure, 0, 100)
```

The time-of-day curve captures morning rush (08:00–10:00, factor ≈1.4–1.5), evening rush (17:00–20:00, factor ≈1.3–1.5), and quiet overnight periods (02:00–04:00, factor ≈0.73–0.75).

---

## Installation & Setup

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.9 (for simulator)
- An Azure account (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/yashraj-agarwal/AeroHealth.git
cd AeroHealth

# Frontend
npm install

# Backend
cd backend
npm install
cd ..
```

### 2. Configure Azure AI Language (required for real AI triage)

1. Create an **Azure Language** resource at [portal.azure.com](https://portal.azure.com) → "Language service" → Free tier (F0)
2. After deployment, go to **Keys and Endpoint** in the resource blade
3. Copy `.env.example` to `.env` in the repo root and fill in your values:

```bash
cp .env.example .env
```

```env
AZURE_LANGUAGE_ENDPOINT=https://<your-resource-name>.cognitiveservices.azure.com/
AZURE_LANGUAGE_KEY=<your-32-char-key>
```

> **Without Azure credentials:** the backend falls back to the rule-based keyword classifier automatically. All features work end-to-end; the triage source badge in the UI shows `📋 Rule-based classifier` instead of `🤖 Azure AI Language`.

### 3. Run

**Frontend** (patient portal + admin dashboard):
```bash
npm run dev
```

**Backend** (Command Center server):
```bash
cd backend
npm start       # production
# or
npm run dev     # with nodemon auto-reload
```

**Python simulator** (telemetry + ambulance simulation):
```bash
python simulate.py
```

### 4. Verify the AI triage works

```bash
cd backend
node demo-triage.js
```

This runs 7 sample symptom strings through the classifier and prints the classified department, urgency level, confidence, source (Azure or fallback), and all extracted Azure entities. Also demos the 6-variable capacity model.

---

## Project Structure

```
AeroHealth/
├── backend/
│   ├── services/
│   │   ├── triageService.js      # Azure AI Language + fallback classifier
│   │   └── capacityService.js    # 6-variable capacity forecasting model
│   ├── server.js                 # Express + Socket.IO server
│   ├── demo-triage.js            # Verification / demo script
│   └── package.json
├── src/
│   ├── App.jsx                   # React frontend (patient portal + admin dashboard)
│   └── main.jsx
├── simulate.py                   # Python telemetry simulator (OSRM routing)
├── .env.example                  # Required environment variables template
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/triage` | Submit a patient (from simulator). Rate-limited (10/min/IP), input-validated, runs AI triage, queues patient, broadcasts via Socket.IO |
| `POST` | `/api/classify` | Direct Azure AI triage classification. Returns `{ dept, urgency, urgencyLabel, confidence, source }` |
| `GET` | `/api/capacity/:hospitalId` | 6-variable capacity forecast for a hospital |
| `GET` | `/api/health` | System health status: Azure AI status, call count, error count, avg latency, server uptime stats |
| `POST` | `/api/update_location` | Update ambulance GPS coordinates |
| `POST` | `/api/reroute` | Reroute ambulance to a different hospital |
| `POST` | `/api/remove_patient` | Remove patient from queue on arrival |

---

## Disclaimer

This is a prototype / student project. In real emergencies, always call **112** immediately. Not for clinical use.
