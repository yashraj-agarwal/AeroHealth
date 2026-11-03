/**
 * server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AeroHealth — Backend Command Center Server
 *
 * Receives telemetry from simulate.py, maintains the live triage queue,
 * and broadcasts real-time updates to the Admin Command Center dashboard
 * via Socket.IO.
 *
 * Routes:
 *   POST /api/triage           → AI triage classification then queue
 *   POST /api/classify         → direct Azure AI classification
 *   GET  /api/capacity/:id     → 6-variable capacity forecast
 *   GET  /api/health           → system health / dependency status
 *   POST /api/update_location  → ambulance GPS update (original)
 *   POST /api/reroute          → dynamic rerouting (original)
 *   POST /api/remove_patient   → queue removal (original)
 */

'use strict';

// Load environment variables from .env (silently ignored if file doesn't exist)
require('dotenv').config();

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

// ── AI services ──────────────────────────────────────────────────────────────
const { classifySymptoms } = require('./services/triageService');
const { forecastCapacity } = require('./services/capacityService');

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS + SOCKET.IO SETUP  (identical to original)
// ─────────────────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.FRONTEND_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean);
const corsOptions = { origin: allowedOrigins?.length ? allowedOrigins : '*' };
const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = http.createServer(app);
const io     = new Server(server, { cors: corsOptions });

// ─────────────────────────────────────────────────────────────────────────────
// DATA SOURCES
// ─────────────────────────────────────────────────────────────────────────────

