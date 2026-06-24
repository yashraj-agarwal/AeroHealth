import React from 'react';

export default function KpiStrip({ stats }) {
  if (!stats) return null;
  const icuLoad = Math.round((stats.icuO / stats.icuT) * 100);
  const emgLoad = Math.round((stats.emgO / stats.emgT) * 100);

  return (
    <div className="kpi-grid">
      <div className="card">
        <div className="kpi-label">ICU OCCUPANCY</div>
        <div className="kpi-value">{stats.icuO} / {stats.icuT}</div>
        <div className={`kpi-status ${icuLoad > 85 ? 'text-red' : 'text-green'}`}>
          {icuLoad}% Capacity
        </div>
      </div>
      <div className="card">
        <div className="kpi-label">EMERGENCY LOAD</div>
        <div className="kpi-value">{stats.emgO} / {stats.emgT}</div>
        <div className={`kpi-status ${emgLoad > 85 ? 'text-red' : 'text-green'}`}>
          {emgLoad}% Capacity
        </div>
      </div>
      <div className="card">
        <div className="kpi-label">ACTIVE AMBULANCES</div>
        <div className="kpi-value">Live</div>
        <div className="kpi-status text-blue">Tracking enabled</div>
      </div>
    </div>
  );
}