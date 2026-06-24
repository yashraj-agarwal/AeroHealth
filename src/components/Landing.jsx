// src/components/Landing.jsx
import React, { useState } from 'react';

export default function Landing({ onAdminLogin }) {
  const [symptoms, setSymptoms] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAnalyse = async () => {
    if (symptoms.trim().length < 5) return alert("Please describe your symptoms.");
    setLoading(true);

    // Send the symptom data directly to our Node.js backend!
    const payload = {
      name: "Walk-in Patient",
      desc: symptoms,
      dept: symptoms.toLowerCase().includes("heart") || symptoms.toLowerCase().includes("chest") ? "Cardiology" : "General Medicine",
      severityClass: symptoms.toLowerCase().includes("severe") ? "critical" : "urgent",
      eta: 0,
      lat: 12.9700 + (Math.random() - 0.5) * 0.01,
      lng: 77.7500 + (Math.random() - 0.5) * 0.01
    };

    try {
      await fetch('http://localhost:5000/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert("Triage Complete! Patient routed to Manipal Whitefield.");
      setSymptoms("");
    } catch (err) {
      alert("Error connecting to server.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <nav style={{ height: 64, padding: "0 48px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>AH</div>
          <span style={{ fontWeight: 800, fontSize: 20 }}>Aero<span style={{ color: "var(--accent2)" }}>Health</span></span>
        </div>
        <button onClick={onAdminLogin} style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid var(--border)", background: "transparent", fontWeight: 600, cursor: "pointer" }}>
          Admin Login
        </button>
      </nav>

      <div style={{ flex: 1, padding: "100px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <h1 style={{ fontWeight: 800, fontSize: "48px", marginBottom: "20px" }}>Intelligent Healthcare Routing</h1>
        <p style={{ fontSize: "17px", color: "var(--muted)", maxWidth: "600px", marginBottom: "40px", lineHeight: 1.7 }}>
          Describe your symptoms. Our AI engine instantly determines urgency and routes you to the optimal facility.
        </p>

        <div style={{ width: "100%", maxWidth: "660px" }}>
          <textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="e.g., Severe chest pain radiating to my left arm..."
            rows={4}
            style={{ width: "100%", padding: "16px", borderRadius: "10px", border: "1.5px solid var(--border)", fontSize: "15px", marginBottom: "20px", resize: "vertical" }}
          />
          <button 
            onClick={handleAnalyse} 
            disabled={loading}
            style={{ width: "100%", padding: "16px", borderRadius: "10px", border: "none", background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: "17px", cursor: "pointer" }}
          >
            {loading ? "Analysing..." : "Analyse & Route"}
          </button>
        </div>
      </div>
    </div>
  );
}