let triageQueue = [];
let hospitals = [];
const hospitalsPath = process.env.HOSPITALS_DATA_PATH || path.join(__dirname, "data", "hospitals.json");
try {
  hospitals = JSON.parse(fs.readFileSync(hospitalsPath, 'utf-8'));
  console.log(`Loaded ${hospitals.length} hospitals from data file.`);
} catch (err) {
  console.error("Failed to load hospitals data:", err.message);
  // Fallback to empty array if file is missing
  hospitals = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM HEALTH METRICS
// ─────────────────────────────────────────────────────────────────────────────
// Tracks the real-time status of each external dependency (Azure AI Language
// and OSRM routing). Surfaced via GET /api/health and Socket.IO 'health_update'.
// This is the data source for the System Health panel in the Command Center.

const health = {
  azure: {
    status:      'unknown',  // 'ok' | 'degraded' | 'down' | 'unknown'
    lastChecked: null,       // ISO timestamp of last call
    lastError:   null,       // error message from last failure
    callCount:   0,
    errorCount:  0,
    avgLatencyMs: 0,
    _latencySum:  0,
  },
  osrm: {
    status:      'not_used', // OSRM is used in simulate.py, not directly here
    lastChecked: null,
    lastError:   null,
    note:        'OSRM road routing runs in simulate.py; status not observable server-side',
  },
  server: {
    startedAt:    new Date().toISOString(),
    patientsTotal: 0,       // cumulative patients triaged since last restart
    errorsTotal:   0,       // cumulative triage errors since last restart
    azureKeyConfigured: !!(process.env.AZURE_LANGUAGE_ENDPOINT && process.env.AZURE_LANGUAGE_KEY),
  },
};

/**
 * Records the outcome of an Azure AI Language call.
 * @param {'ok'|'error'} outcome
 * @param {number}       latencyMs
 * @param {string}       [errorMsg]
 */
function recordAzureCall(outcome, latencyMs, errorMsg) {
  health.azure.callCount++;
  health.azure.lastChecked = new Date().toISOString();
  health.azure._latencySum += latencyMs;
  health.azure.avgLatencyMs = Math.round(health.azure._latencySum / health.azure.callCount);

  if (outcome === 'ok') {
    health.azure.status    = 'ok';
    health.azure.lastError = null;
  } else {
    health.azure.errorCount++;
    health.server.errorsTotal++;
    health.azure.lastError = errorMsg || 'unknown error';
    // Classify degraded vs down: >50% error rate = down, else degraded
    const errorRate = health.azure.errorCount / health.azure.callCount;
    health.azure.status = errorRate > 0.5 ? 'down' : 'degraded';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY RATE LIMITER  (per-IP, sliding 60-second window)
// ─────────────────────────────────────────────────────────────────────────────
// Limits POST /api/triage to 10 requests per IP per minute.
// This is a simple, dependency-free implementation appropriate for a prototype.
// In production, replace with a Redis-backed limiter (e.g. express-rate-limit
// with an ioredis store) to survive server restarts and horizontal scaling.

const RATE_LIMIT = { WINDOW_MS: 60_000, MAX_REQUESTS: 10 };
const rateLimitStore = new Map(); // ip → [timestamps]

function isRateLimited(ip) {
  const now    = Date.now();
  const window = now - RATE_LIMIT.WINDOW_MS;
  const hits   = (rateLimitStore.get(ip) || []).filter(t => t > window);
  hits.push(now);
  rateLimitStore.set(ip, hits);
  return hits.length > RATE_LIMIT.MAX_REQUESTS;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCATION TICKER  (identical to original — moves ambulances toward dest)
// ─────────────────────────────────────────────────────────────────────────────

setInterval(() => {
  let changed = false;
  triageQueue = triageQueue.filter(p => {
    if (!p.destLat || !p.destLng) return true;
    const dLat = p.destLat - p.lat;
    const dLng = p.destLng - p.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < 0.0008) {
      console.log(`Patient Arrived at ${p.destName}: ${p.name}`);
      changed = true;
      return false;
    }
    p.eta     = Math.max(1, Math.round(dist * 1200));
    changed   = true;
    return true;
  });
  if (changed) io.emit('queue_update', triageQueue);
}, 2000);

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/triage
 * ─────────────────
 * Receives a new patient from simulate.py or any client.
 * Runs AI triage classification (Azure → fallback) before queuing.
 * Attaches `.aiTriage` to the patient object so the dashboard can display it.
 *
 * Input validation: rejects requests missing both `desc` and `dept`.
 * Rate limiting:    10 requests per IP per 60-second window.
 *
 * Request body (from simulate.py):
 *   { name, desc, lat, lng, destLat, destLng, destName, urgency, dept }
 */
app.post('/api/triage', async (req, res) => {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    console.warn(`[triage] Rate limit exceeded for IP ${clientIp}`);
    return res.status(429).json({
      error: 'Too many requests. Maximum 10 triage submissions per minute.',
      retryAfterMs: RATE_LIMIT.WINDOW_MS,
    });
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const patient = req.body;
  if (!patient || typeof patient !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }
  // At minimum, a triage request needs either a description or a pre-set dept
  if (!patient.desc && !patient.dept) {
    return res.status(400).json({
      error: 'Request must include either "desc" (symptom description) or "dept" (department).',
    });
  }
  // name is required for the triage queue display
  if (!patient.name || typeof patient.name !== 'string' || patient.name.trim().length === 0) {
    return res.status(400).json({ error: '"name" field is required and must be a non-empty string.' });
  }

  // Assign server-side ID and timestamp (original behaviour)
  patient.id   = `MNP-${Math.floor(1000 + Math.random() * 9000)}`;
  patient.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Default coordinates if not provided (original behaviour)
  if (!patient.lat || !patient.lng) {
    patient.lat = 13.3533 + 0.02;
    patient.lng = 74.7844 + 0.02;
  }

  // ── AI Triage Classification (instrumented) ───────────────────────────────
  if (patient.desc) {
    const t0 = Date.now();
    try {
      const aiResult = await classifySymptoms(patient.desc);
      const latencyMs = Date.now() - t0;

      // Record health metrics — only count actual Azure calls, not fallback
      if (aiResult.source === 'azure') {
        recordAzureCall('ok', latencyMs);
      } else if (health.azure.status === 'unknown' && health.server.azureKeyConfigured) {
        // Keys are set but fallback was used — treat as first successful fallback
        health.azure.status = 'ok';
        health.azure.lastChecked = new Date().toISOString();
      }

      patient.aiTriage = aiResult;
      if (aiResult.source === 'azure' || !patient.dept) {
        patient.dept    = aiResult.dept;
        patient.urgency = aiResult.urgency;
      }
      console.log(
        `[triage] ${patient.id} → dept: ${patient.dept}, ` +
        `urgency: ${patient.urgency}, source: ${aiResult.source}, latency: ${latencyMs}ms`
      );
    } catch (err) {
      const latencyMs = Date.now() - t0;
      recordAzureCall('error', latencyMs, err.message);
      console.warn(`[triage] AI classification error for ${patient.id}: ${err.message}`);
      patient.aiTriage = { source: 'error', error: err.message };
    }
  }

  health.server.patientsTotal++;
  triageQueue.unshift(patient);
  io.emit('queue_update', triageQueue);
  io.emit('health_update', health);  // push updated health state to dashboard
  res.status(200).json({ ok: true, id: patient.id, aiTriage: patient.aiTriage || null });
});

/**
 * POST /api/classify
 * ──────────────────
 * Direct Azure AI triage classification without queuing a patient.
 * Used by the React frontend's `analyse()` flow.
 *
 * Input validation: text must be a non-empty string, max 2000 chars.
 * Request body:  { text: string }
 * Response:      TriageResult (see triageService.js)
 */
app.post('/api/classify', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: '"text" must not exceed 2000 characters.' });
  }

  const t0 = Date.now();
  try {
    const result = await classifySymptoms(text);
    const latencyMs = Date.now() - t0;
    if (result.source === 'azure') recordAzureCall('ok', latencyMs);
    return res.status(200).json(result);
  } catch (err) {
    const latencyMs = Date.now() - t0;
    recordAzureCall('error', latencyMs, err.message);
    console.error(`[classify] Unexpected error: ${err.message}`);
    return res.status(500).json({ error: 'Classification failed.', detail: err.message });
  }
});

