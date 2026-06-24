// src/components/Sidebar.jsx
import React from 'react';

export default function Sidebar({ nav, setNav, onLogout }) {
  const NAVS = [
    { id: "dashboard", icon: "⊞", label: "Dashboard", sec: "Overview" },
    { id: "livemap", icon: "", label: "Live GPS", sec: null },
    { id: "triage", icon: "", label: "Triage Queue", sec: "Operations" },
    { id: "predict", icon: "", label: "Predictive Load", sec: "Intelligence" },
  ];

  return (
    <aside style={{
      width: "220px", background: "var(--sidebar)", display: "flex", flexDirection: "column",
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100, color: "white"
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 18px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ width: 34, height: 34, background: "var(--accent)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>AeroHealth</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Command Center</div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {NAVS.map(item => (
          <div key={item.id}>
            {item.sec && <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,.3)", padding: "12px 8px 5px" }}>{item.sec}</div>}
            <button 
              onClick={() => setNav(item.id)} 
              style={{
                display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "9px 12px", 
                borderRadius: "8px", border: "none", background: nav === item.id ? "var(--accent)" : "transparent", 
                color: nav === item.id ? "#fff" : "rgba(255,255,255,.6)", fontSize: "13px", fontWeight: 600, 
                cursor: "pointer", textAlign: "left"
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
            </button>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--accent2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>P</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Dr. Priya R.</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Manipal Whitefield</div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer" }}>↩</button>
      </div>
    </aside>
  );
}