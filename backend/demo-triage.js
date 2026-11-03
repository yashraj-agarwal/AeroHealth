/**
 * demo-triage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AeroHealth — Triage Service Demo & Verification Script
 *
 * PURPOSE:
 *   Demonstrates and verifies the triage classification service end-to-end.
 *   Run this before pushing to confirm the Azure integration (or fallback)
 *   works correctly. Output can be used verbatim in a technical interview to
 *   show what the AI triage pipeline produces.
 *
 * USAGE:
 *   # From the backend directory:
 *   node demo-triage.js
 *
 *   # With real Azure credentials:
 *   AZURE_LANGUAGE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/ \
 *   AZURE_LANGUAGE_KEY=your_key_here \
 *   node demo-triage.js
 *
 *   # Without credentials (uses rule-based fallback — still fully functional):
 *   node demo-triage.js
 *
 * Also demonstrates the 6-variable capacity model for hospital H1 (Fortis).
 */

'use strict';

// Load .env if present (optional — demo works without it)
try { require('dotenv').config(); } catch { /* dotenv optional in demo */ }

const { classifySymptoms, DEPARTMENTS, URGENCY_LABELS } = require('./services/triageService');
const { forecastCapacity } = require('./services/capacityService');

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE SYMPTOMS
// Chosen to cover a wide spread of departments and urgency levels.
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLES = [
  {
    label: 'Cardiac Emergency',
    text:  'Severe chest pain radiating to my left arm with shortness of breath and heavy sweating for the past 20 minutes.',
    expectedDept: 'Cardiology',
    expectedUrgency: 5,
  },
  {
    label: 'Neurological Event',
    text:  'Sudden severe headache, confused speech and facial drooping on the left side. Happened about 10 minutes ago.',
    expectedDept: 'Neurology',
    expectedUrgency: 5,
  },
  {
    label: 'Obstetric Emergency',
    text:  'Pregnant, 38 weeks, contractions every 3 minutes. Water broke 30 minutes ago.',
    expectedDept: 'Obstetrics',
    expectedUrgency: 4,
  },
  {
    label: 'Pediatric Fever',
    text:  'My 2-year-old infant has had a high fever of 40°C for 2 days, is not eating, and is very lethargic.',
    expectedDept: 'Pediatrics',
    expectedUrgency: 3,
  },
  {
    label: 'Psychiatric Crisis',
    text:  'I have been having thoughts of self harm and a panic attack that will not stop. I feel like I cannot breathe.',
    expectedDept: 'Psychiatry',
    expectedUrgency: 4,
  },
  {
    label: 'Gastrointestinal',
    text:  'Severe abdominal pain in the upper right quadrant, vomiting since morning, skin looks yellow.',
    expectedDept: 'Gastroenterology',
    expectedUrgency: 4,
  },
  {
    label: 'ENT / Minor',
    text:  'Mild earache, some ringing in the ear, slight nasal congestion for 3 days. No fever.',
    expectedDept: 'ENT',
    expectedUrgency: 1,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE HOSPITAL (for capacity model demo)
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_HOSPITAL = {
  id:            'h1',
  name:          'Fortis Cunningham Rd',
  beds:          380,
  occ:           238,
  avgLosHours:   28,   // ~1.2 days average stay
  deptBedRatio:  0.45, // 45% specialist beds
};

const SAMPLE_QUEUE = [
  { destName: 'Fortis Cunningham Rd', name: 'Patient A' },
  { destName: 'Fortis Cunningham Rd', name: 'Patient B' },
  { destName: 'Narayana Bommasandra', name: 'Patient C' }, // different hospital — not counted
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function pad(str, len) {
  return String(str).padEnd(len, ' ');
}

function urgencyBar(level) {
  const bars = '█'.repeat(level) + '░'.repeat(5 - level);
  const labels = ['', 'Non-Urgent', 'Low', 'Moderate', 'High', 'Critical'];
  return `[${bars}] ${level} — ${labels[level]}`;
}

function checkMark(actual, expected) {
  return actual === expected ? '✓' : `✗ (expected ${expected})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AeroHealth — Triage Classification Demo');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(`  Azure endpoint: ${process.env.AZURE_LANGUAGE_ENDPOINT || '(not configured — using fallback)'}`);
  console.log('───────────────────────────────────────────────────────────────\n');

  const results = [];

  for (let i = 0; i < SAMPLES.length; i++) {
    const sample = SAMPLES[i];
    console.log(`  [${i + 1}/${SAMPLES.length}] ${sample.label}`);
    console.log(`  Input: "${sample.text.substring(0, 80)}${sample.text.length > 80 ? '...' : ''}"`);

    const startMs = Date.now();
    let result;
    try {
      result = await classifySymptoms(sample.text);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      continue;
    }
    const elapsedMs = Date.now() - startMs;

    results.push({ sample, result, elapsedMs });

    console.log(`  Source:   ${result.source === 'azure' ? '🤖 Azure AI Language (Text Analytics for Health)' : '📋 Rule-based fallback'}`);
    console.log(`  Dept:     ${result.dept}  ${checkMark(result.dept, sample.expectedDept)}`);
    console.log(`  Urgency:  ${urgencyBar(result.urgency)}  ${checkMark(result.urgency, sample.expectedUrgency)}`);
    console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    if (result.entities.length > 0) {
      console.log(`  Azure entities: ${result.entities.slice(0, 8).join(', ')}`);
    }
    console.log(`  Latency:  ${elapsedMs}ms`);
    console.log('  ─────────────────────────────────────────────────────────');
    console.log();
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(
    `  ${pad('Label', 24)} ${pad('Dept', 20)} ${pad('Urgency', 10)} ${pad('Source', 10)} Latency`
  );
  console.log('  ' + '─'.repeat(75));
  for (const { sample, result, elapsedMs } of results) {
    console.log(
      `  ${pad(sample.label, 24)} ` +
      `${pad(result.dept, 20)} ` +
      `${pad(result.urgency + ' (' + URGENCY_LABELS[result.urgency] + ')', 20)} ` +
      `${pad(result.source, 10)} ` +
      `${elapsedMs}ms`
    );
  }

  const azureCount = results.filter(r => r.result.source === 'azure').length;
  const fallbackCount = results.length - azureCount;
  console.log('\n  ' + '─'.repeat(75));
  console.log(`  Azure AI: ${azureCount}/${results.length}   Fallback: ${fallbackCount}/${results.length}`);

  // ── All 11 Departments ────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  11 SUPPORTED DEPARTMENTS');
  console.log('═══════════════════════════════════════════════════════════════');
  DEPARTMENTS.forEach((d, i) => console.log(`  ${i + 1}.  ${d}`));

  // ── 5 Urgency Levels ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  5 URGENCY LEVELS');
  console.log('═══════════════════════════════════════════════════════════════');
  Object.entries(URGENCY_LABELS).forEach(([level]) => {
    console.log(`  ${urgencyBar(parseInt(level))}`);
  });

  // ── 6-Variable Capacity Model Demo ───────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  6-VARIABLE CAPACITY FORECAST DEMO');
  console.log(`  Hospital: ${SAMPLE_HOSPITAL.name}`);
  console.log('═══════════════════════════════════════════════════════════════');
  const forecast = forecastCapacity(SAMPLE_HOSPITAL, SAMPLE_QUEUE);
  console.log(`\n  Current occupancy: ${Math.round((SAMPLE_HOSPITAL.occ / SAMPLE_HOSPITAL.beds) * 100)}%`);
  console.log(`  Forecasted (T+60): ${forecast.p60}%  Trend: ${forecast.trend}`);
  console.log(`  Method: ${forecast.method}`);
  console.log('\n  Input Variables:');
  const v = forecast.variables;
  console.log(`    V1  wardOccupancyRate      = ${(v.wardOccupancyRate * 100).toFixed(1)}%  (current ${SAMPLE_HOSPITAL.occ}/${SAMPLE_HOSPITAL.beds} beds)`);
  console.log(`    V2  dischargeRate          = ${v.dischargeRate.toFixed(2)} patients/hour  (based on avgLos=${v.avgLengthOfStayHours}h)`);
  console.log(`    V3  incomingAmbulanceCount = ${v.incomingAmbulanceCount}  (active ambulances in queue bound for this hospital)`);
  console.log(`    V4  avgLengthOfStayHours   = ${v.avgLengthOfStayHours}h`);
  console.log(`    V5  deptBedRatio           = ${(v.deptBedRatio * 100).toFixed(0)}%  (specialist bed fraction)`);
  console.log(`    V6  timeOfDayLoadFactor    = ${v.timeOfDayLoadFactor}  (hour ${new Date().getHours()}:00 load)`);

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n[demo-triage] Fatal error:', err.message);
  process.exit(1);
});
