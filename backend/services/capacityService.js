/**
 * capacityService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AeroHealth — 6-Variable Hospital Capacity Forecasting Model
 *
 * Forecasts each hospital's ward occupancy 60 minutes into the future using
 * six real, independently-sourced input variables. The model is a weighted
 * linear formula — intentionally transparent and interview-explainable.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * THE 6 VARIABLES
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  V1  wardOccupancyRate      (float, 0–1)
 *      Current occupied beds / total beds. The single strongest predictor of
 *      near-term capacity pressure.
 *      Source: live hospital object (h.occ / h.beds).
 *
 *  V2  dischargeRate          (float, patients/hour)
 *      Estimated number of patients discharged per hour, based on average
 *      length of stay (V4). Represents capacity being freed.
 *      Derived: h.occ / h.avgLosHours   (steady-state turnover rate).
 *
 *  V3  incomingAmbulanceCount (integer, ≥ 0)
 *      Number of active ambulances in the live triage queue currently routed
 *      to this hospital. Directly represents near-term admission pressure.
 *      Source: triageQueue filtered by destName matching hospital name.
 *
 *  V4  avgLengthOfStayHours   (float, hours)
 *      Hospital-specific average length of stay per admitted patient. Governs
 *      how quickly beds turn over (feeds V2 discharge rate).
 *      Source: per-hospital constant (configured in hospital data).
 *
 *  V5  deptBedRatio           (float, 0–1)
 *      Ratio of specialist department beds to total hospital beds. Hospitals
 *      with more specialist departments have less flexible capacity (higher
 *      effective pressure for any given occupancy).
 *      Source: per-hospital constant (configured in hospital data).
 *
 *  V6  timeOfDayLoadFactor    (float, 0.7–1.5)
 *      Hour-of-day weight derived from an empirically-shaped 24-point load
 *      curve. Captures morning rush (8–10), evening rush (17–20), and quiet
 *      overnight periods.
 *      Source: current system clock hour.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * THE FORMULA
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Let:
 *    currentPct  = wardOccupancyRate × 100                  (e.g. 62%)
 *    discharge1h = dischargeRate × 1.0                      (patients freed in 60 min)
 *    admissions  = incomingAmbulanceCount                   (patients arriving in 60 min)
 *    netChange   = (admissions − discharge1h) / totalBeds   (net % change)
 *    adjusted    = (currentPct + netChange × 100)
 *                   × timeOfDayLoadFactor
 *                   × (0.8 + deptBedRatio × 0.4)           (dept pressure multiplier)
 *
 *  p60 = clamp(adjusted, 0, 100)
 *
 *  The dept-pressure multiplier maps deptBedRatio ∈ [0,1] → [0.8, 1.2]:
 *    low specialist ratio  → more flex beds → lower effective pressure
 *    high specialist ratio → less flex     → higher effective pressure
 *
 * Exported API:
 *   forecastCapacity(hospital, triageQueue) → CapacityForecast
 *
 * CapacityForecast shape:
 *   {
 *     p60:       number,   // projected occupancy % at T+60 min (0–100)
 *     trend:     string,   // "up" | "down" | "stable"
 *     method:    string,   // "6var-linear"
 *     variables: {         // all 6 input values (for transparency / interviews)
 *       wardOccupancyRate:      number,
 *       dischargeRate:          number,
 *       incomingAmbulanceCount: number,
 *       avgLengthOfStayHours:   number,
 *       deptBedRatio:           number,
 *       timeOfDayLoadFactor:    number,
 *     }
 *   }
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// TIME-OF-DAY LOAD CURVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 24-point load factor curve (index = hour, 0–23).
 * Values calibrated to typical Indian hospital admission patterns:
 *   - Morning peak: 8–10 (OPD opens, overnight emergency surge)
 *   - Evening peak: 17–20 (post-work accidents, elective admissions)
 *   - Quiet: 1–5 (minimal new admissions overnight)
 */