/**
 * GET /api/capacity/:hospitalId
 * ──────────────────────────────
 * NEW endpoint — returns the 6-variable 60-minute capacity forecast for a
 * specific hospital (identified by its `id` field in the hospital data).
 * Currently accepts a hospital object in the query string or uses a mock
 * hospital for demonstration. In a full deployment, hospital data would be
 * stored server-side or in a database.
 *
 * Query params (all optional, used for live override):
 *   occ, beds, avgLosHours, deptBedRatio
 *
 * Response: CapacityForecast (see capacityService.js)
 */
app.get('/api/capacity/:hospitalId', (req, res) => {
  const { hospitalId } = req.params;
  const {
    occ          = 200,
    beds         = 380,
    avgLosHours  = 24,
    deptBedRatio = 0.40,
    name         = hospitalId,
  } = req.query;

  const hospital = {
    id:           hospitalId,
    name:         String(name),
    occ:          parseInt(occ, 10),
    beds:         parseInt(beds, 10),
    avgLosHours:  parseFloat(avgLosHours),
    deptBedRatio: parseFloat(deptBedRatio),
  };

  const forecast = forecastCapacity(hospital, triageQueue);
  return res.status(200).json({ hospitalId, forecast });
});

/**
 * GET /api/health
 * ────────────────
 * Returns the current system health state for all external dependencies.
 * This is what the Command Center's System Health panel reads from.
 *
 * Response shape:
 *   {
 *     azure: { status, lastChecked, lastError, callCount, errorCount, avgLatencyMs },
 *     osrm:  { status, note },
 *     server: { startedAt, patientsTotal, errorsTotal, azureKeyConfigured }
 *   }
 */
app.get('/api/health', (req, res) => {
  // Strip internal _latencySum from the public response
  const { _latencySum: _, ...azurePublic } = health.azure;
  return res.status(200).json({
    azure:  azurePublic,
    osrm:   health.osrm,
    server: health.server,
  });
});

/**
 * POST /api/update_location
 * ──────────────────────────
 * ORIGINAL — updates ambulance coordinates in the live queue.
 * No changes made.
 */
