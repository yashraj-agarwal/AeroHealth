import React, { useState, useEffect } from 'react';
export default function ManualControls({ stats, onUpdate }) {
  const [beds, setBeds] = useState(0);
  useEffect(() => {
    if (stats) setBeds(stats.icuO);
  }, [stats]);
  if (!stats) return null;
  const handleChange = (e) => {
    const val = parseInt(e.target.value);
    setBeds(val);
    onUpdate({ icuO: val });
  };
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, fontSize: '15px' }}>Manual Bed Override (Offline Calls)</h3>
      <input 
        type="range" min="0" max={stats.icuT} value={beds} 
        onChange={handleChange}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', marginTop: '8px' }}>
        <span>0</span>
        <span style={{ color: '#1D6FE5' }}>{beds} Beds Occupied</span>
        <span>{stats.icuT}</span>
      </div>
    </div>
  );
}