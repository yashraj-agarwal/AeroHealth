// src/components/AdminLogin.jsx
import React, { useState } from 'react';

export default function AdminLogin({ onSuccess, onBack }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [loading, setL] = useState(false);

  const submit = async () => {
    setL(true);
    setErr("");
    await new Promise(r => setTimeout(r, 700)); // Simulate network delay
    if (u === "admin" && p === "admin") {
      onSuccess();
    } else {
      setErr("Use admin / admin for this prototype.");
    }
    setL(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ background: "var(--card)", borderRadius: 16, padding: "44px 38px", maxWidth: 400, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,.10)" }}>
        
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 14px" }}>🔐</div>
          <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Admin Access</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>AeroHealth Command Center</p>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontWeight: 700, fontSize: 12, marginBottom: 6, color: "var(--muted)", textTransform: "uppercase" }}>Username</label>
          <input type="text" value={u} onChange={e => setU(e.target.value)} placeholder="admin" style={{ width: "100%", padding: "11px 14px", border: "1.5px solid var(--border)", borderRadius: 8 }} />
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontWeight: 700, fontSize: 12, marginBottom: 6, color: "var(--muted)", textTransform: "uppercase" }}>Password</label>
          <input type="password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="••••••" style={{ width: "100%", padding: "11px 14px", border: "1.5px solid var(--border)", borderRadius: 8 }} />
        </div>

        {err && <div style={{ color: "var(--warn)", fontSize: 12.5, marginBottom: 14, padding: "10px 12px", background: "#fff1f0", borderRadius: 8 }}>{err}</div>}
        
        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none", background: loading ? "var(--border)" : "var(--accent)", color: loading ? "var(--muted)" : "#fff", fontWeight: 700, fontSize: 15, marginBottom: 12, cursor: "pointer" }}>
          {loading ? "Authenticating..." : "Login to Dashboard"}
        </button>
        
        <button onClick={onBack} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>
          ← Back to Home
        </button>
      </div>
    </div>
  );
}