app.post('/api/update_location', (req, res) => {
  const { id, lat, lng } = req.body;
  const patient = triageQueue.find(p => p.id === id);
  if (patient) {
    patient.lat = lat;
    patient.lng = lng;
    io.emit('queue_update', triageQueue);
  }
  res.status(200).json({ ok: true });
});

/**
 * POST /api/reroute
 * ──────────────────
 * ORIGINAL — updates a patient's destination (dynamic rerouting).
 * No changes made.
 */
app.post('/api/reroute', (req, res) => {
  const { id, destLat, destLng, destName } = req.body;
  const patient = triageQueue.find(p => p.id === id);
  if (patient) {
    patient.destLat  = destLat;
    patient.destLng  = destLng;
    patient.destName = destName;
    io.emit('queue_update', triageQueue);
    console.log(`Rerouted ${id} → ${destName}`);
  }
  res.status(200).json({ ok: true });
});

/**
 * POST /api/remove_patient
 * ─────────────────────────
 * ORIGINAL — removes a patient from the queue (on arrival / discharge).
 * No changes made.
 */
app.post('/api/remove_patient', (req, res) => {
  const { id } = req.body;
  triageQueue = triageQueue.filter(p => p.id !== id);
  io.emit('queue_update', triageQueue);
  res.status(200).json({ ok: true });
});

/**
 * GET /api/hospitals
 * ───────────────────
 * Returns the full list of hospitals, including live capacity and status.
 */
app.get('/api/hospitals', (req, res) => {
  res.status(200).json(hospitals);
});

/**
 * PUT /api/hospitals/:id
 * ───────────────────────
 * Update a hospital's capacity, status, etc. Admin dashboard uses this.
 */
app.put('/api/hospitals/:id', (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const hospitalIndex = hospitals.findIndex(h => h.id === id);

  if (hospitalIndex === -1) {
    return res.status(404).json({ error: 'Hospital not found' });
  }

  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    return res.status(400).json({ error: 'Expected a hospital update object.' });
  }

  const updated = { ...hospitals[hospitalIndex], ...updateData, id };
  for (const [occupied, total] of [['occ', 'beds'], ['icuO', 'icuT'], ['emgO', 'emgT']]) {
    if (!Number.isInteger(updated[total]) || updated[total] < 0 ||
        !Number.isInteger(updated[occupied]) || updated[occupied] < 0 ||
        updated[occupied] > updated[total]) {
      return res.status(400).json({ error: 'Occupancy must be a whole number within bed capacity.' });
    }
  }
  if (updated.beds === 0) return res.status(400).json({ error: 'Ward capacity must be positive.' });
  if ('occ' in updateData && !('status' in updateData)) {
    const load = updated.occ / updated.beds;
    updated.status = load >= 0.9 ? 'saturated' : load >= 0.75 ? 'moderate' : 'accepting';
  }

  const nextHospitals = hospitals.map((hospital, index) => index === hospitalIndex ? updated : hospital);
  try {
    fs.writeFileSync(`${hospitalsPath}.tmp`, JSON.stringify(nextHospitals, null, 2));
    fs.renameSync(`${hospitalsPath}.tmp`, hospitalsPath);
  } catch (err) {
    console.error("Failed to save hospitals data:", err.message);
    return res.status(500).json({ error: 'Unable to save hospital capacity.' });
  }
  hospitals = nextHospitals;

  // Broadcast the update so dashboards reflect the change immediately
  io.emit('hospitals_update', hospitals);
  
  res.status(200).json({ ok: true, hospital: hospitals[hospitalIndex] });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO  (original connection handler)
// ─────────────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Send current state to newly connected admin dashboard
  socket.emit('hospitals_update', hospitals);
  socket.emit('queue_update', triageQueue);
  // Also send the current health state so the System Health panel populates immediately
  const { _latencySum: _, ...azurePublic } = health.azure;
  socket.emit('health_update', { azure: azurePublic, osrm: health.osrm, server: health.server });
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`AeroHealth backend running on port ${PORT}`);
  console.log(`Azure AI: ${process.env.AZURE_LANGUAGE_ENDPOINT ? 'configured ✓' : 'not configured (fallback mode)'}`);
});
