// src/components/TriageQueue.jsx
import React from 'react';

// Notice the "queue = []" below. This tells React: "If there is no data yet, just use an empty list so you don't crash!"
export default function TriageQueue({ queue = [] }) { 
  return (
    <div className="card" style={{ height: '400px', overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0, fontSize: '15px' }}>AI Triage Queue ({queue?.length || 0})</h3>
      
      {!queue || queue.length === 0 ? (
        <p style={{ color: '#64748B', fontSize: '13px' }}>Waiting for incoming telemetry...</p>
      ) : (
        queue.map((p) => (
          <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
              {p.name} <span style={{ color: '#E11D48', float: 'right' }}>ETA: {p.eta}m</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>{p.desc}</div>
            <span style={{ display: 'inline-block', marginTop: '5px', fontSize: '10px', background: '#eff6ff', color: '#1D6FE5', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
               AI Prediction: {p.dept}
            </span>
          </div>
        ))
      )}
    </div>
  );
}