const TIME_OF_DAY_LOAD = [
  0.82, // 00:00
  0.78, // 01:00
  0.75, // 02:00
  0.73, // 03:00
  0.74, // 04:00
  0.79, // 05:00
  0.88, // 06:00
  0.97, // 07:00
  1.28, // 08:00  ← morning peak
  1.45, // 09:00  ← morning peak
  1.40, // 10:00  ← morning peak
  1.25, // 11:00
  1.18, // 12:00
  1.10, // 13:00
  1.05, // 14:00
  1.08, // 15:00
  1.15, // 16:00
  1.38, // 17:00  ← evening peak
  1.50, // 18:00  ← evening peak (highest)
  1.42, // 19:00  ← evening peak
  1.30, // 20:00
  1.15, // 21:00
  1.00, // 22:00
  0.90, // 23:00
];

/**
 * Returns the time-of-day load factor for the current hour.
 * @param {Date} [now] - Optional date for testing; defaults to new Date().
 * @returns {number}
 */
function getTimeOfDayLoadFactor(now) {
  const hour = (now || new Date()).getHours();
  return TIME_OF_DAY_LOAD[hour];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FORECAST FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forecasts a hospital's ward occupancy at T+60 minutes using the 6-variable
 * linear model described in the module header.
 *
 * @param {object} hospital - Hospital data object. Must have:
 *   { occ, beds, avgLosHours, deptBedRatio }
 *   avgLosHours   — average patient length of stay (hours). Default: 24.
 *   deptBedRatio  — fraction of beds in specialist departments. Default: 0.4.
 *
 * @param {Array}  triageQueue - Live queue from server.js. Each entry has
 *   { destName, ... }. Used to count inbound ambulances for this hospital.
 *
 * @returns {CapacityForecast}
 */
function forecastCapacity(hospital, triageQueue = []) {
  const {
    occ,
    beds,
    name,
    avgLosHours   = 24,
    deptBedRatio  = 0.40,
  } = hospital;

  // Guard: avoid division by zero
  const safeBeds    = beds > 0 ? beds : 1;
  const safeLos     = avgLosHours > 0 ? avgLosHours : 24;

  // ── V1: Ward Occupancy Rate ──────────────────────────────────────────────
  const wardOccupancyRate = occ / safeBeds;

  // ── V2: Discharge Rate (patients / hour) ─────────────────────────────────
  // Under steady-state, if avgLos = 24h, each occupied bed turns over once
  // per day → dischargeRate = occ / avgLosHours patients per hour.
  const dischargeRate = occ / safeLos;

  // ── V3: Incoming Ambulance Count ─────────────────────────────────────────
  const incomingAmbulanceCount = triageQueue.filter(
    p => p.destName && name && p.destName.includes(name.split(' ')[0])
  ).length;

  // ── V4: Average Length of Stay ───────────────────────────────────────────
  const avgLengthOfStayHours = safeLos;

  // ── V5: Dept Bed Ratio ───────────────────────────────────────────────────
  const deptBedRatioVal = Math.min(1, Math.max(0, deptBedRatio));

  // ── V6: Time-of-Day Load Factor ──────────────────────────────────────────
  const timeOfDayLoadFactor = getTimeOfDayLoadFactor();

  // ── FORMULA ──────────────────────────────────────────────────────────────
  const currentPct     = wardOccupancyRate * 100;
  const discharge1h    = dischargeRate;                         // patients freed in 1h
  const admissions     = incomingAmbulanceCount;                // patients arriving in 1h
  const netPatients    = admissions - discharge1h;              // net patient Δ in 1h
  const netChangePct   = (netPatients / safeBeds) * 100;        // as % of total beds

  // dept pressure: maps [0,1] → [0.8, 1.2]
  const deptPressure   = 0.8 + deptBedRatioVal * 0.4;

  const rawP60 = (currentPct + netChangePct) * timeOfDayLoadFactor * deptPressure;
  const p60    = Math.min(100, Math.max(0, Math.round(rawP60)));

  const trend  = p60 > currentPct + 2
    ? 'up'
    : p60 < currentPct - 2
      ? 'down'
      : 'stable';

  return {
    p60,
    trend,
    method: '6var-linear',
    variables: {
      wardOccupancyRate:      +wardOccupancyRate.toFixed(3),
      dischargeRate:          +dischargeRate.toFixed(2),
      incomingAmbulanceCount,
      avgLengthOfStayHours,
      deptBedRatio:           deptBedRatioVal,
      timeOfDayLoadFactor:    +timeOfDayLoadFactor.toFixed(2),
    },
  };
}

module.exports = { forecastCapacity, getTimeOfDayLoadFactor, TIME_OF_DAY_LOAD };
