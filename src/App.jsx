// AeroHealth patient triage and operations workspace.
import { useState, useRef, useEffect, useEffectEvent, lazy, Suspense } from "react";

import { io } from 'socket.io-client';
import hospitalsData from '../backend/data/hospitals.json';

import { AppShell } from "./components/app-shell";
const backendOrigin = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/+$/, "") || "";
const apiUrl = (path) => `${backendOrigin}/api${path}`;

const Dashboard = lazy(() => import("./components/dashboard").then(module => ({ default: module.Dashboard })));
const LeafletMap = lazy(() => import("./components/LeafletMap"));

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  WEIGHTS: { urgencyMatch:0.25, deptAvailability:0.20, occupancyInverse:0.20, predictedLoadInverse:0.15, travelTime:0.15, icuAvailability:0.05 },
  PEAK_HOURS: [8,9,10,17,18,19,20],
  MAX_TRAVEL_MIN: 60,
  URGENCY: {
    1:{label:"Non-Urgent",color:"#059669",bg:"#ecfdf5"},
    2:{label:"Low",color:"#65a30d",bg:"#f7fee7"},
    3:{label:"Moderate",color:"#d97706",bg:"#fffbeb"},
    4:{label:"High",color:"#e85d4a",bg:"#fff1f0"},
    5:{label:"Critical",color:"#fca5a5",bg:"#fff1f0"},
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TRIAGE, ROUTING AND CAPACITY
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// SERVICES  (Azure integration points — swap function bodies only)
// ─────────────────────────────────────────────────────────────────────────────
// ─── 11 DEPARTMENTS (matches triageService.js DEPARTMENTS constant) ───────────
// Emergency, Cardiology, Neurology, Pulmonology, Orthopedics,
// Pediatrics, Obstetrics, Gastroenterology, Psychiatry, ENT, General Medicine
const TriageService = {
  MAP:[
    // Emergency — highest boost, catch-all for severe trauma
    {kw:["unconscious","unresponsive","collapsed","not breathing","no pulse","cardiac arrest","severe bleeding","hemorrhage","major trauma","accident","hit by","crash","run over"],dept:"Emergency",boost:3},
    // Cardiology
    {kw:["chest pain","cardiac","palpitation","angina","heart attack","myocardial","arrhythmia","heart failure","atrial fibrillation","coronary","tachycardia"],dept:"Cardiology",boost:2},
    // Neurology
    {kw:["stroke","facial droop","slurred speech","seizure","convulsion","brain","head injury","migraine","neuropathy","dementia","sudden headache","vision loss","paralysis"],dept:"Neurology",boost:2},
    // Pulmonology
    {kw:["breathing","shortness of breath","dyspnea","asthma","pneumonia","tuberculosis","copd","emphysema","lung","pulmonary","respiratory","wheezing","bronchitis"],dept:"Pulmonology",boost:1},
    // Orthopedics
    {kw:["fracture","bone","joint","sprain","orthopedic","knee","hip","shoulder","ligament","tendon","dislocation","arthritis","spine","back pain","herniated disc"],dept:"Orthopedics",boost:0},
    // Pediatrics
    {kw:["child","infant","pediatric","baby","newborn","toddler","neonatal","childhood","kid","juvenile","adolescent"],dept:"Pediatrics",boost:1},
    // Obstetrics (renamed from Gynecology to match 11-dept list)
    {kw:["pregnancy","labor","labour","obstetric","delivery","contractions","miscarriage","prenatal","postnatal","eclampsia","caesarean","uterus","cervix","ovarian","gynecology"],dept:"Obstetrics",boost:1},
    // Gastroenterology
    {kw:["stomach","abdomen","abdominal pain","vomiting blood","diarrhea","constipation","bowel","intestine","colon","liver","hepatitis","jaundice","gallbladder","ulcer","gastritis","pancreatitis","rectal bleeding"],dept:"Gastroenterology",boost:1},
    // Psychiatry
    {kw:["anxiety","depression","suicidal","mental health","panic attack","psychosis","schizophrenia","bipolar","hallucination","self harm","overdose","substance abuse"],dept:"Psychiatry",boost:1},
    // ENT (Ear, Nose, Throat)
    {kw:["ear","hearing loss","tinnitus","throat","tonsil","sinus","nose","nosebleed","nasal","larynx","vocal cord","swallowing","vertigo","dizziness","ent","otitis","pharyngitis"],dept:"ENT",boost:0},
    // General Medicine — catch-all, lowest boost
    {kw:["fever","infection","flu","viral","cough","cold","fatigue","weakness","rash","skin","allergy","diabetes","hypertension","thyroid"],dept:"General Medicine",boost:0},
  ],
  CRITICAL:["unconscious","unresponsive","not breathing","cardiac arrest","stroke","severe bleeding","collapsed"],
  HIGH:["chest pain","difficulty breathing","head injury","high fever","seizure","fracture","trauma"],
  MODERATE:["moderate pain","vomiting","dizziness","infection","fever","injury"],
  classify(text){
  const t = text.toLowerCase();

  // --- TRAUMA / ACCIDENT HIGH RISK DETECTION ---
  const traumaSignals = [
    "accident","hit by","hit","crash","collision","run over",
    "fell under","truck","bus","bike accident","road accident",
    "bleeding heavily","severe bleeding","unconscious",
    "not responding","collapsed","head smashed","major injury"
  ];

  const unconsciousSignals = [
    "unconscious","not breathing","no pulse",
    "collapsed","not responding","cardiac arrest"
  ];

  const severePainSignals = [
    "severe","excruciating","worst pain","cannot move",
    "intense","extreme"
  ];

  const moderateSignals = [
    "pain","injury","vomiting","dizziness","fever","infection"
  ];

  // --- DEPARTMENT DETECTION (MULTI SCORE) ---
  let deptScores = {};

  for(const e of this.MAP){
    for(const k of e.kw){
      if(t.includes(k)){
        deptScores[e.dept] = (deptScores[e.dept] || 0) + 2 + e.boost;
      }
    }
  }

  // Trauma automatically maps to Emergency
  if(traumaSignals.some(k => t.includes(k))){
    deptScores["Emergency"] = (deptScores["Emergency"] || 0) + 5;
  }

  // Choose highest scoring department
  let dept = "General Medicine";
  let maxScore = 0;

  for(const d in deptScores){
    if(deptScores[d] > maxScore){
      maxScore = deptScores[d];
      dept = d;
    }
  }

  // --- URGENCY SCORING ---
  let urgencyScore = 0;

  if(unconsciousSignals.some(k => t.includes(k))){
    urgencyScore += 5;
  }

  if(traumaSignals.some(k => t.includes(k))){
    urgencyScore += 4;
  }

  if(severePainSignals.some(k => t.includes(k))){
    urgencyScore += 2;
  }

  if(moderateSignals.some(k => t.includes(k))){
    urgencyScore += 1;
  }

  if(t.length > 60){
    urgencyScore += 1; // detailed description often more serious
  }

  // Normalize to 1–5 scale
  let urgency;
  if(urgencyScore >= 6) urgency = 5;
  else if(urgencyScore >= 4) urgency = 4;
  else if(urgencyScore >= 2) urgency = 3;
  else if(urgencyScore >= 1) urgency = 2;
  else urgency = 1;

  const priority = Math.min(100, Math.round((urgency * 20) + maxScore * 2));
  if(traumaSignals.some(k => t.includes(k)) && unconsciousSignals.some(k => t.includes(k))){
  urgency = 5;
}
  return {
    urgency,
    dept,
    priority
  };
}
};

const SpatialService = {
  haversine(la1,ln1,la2,ln2){
    const R=6371,dLa=(la2-la1)*Math.PI/180,dLn=(ln2-ln1)*Math.PI/180;
    const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLn/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  },
  route(from,to){
    const dist=this.haversine(from.lat,from.lng,to.lat,to.lng);
    const peak=CFG.PEAK_HOURS.includes(new Date().getHours());
    const tm = peak ? 1.8 : 1.2;
    return {distKm:+dist.toFixed(1),mins:Math.round((dist/25)*60*tm)};
  },
};

/**
 * PredictiveService — 6-Variable Capacity Forecasting Model
 * ──────────────────────────────────────────────────────────
 * Mirrors the logic in backend/services/capacityService.js so the frontend
 * can produce forecasts without a backend call. Variables:
 *   V1 wardOccupancyRate      — occ / beds
 *   V2 dischargeRate          — occ / avgLosHours (patients/hour freed)
 *   V3 incomingAmbulanceCount — approximated from live queue position
 *   V4 avgLengthOfStayHours   — per-hospital config (added to mkHospitals)
 *   V5 deptBedRatio           — per-hospital config (added to mkHospitals)
 *   V6 timeOfDayLoadFactor    — 24-point load curve by hour
 */
const TIME_OF_DAY_LOAD = [
  0.82,0.78,0.75,0.73,0.74,0.79,0.88,0.97, // 00–07
  1.28,1.45,1.40,1.25,1.18,1.10,1.05,1.08, // 08–15
  1.15,1.38,1.50,1.42,1.30,1.15,1.00,0.90, // 16–23
];

const PredictiveService = {
  predict(h, inboundCount = 0) {
    // V1 — Ward Occupancy Rate
    const wardOccupancyRate = h.occ / (h.beds || 1);
    const curr = Math.round(wardOccupancyRate * 100);

    // V2 — Discharge Rate (patients freed per hour)
    const avgLosHours  = h.avgLosHours  || 24;
    const dischargeRate = h.occ / avgLosHours;

    // V3 — Incoming Ambulance Count (live inbound, default 0 when offline)
    const incomingAmbulanceCount = inboundCount;

    // V4 — Average Length of Stay (hours) — from hospital config

    // V5 — Dept Bed Ratio — from hospital config
    const deptBedRatio = Math.min(1, Math.max(0, h.deptBedRatio || 0.40));

    // V6 — Time-of-Day Load Factor
    const timeOfDayLoadFactor = TIME_OF_DAY_LOAD[new Date().getHours()];

    // Formula (matches capacityService.js exactly)
    const netPatients  = incomingAmbulanceCount - dischargeRate;
    const netChangePct = (netPatients / (h.beds || 1)) * 100;
    const deptPressure = 0.8 + deptBedRatio * 0.4;
    const rawP60 = (curr + netChangePct) * timeOfDayLoadFactor * deptPressure;
    const p60 = Math.min(100, Math.max(0, Math.round(rawP60)));
    const trend = p60 > curr + 2 ? "up" : p60 < curr - 2 ? "down" : "stable";

    return { curr, p60, trend };
  },
};

const ScoreEngine = {
  score(h,triage,rt,pred){
    const W=CFG.WEIGHTS;
    const hasDept=h.depts.some(d=>d.toLowerCase().includes(triage.dept.toLowerCase())||triage.dept.toLowerCase().includes(d.toLowerCase()));
    const emgA=1-(h.emgO/h.emgT);
    const raw=W.urgencyMatch*(hasDept?1:0.3)+W.deptAvailability*emgA+W.occupancyInverse*(1-h.occ/h.beds)+W.predictedLoadInverse*(1-pred.p60/100)+W.travelTime*Math.max(0,1-rt.mins/CFG.MAX_TRAVEL_MIN)+W.icuAvailability*(h.icuT>0?1-h.icuO/h.icuT:0);
    return {score:Math.round(raw*100),timeToCare:rt.mins+Math.round((1-emgA)*15),hasDept};
  },
  rank(hospitals,triage,coords){
    return hospitals.map(h=>{
      const rt=SpatialService.route(coords,h.coords);
      const pred=PredictiveService.predict(h);
      const sc=this.score(h,triage,rt,pred);
      return {h,rt,pred,...sc};
    }).sort((a,b)=>b.score-a.score);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// TINY SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const Spinner = ({size=20,color="var(--accent)"}) => (
  <div style={{width:size,height:size,border:`2px solid ${color}25`,borderTopColor:color,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
);

const Toast = ({items}) => (
  <div style={{position:"fixed",top:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
    {items.map(t=><div key={t.id} style={{background:t.type==="error"?"var(--warn)":t.type==="warn"?"var(--amber)":"var(--sidebar)",color:"#fff",padding:"11px 18px",borderRadius:10,boxShadow:"none",animation:"toast .3s ease",fontSize:13,fontWeight:600,maxWidth:320}}>{t.msg}</div>)}
  </div>
);

const Bar = ({v,max=100,h=6}) => {
  const p=Math.min(100,(v/max)*100);
  return <div style={{background:"var(--border)",borderRadius:99,height:h,overflow:"hidden"}}><div style={{width:`${p}%`,height:"100%",background:p>85?"var(--warn)":p>65?"var(--amber)":"var(--accent2)",borderRadius:99,transition:"width .6s"}}/></div>;
};

const StatusBadge = ({status}) => {
  const M={
    accepting:{c:"#10b981",l:"Accepting"},
    moderate:{c:"#f59e0b",l:"Moderate"},
    saturated:{c:"#ef4444",l:"Saturated"}
  };
  const s=M[status] || {c:"#a1a1aa",l:"Unknown"};
  return (
    <div className="inline-flex items-center gap-1.5 bg-zinc-800/40 border border-zinc-700/50 px-2.5 py-1 rounded-full">
      <div style={{width:6,height:6,borderRadius:"50%",background:s.c}}/>
      <span style={{color:s.c,fontSize:11,fontWeight:600}}>{s.l}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LANDING
// ─────────────────────────────────────────────────────────────────────────────
const PublicHeader = ({onHome, children}) => (
  <header className="public-header">
    <div className="public-wrap public-nav">
      <button className="brand" type="button" onClick={onHome} aria-label="AeroHealth home">
        <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12h5l3-7 4 14 3-7h5"/></svg></span>
        AeroHealth
      </button>
      <nav aria-label="Main navigation">{children}</nav>
    </div>
  </header>
);

const EmergencyNote = () => <p className="safety-note"><strong>Simulation only.</strong> In a real emergency, call <a href="tel:112">112</a>.</p>;

const Landing = ({ onAnalyse, onAdmin }) => {
  const [symptoms, setSymptoms] = useState("");
  return (
    <div className="public-page" id="top">
      <PublicHeader onHome={() => window.scrollTo(0, 0)}>
        <a className="nav-link" href="#how-it-works">How it works</a>
        <button className="button-secondary" onClick={onAdmin}>Admin Login</button>
      </PublicHeader>
      <main>
        <section className="public-wrap landing-hero">
          <div>
            <p className="eyebrow">Bengaluru care navigation</p>
            <h1>Find a hospital<br/>that fits your needs.</h1>
            <p className="hero-description">Explore nearby hospitals by specialty, reported bed occupancy, and estimated travel time.</p>
            <form className="symptom-form" onSubmit={event => { event.preventDefault(); onAnalyse(symptoms); }}>
              <label htmlFor="landing-symptoms">Describe your symptoms <span>Optional</span></label>
              <textarea id="landing-symptoms" value={symptoms} onChange={event => setSymptoms(event.target.value)} rows={3} placeholder="For example, fever and a persistent cough since yesterday"/>
              <button className="button-primary" type="submit">Start hospital search <span aria-hidden="true">→</span></button>
            </form>
            <EmergencyNote/>
          </div>
          <figure className="network-figure">
            <div className="network-heading"><span className="eyebrow">Facility directory</span><span>Bengaluru, IN</span></div>
            <svg viewBox="0 0 400 300" role="img" aria-label="Relative locations of hospitals in the Bengaluru directory">
              <defs><pattern id="facility-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#29292d" strokeWidth="1"/></pattern></defs>
              <rect width="400" height="300" fill="url(#facility-grid)"/>
              <ellipse cx="195" cy="145" rx="95" ry="81" fill="none" stroke="#45472d" strokeDasharray="4 6"/>
              <ellipse cx="195" cy="145" rx="149" ry="123" fill="none" stroke="#36372b"/>
              {hospitalsData.map(hospital => <circle key={hospital.id} cx={32 + (hospital.coords.lng - 77.45) * 980} cy={275 - (hospital.coords.lat - 12.79) * 810} r="4" fill="var(--bento-accent)" stroke="#252719" strokeWidth="2"/>)}
              <text x="195" y="175" textAnchor="middle" fill="#b5b5bd" fontSize="11" letterSpacing="2">BENGALURU</text>
            </svg>
            <figcaption><span><i aria-hidden="true"/> Directory location</span><strong>{hospitalsData.length} listed facilities</strong></figcaption>
          </figure>
        </section>
        <section id="how-it-works" className="public-wrap workflow">
          <div><p className="eyebrow">Patient workflow</p><h2>How hospital search works</h2></div>
          <ol>{[
            ["Describe symptoms", "Enter what you’re experiencing and how long it’s been happening."],
            ["Review the assessment", "See the estimated urgency and the specialty suggested by the triage model."],
            ["Compare facilities", "Review occupancy, travel estimates, and the route for each ranked hospital."],
          ].map(([title, description], index) => <li key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        </section>
      </main>
      <footer className="public-wrap public-footer"><strong>AeroHealth</strong><span>Bengaluru hospital routing simulator</span><a href="#top">Back to top ↑</a></footer>
    </div>
  );
};

const AdminLogin = ({onSuccess,onBack}) => {
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("username") === "admin" && form.get("password") === "admin") onSuccess();
    else setError("Use the demo username and password shown below.");
  }

  return (
    <div className="public-page">
      <PublicHeader onHome={onBack}><button className="button-secondary" onClick={onBack}>← Home</button></PublicHeader>
      <main className="public-wrap patient-layout">
        <div><p className="eyebrow">Operations workspace</p><h1>Command Center</h1><p className="hero-description">Review facility capacity, triage activity, and service health.</p></div>
        <form className="bento-panel symptom-form" onSubmit={submit}>
          <h2 className="font-semibold">Admin access</h2>
          <p className="route-area">Demo access. Enter <strong>admin</strong> in both fields.</p>
          <label htmlFor="admin-user">Username</label>
          <input id="admin-user" name="username" autoComplete="username" required/>
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" name="password" type="password" autoComplete="current-password" required/>
          {error && <p role="alert" className="safety-note">{error}</p>}
          <button className="button-primary">Login to Dashboard</button>
        </form>
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT FLOW
// ─────────────────────────────────────────────────────────────────────────────
const PatientFlow = ({ initialSymptoms, onBack }) => {
  const [step,setStep]=useState("input");
  useEffect(() => { if (step !== "analyzing") window.scrollTo(0, 0); }, [step]);
  const [sx,setSx]=useState(initialSymptoms || "");
  const [coords,setCoords]=useState({lat:12.9716,lng:77.5946});
  const [locName,setLoc]=useState("Central Bengaluru (default)");
  const [triage,setTriage]=useState(null);
  const [snapshot,setSnapshot]=useState(false);
  const [ranked,setRanked]=useState([]);
  const [toasts,setToasts]=useState([]);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const [selId,setSelId]=useState(null);

  const toast=(msg,type="info")=>{clearTimeout(toastTimer.current);setToasts([{id:Date.now(),msg,type}]);toastTimer.current=setTimeout(()=>setToasts([]),4500);};

  const [locating, setLocating] = useState(false);
  const gps = () => {
    if (!navigator.geolocation) { toast("Location is unavailable. Using the current search location.", "warn"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({coords}) => {
      setCoords({lat:coords.latitude, lng:coords.longitude});
      setLoc(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      setLocating(false);
    }, () => {
      setLocating(false);
      toast("Could not get GPS. The search location is unchanged.", "warn");
    }, {timeout: 8000});
  };

  const analyse=async()=>{
    if(sx.trim().length<10){toast("Please describe symptoms in more detail.","error");return;}
    setStep("analyzing");

    const facilitiesRequest = fetch(apiUrl("/hospitals"), { signal: AbortSignal.timeout(4000) })
      .then(async response => {
        if (!response.ok) throw new Error("Hospital data unavailable");
        const facilities = await response.json();
        return { facilities, snapshot: false };
      })
      .catch(() => ({ facilities: hospitalsData, snapshot: true }));
    let tr = null;
    // --- Attempt Azure AI backend classification first ---
    // Falls back to local classifier automatically if backend is unavailable.
    try {
      const resp = await fetch(apiUrl("/classify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sx }),
        signal: AbortSignal.timeout(4000), // 4s timeout — don't block the UX
      });
      if (resp.ok) {
        const azureResult = await resp.json();
        // Map Azure result shape to the local triage object shape
        tr = {
          dept:     azureResult.dept,
          urgency:  azureResult.urgency,
          priority: Math.min(100, Math.round((azureResult.urgency * 20) + 10)),
          source:   azureResult.source,
          confidence: azureResult.confidence,
        };
      }
    } catch {
      // Network error or timeout — silent fallback
    }

    // --- Local keyword classifier fallback ---
    if (!tr) {
      const local = TriageService.classify(sx);
      tr = { ...local, source: "fallback", confidence: null };
    }

    const { facilities, snapshot } = await facilitiesRequest;
    if (!facilities.length) {
      setStep("input");
      toast("No hospitals are available in the directory.", "error");
      return;
    }
    setSnapshot(snapshot);
    const rk=ScoreEngine.rank(facilities,tr,coords);
    setTriage(tr);
    setRanked(rk);
    setSelId(rk[0]?.h.id||null);
    setStep("results");
  };

  const analyseInitialSymptoms = useEffectEvent(() => { void analyse(); });
  useEffect(() => {
    if (initialSymptoms.trim().length < 10) return;
    const timer = setTimeout(() => analyseInitialSymptoms(), 0);
    return () => clearTimeout(timer);
  }, [initialSymptoms]);

  const SAMPLES=["Severe chest pain radiating to my left arm with shortness of breath and sweating","Sudden severe headache, confused speech and facial drooping on one side","High fever, difficulty breathing and persistent cough for 3 days","Mild fever and body ache since yesterday, feeling very fatigued"];

  if (step !== "results") return (
    <div className="public-page">
      <PublicHeader onHome={onBack}><button className="button-secondary" onClick={onBack}>← Home</button></PublicHeader>
      <main className="public-wrap patient-layout">
        <aside>
          <p className="eyebrow">01 / Patient assessment</p>
          <h1>Tell us how you feel.</h1>
          <p className="hero-description">Describe your symptoms to compare hospitals in the Bengaluru directory.</p>
          <EmergencyNote/>
        </aside>
        <form className="bento-panel symptom-form" onSubmit={event => { event.preventDefault(); void analyse(); }} aria-busy={step === "analyzing"}>
          <Toast items={toasts}/>
          <label htmlFor="patient-symptoms">Describe your symptoms</label>
          <textarea id="patient-symptoms" value={sx} onChange={event => setSx(event.target.value)} rows={5} placeholder="Include what you feel and when it began." disabled={step === "analyzing"}/>
          <p className="field-caption">Try an example</p>
          <div className="sample-list">{SAMPLES.map((sample, index) => <button type="button" key={sample} aria-pressed={sx === sample} disabled={step === "analyzing"} onClick={() => setSx(sample)}>{["Chest discomfort", "Sudden headache", "Fever and cough", "Mild fever"][index]}</button>)}</div>
          <div className="location-row">
            <div><span className="field-caption">Search location</span><strong>{locName}</strong></div>
            <button type="button" className="button-secondary" disabled={step === "analyzing" || locating} onClick={gps}>{locating ? "Locating…" : "Use GPS"}</button>
          </div>
          <button className="button-primary" disabled={step === "analyzing" || locating}>{step === "analyzing" ? <><Spinner size={16} color="currentColor"/> Analysing symptoms…</> : <>Analyse &amp; find hospitals <span aria-hidden="true">→</span></>}</button>
        </form>
      </main>
    </div>
  );

  const selected = ranked.find(result => result.h.id === selId) ?? ranked[0];
  const urgency = CFG.URGENCY[triage.urgency] ?? CFG.URGENCY[1];
  return (
    <div className="public-page">
      <PublicHeader onHome={onBack}><button className="button-secondary" onClick={() => setStep("input")}>← Edit symptoms</button></PublicHeader>
      <main className="public-wrap results-layout">
        <div className="results-heading"><p className="eyebrow">02 / Hospital comparison</p><h1>Compare your options.</h1><EmergencyNote/></div>
        {snapshot && <p role="status" className="safety-note">Hospital service unavailable. Results use the bundled directory snapshot.</p>}
        <dl className="assessment-strip">
          <div><dt>Estimated urgency</dt><dd style={{color:urgency.color}}>{urgency.label}</dd></div>
          <div><dt>Suggested specialty</dt><dd>{triage.dept}</dd></div>
          <div><dt>Triage priority</dt><dd>{triage.priority}/100</dd></div>
          <div><dt>Assessment source</dt><dd>{triage.source === "azure" ? "Azure AI Language" : "Rule-based classifier"}</dd></div>
        </dl>
        <div className="comparison-layout">
          <section className="bento-panel route-panel" aria-labelledby="selected-facility">
            <p className="eyebrow">{selected.h.id === ranked[0].h.id ? "Top model match" : "Selected facility"}</p>
            <h2 id="selected-facility">{selected.h.name}</h2>
            <p className="route-area">{selected.h.area}</p>
            <dl className="route-metrics">
              <div><dt>Travel estimate</dt><dd>{selected.rt.mins} min</dd></div>
              <div><dt>Estimated time to care</dt><dd>{selected.timeToCare} min</dd></div>
              <div><dt>Ward occupancy</dt><dd>{Math.round(selected.h.occ / selected.h.beds * 100)}%</dd></div>
              <div><dt>60 min forecast</dt><dd>{selected.pred.p60}%</dd></div>
            </dl>
            <Suspense fallback={<p className="map-placeholder" role="status">Loading route map…</p>}><LeafletMap hospitals={ranked.map(result => result.h)} userCoords={coords} selectedHospitalId={selId}/></Suspense>
            <a className="button-secondary route-directions" href={`https://www.google.com/maps/dir/?api=1&destination=${selected.h.coords.lat},${selected.h.coords.lng}`} target="_blank" rel="noreferrer">Get directions ↗</a>
          </section>
          <section className="bento-panel facility-panel" aria-labelledby="ranked-facilities">
            <h2 id="ranked-facilities">All hospitals ranked</h2>
            <p className="route-area">Select a facility to update the route.</p>
            <ol className="facility-list">{ranked.map(({h, rt, score, timeToCare}, index) => (
              <li key={h.id}>
                <button className="rank-select facility-choice" aria-pressed={h.id === selId} onClick={() => setSelId(h.id)}>
                  <span className="facility-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{h.name}</strong><small>{h.area} · {h.status}</small><small>{rt.mins} min travel · {timeToCare} min to care · {Math.round(h.occ / h.beds * 100)}% occupied</small></span>
                  <span className="facility-score">{score}<small>Match</small></span>
                </button>
              </li>
            ))}</ol>
          </section>
        </div>
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const Admin = ({onLogout}) => {
  const [hosps, setHosps] = useState(hospitalsData);
  const [nav, setNav] = useState("dashboard");
  const [feed, setFeed] = useState([]);
  const [now, setNow] = useState(null);
  const [connected, setConnected] = useState(false);
  const [occupancyHistory, setOccupancyHistory] = useState([]);
  const [queueReceived, setQueueReceived] = useState(false);

  useEffect(() => {
    const socket = io(backendOrigin || undefined);
    socket.on("disconnect", () => setConnected(false));
    socket.on("hospitals_update", hospitals => {
      setHosps(hospitals);
      const at = new Date();
      setNow(at);
      const beds = hospitals.reduce((sum, hospital) => sum + hospital.beds, 0);
      if (beds > 0) {
        const occupied = hospitals.reduce((sum, hospital) => sum + hospital.occ, 0);
        setOccupancyHistory(history => [...history.slice(-29), { at: at.getTime(), percent: occupied / beds * 100 }]);
      }
      setConnected(true);
    });
    socket.on("queue_update", queue => {
      setQueueReceived(true);
      setFeed(queue.map(patient => ({
        ...patient,
        desc: patient.desc || patient.dept,
        dest: patient.destName || "Awaiting dispatch",
        eta: Number.isFinite(patient.eta) ? patient.eta : null,
        sev: patient.urgency >= 5 ? "critical" : patient.urgency >= 3 ? "urgent" : "stable",
      })));
    });
    return () => socket.disconnect();
  }, []);

  const NAVS=[
    {id:"dashboard",icon:"",label:"Dashboard",sec:"Overview"},
    {id:"livemap",icon:"",label:"Live Map",sec:null},
    {id:"hospitals",icon:"",label:"Hospitals",sec:"Operations"},
    {id:"triage",icon:"",label:"Triage Queue",sec:null},
    {id:"analytics",icon:"📊",label:"Analytics",sec:null},
    {id:"predict",icon:"",label:"Predictive Load",sec:"Intelligence"},
    {id:"syshealth",icon:"",label:"System Health",sec:null},
    {id:"telemetry",icon:"",label:"Telemetry",sec:null},
  ];

  // Health data — populated from Socket.IO 'health_update' and /api/health polling.
  // Falls back to defaults gracefully when backend is not running.
  const [healthData, setHealthData] = useState({
    azure:  { status: 'unknown', callCount: 0, errorCount: 0, avgLatencyMs: 0, lastError: null, azureKeyConfigured: false },
    osrm:   { status: 'not_used' },
    server: { patientsTotal: 0, errorsTotal: 0, startedAt: null },
  });

  // Poll /api/health once on mount and on each tick to keep panel fresh.
  // In a full deployment this would be the Socket.IO health_update event;
  // here we do both so it works whether or not the backend is running.
  useEffect(() => {
    async function fetchHealth() {
      try {
        const r = await fetch(apiUrl('/health'), { signal: AbortSignal.timeout(3000) });
        if (r.ok) setHealthData(await r.json());
      } catch { /* backend not running — keep defaults */ }
    }
    fetchHealth();
    const iv = setInterval(fetchHealth, 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, []);

  const renderPage = () => {
    switch(nav){
      case "dashboard":return <Dashboard hosps={hosps} feed={feed} occupancyHistory={occupancyHistory} queueReceived={queueReceived} connected={connected}/>;
      case "livemap":  return <div style={{animation:"fadeUp .4s ease"}}><h2 style={{fontWeight:800,fontSize:22,marginBottom:20}}>Live Spatial Map</h2><div className="bg-[#09090b] border border-zinc-800/50 rounded-xl p-6"><LeafletMap hospitals={hosps}/><div style={{marginTop:20,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>{hosps.map(h=>{const oc=Math.round((h.occ/h.beds)*100);return(<div key={h.id} style={{background:"#09090b",borderRadius:8,padding:"12px 14px"}}><div style={{fontWeight:700,fontSize:13,marginBottom:3}}>{h.name}</div><div style={{fontSize:11,color:"#a1a1aa",marginBottom:8}}>{h.area}</div><Bar v={oc}/><div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,fontWeight:700}}><span style={{color:"#a1a1aa"}}>Occupancy</span><span style={{color:oc>85?"var(--warn)":oc>65?"var(--amber)":"var(--accent2)"}}>{oc}%</span></div></div>);})}</div></div></div>;
      case "hospitals":return <HospPage hosps={hosps}/>;
      case "triage":   return <TriagePage feed={feed}/>;
      case "analytics":return <AnalyticsPage hosps={hosps} feed={feed} healthData={healthData}/>;
      case "predict":  return <PredPage hosps={hosps} feed={feed}/>;
      case "syshealth":return <SysHealthPage healthData={healthData}/>;
      case "telemetry":return <TelPage hosps={hosps} now={now}/>;
      default:return null;
    }
  };

  return(
    <AppShell 
      nav={nav} 
      setNav={setNav} 
      onLogout={onLogout}
      pageTitle={NAVS.find(n => n.id === nav)?.label || "Dashboard"}
    >
      <p role="status" className="mb-4 text-xs text-zinc-400">
        {connected ? "Connected to operations server" : "Disconnected · showing last available hospital data"}
      </p>
      <div key={nav} className="page-content"><Suspense fallback={<p role="status">Loading dashboard…</p>}>{renderPage()}</Suspense></div>
    </AppShell>
  );
};

// ─── DASHBOARD MAIN ───────────────────────────────────────────────────────────
const HospPage = ({hosps}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontWeight:800,fontSize:22,marginBottom:20}}>Hospital Details</h2>
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {hosps.map((h,i)=>{
        const oc=Math.round((h.occ/h.beds)*100);const pred=PredictiveService.predict(h);
        return(
          <div key={h.id} style={{background:"#09090b",border:"1px solid rgba(39, 39, 42, 0.5)",borderRadius:12,padding:22,animation:`fadeUp .4s ease ${i*.07}s both`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div><div style={{fontWeight:800,fontSize:17}}>{h.name}</div><div style={{color:"#a1a1aa",fontSize:13,marginTop:2}}> {h.area}</div></div>
              <StatusBadge status={h.status}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:14}}>
              {[{l:"Occupancy",v:`${oc}%`,bar:oc},{l:"ICU",v:`${h.icuO}/${h.icuT}`,bar:Math.round((h.icuO/h.icuT)*100)},{l:"Emergency",v:`${h.emgO}/${h.emgT}`,bar:Math.round((h.emgO/h.emgT)*100)},{l:"Pred. 60m",v:`${pred.p60}% ${pred.trend==="up"?"":""}`,bar:pred.p60}].map((s,j)=>(
                <div key={j} style={{background:"#09090b",borderRadius:8,padding:"11px 13px"}}>
                  <div style={{fontSize:10.5,color:"#a1a1aa",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{s.l}</div>
                  <div style={{fontWeight:800,fontSize:20,marginBottom:6}}>{s.v}</div>
                  <Bar v={s.bar}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{h.depts.map((d,j)=><span key={j} style={{background:"#09090b",color:"#a1a1aa",fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:20}}>{d}</span>)}</div>
          </div>
        );
      })}
    </div>
  </div>
);

const TriagePage = ({feed}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{fontWeight:800,fontSize:22}}>Live Triage Queue</h2>
      <span style={{background:"rgba(239, 68, 68, 0.1)",color:"#ef4444",fontSize:11,fontWeight:700,padding:"5px 12px",borderRadius:20}}>{feed.filter(c=>c.sev==="critical").length} Critical</span>
    </div>
    <div className="bg-[#09090b] border border-zinc-800/50 rounded-xl p-5">
      {feed.length === 0 && <p className="text-sm text-zinc-400">No active cases received.</p>}
      {feed.map((c,i)=>(
        <div key={c.id} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"12px 0",borderBottom:i<feed.length-1?"1px solid var(--border)":"none",animation:"slideIn .3s ease"}}>
          <div style={{width:10,height:10,borderRadius:"50%",marginTop:3,flexShrink:0,background:c.sev==="critical"?"var(--warn)":c.sev==="urgent"?"var(--amber)":"var(--accent2)"}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13}}>Case #{c.id} · {c.name}</div>
            <div style={{fontSize:12,color:"#a1a1aa",marginTop:2}}>{c.desc}</div>
            <div style={{fontSize:12,color:"#3b82f6",fontWeight:700,marginTop:4}}>→ {c.dest}{c.eta == null ? "" : ` · ETA ${c.eta} min`}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <span style={{background:c.sev==="critical"?"#fff1f0":c.sev==="urgent"?"#fffbeb":"#ecfdf5",color:c.sev==="critical"?"var(--warn)":c.sev==="urgent"?"var(--amber)":"var(--accent2)",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,textTransform:"capitalize"}}>{c.sev}</span>
            <span style={{fontSize:11,color:"#a1a1aa"}}>{c.time}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── ANALYTICS PAGE ───────────────────────────────────────────────────────────
// Aggregates operational stats for a decision-maker view: hospitals at capacity,
// urgency breakdown, avg response time, AI triage source split.
const StatCard = ({label, value, sub, color='#f4f4f5', bg='#09090b', icon}) => (
    <div style={{background:bg,border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'18px 20px'}}>
      <div style={{fontSize:11,color:'#a1a1aa',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4}}>
        {icon&&<span style={{fontSize:20}}>{icon}</span>}
        <span style={{fontWeight:800,fontSize:28,color}}>{value}</span>
      </div>
      {sub&&<div style={{fontSize:11.5,color:'#a1a1aa'}}>{sub}</div>}
    </div>
  );

const CapacityEditor = ({ hospital, onClose, onSaved }) => {
  const dialog = useRef(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const occ = Number(new FormData(event.currentTarget).get("occupancy"));
    try {
      const response = await fetch(apiUrl(`/hospitals/${hospital.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occ }),
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save capacity.");
      onSaved(data.hospital);
      dialog.current?.close();
    } catch {
      setError("Unable to confirm the update. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} onClose={onClose} onCancel={event => { if (saving) event.preventDefault(); }}
      aria-labelledby="capacity-title" className="capacity-dialog">
      <form onSubmit={save} className="space-y-4">
        <div>
          <h3 id="capacity-title" className="text-lg font-semibold">Edit ward occupancy</h3>
          <p className="text-sm text-zinc-400">{hospital.name}</p>
        </div>
        <label className="block text-sm">
          Occupied beds out of {hospital.beds}
          <input name="occupancy" type="number" min="0" max={hospital.beds} step="1" required
            defaultValue={hospital.occupiedBeds} className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2"/>
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => dialog.current.close()} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cancel</button>
          <button disabled={saving} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white">{saving ? "Saving…" : "Save capacity"}</button>
        </div>
      </form>
    </dialog>
  );
};

const AnalyticsPage = ({hosps, feed, healthData}) => {
  const [editing, setEditing] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  // Derive stats from live hospital + triage feed data
  const totalBeds    = hosps.reduce((a,h)=>a+h.beds, 0);
  const occupiedBeds = hosps.reduce((a,h)=>a+h.occ,  0);
  const sysOccPct    = Math.round((occupiedBeds/totalBeds)*100);
  const atCapacity   = hosps.filter(h=>(h.occ/h.beds)>0.85).length;
  const totalIcu     = hosps.reduce((a,h)=>a+h.icuT,0);
  const occupiedIcu  = hosps.reduce((a,h)=>a+h.icuO,0);
  const icuUtilPct   = Math.round((occupiedIcu/totalIcu)*100);

  // Urgency distribution from triage feed
  const urgencyDist  = {critical:0, urgent:0, stable:0};
  feed.forEach(c => { if(urgencyDist[c.sev]!==undefined) urgencyDist[c.sev]++; });
  const totalCases   = feed.length || 1;

  // Avg ETA from feed
  const etas = feed.map(item => item.eta).filter(Number.isFinite);
  const avgEta = etas.length ? Math.round(etas.reduce((sum, eta) => sum + eta, 0) / etas.length) : null;

  // Hospital-level capacity data for bar table
  const hospRows = hosps.map(h => ({
    id: h.id,
    name: h.name,
    beds: h.beds,
    occupiedBeds: h.occ,
    occ:  Math.round((h.occ/h.beds)*100),
    icu:  Math.round((h.icuO/h.icuT)*100),
    emg:  Math.round((h.emgO/h.emgT)*100),
    status: h.status,
  }));



  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:12,marginBottom:6}}>
        <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Analytics Summary</h2>
        <span style={{fontSize:12,color:'#a1a1aa'}}>Operational view for decision-makers · refreshes every 3s</span>
      </div>
      <p style={{color:'#a1a1aa',fontSize:13,marginBottom:22}}>Aggregate hospital performance, urgency distribution, and AI triage metrics across the Bengaluru network.</p>

      {/* Row 1 — System KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:20}}>
        <StatCard label="System Occupancy"    value={`${sysOccPct}%`}      sub={`${occupiedBeds} of ${totalBeds} beds filled`}                         color={sysOccPct>85?'#ef4444':'#f4f4f5'} icon=""/>
        <StatCard label="Hospitals at Capacity" value={atCapacity}           sub={`${hosps.length - atCapacity} accepting patients`}                        color={atCapacity>0?'#ef4444':'#10b981'} icon=""/>
        <StatCard label="ICU Utilisation"     value={`${icuUtilPct}%`}     sub={`${occupiedIcu} of ${totalIcu} ICU beds`}                               color={icuUtilPct>80?'#ef4444':'#f4f4f5'} icon=""/>
        <StatCard label="Avg. ETA to Hospital"  value={avgEta == null ? "—" : `${avgEta} min`}      sub={`across ${feed.length} active cases`}                                   color="var(--accent)" icon=""/>
      </div>

      {saveMessage && <p role="status" className="mb-3 text-sm text-emerald-300">{saveMessage}</p>}
      {editing && <CapacityEditor hospital={editing} onClose={() => setEditing(null)} onSaved={hospital => {
        setSaveMessage(`Capacity saved for ${hospital.name}.`);
      }}/>}
      {/* Row 2 — Urgency breakdown + hospital table */}
      <div className="analytics-grid" style={{display:'grid',gridTemplateColumns:'minmax(0, 1fr) minmax(0, 2fr)',gap:16,marginBottom:20}}>

        {/* Urgency distribution */}
        <div style={{background:'#09090b',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:20}}>
          <div style={{fontWeight:700,fontSize:13.5,marginBottom:16}}>Patients by Urgency</div>
          {[
            {label:'Critical', count:urgencyDist.critical, color:'#ef4444',  bg:'rgba(239,68,68,0.1)'},
            {label:'Urgent',   count:urgencyDist.urgent,   color:'#f59e0b', bg:'rgba(245,158,11,0.1)'},
            {label:'Stable',   count:urgencyDist.stable,   color:'#10b981',bg:'rgba(16,185,129,0.1)'},
          ].map((u,i) => (
            <div key={i} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:700,marginBottom:5}}>
                <span style={{color:u.color}}>{u.label}</span>
                <span>{u.count} ({Math.round((u.count/totalCases)*100)}%)</span>
              </div>
              <div style={{background:'rgba(39, 39, 42, 0.5)',borderRadius:99,height:8,overflow:'hidden'}}>
                <div style={{width:`${(u.count/totalCases)*100}%`,height:'100%',background:u.color,borderRadius:99,transition:'width .6s'}}/>
              </div>
            </div>
          ))}
          <div style={{marginTop:16,padding:'10px 12px',background:'#18181b',borderRadius:8,fontSize:11.5,color:'#a1a1aa'}}>
            <strong style={{color:'#f4f4f5'}}>Note for decision-makers:</strong> Urgency counts reflect the cases currently in the operations queue.
          </div>
        </div>

        {/* Per-hospital capacity table */}
        <div style={{background:'#09090b',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:20}}>
          <div style={{fontWeight:700,fontSize:13.5,marginBottom:16}}>Per-Hospital Utilisation</div>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Hospital capacity table">
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Hospital','Ward','ICU','Emergency','Status','Actions'].map(h=><th key={h} style={{fontSize:10,fontWeight:700,color:'#a1a1aa',textAlign:'left',padding:'0 8px 10px',textTransform:'uppercase',letterSpacing:.5}}>{h}</th>)}</tr></thead>
            <tbody>
              {hospRows.map(h => (
                <tr key={h.id} onMouseOver={e=>e.currentTarget.style.background='#18181b'} onMouseOut={e=>e.currentTarget.style.background=''}>
                  <td style={{padding:'9px 8px',borderTop:'1px solid var(--border)',fontSize:12.5,fontWeight:600}}>{h.name}</td>
                  {[h.occ, h.icu, h.emg].map((v,j)=>(
                    <td key={j} style={{padding:'9px 8px',borderTop:'1px solid var(--border)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={{width:56,height:5,background:'rgba(39, 39, 42, 0.5)',borderRadius:99,overflow:'hidden'}}>
                          <div style={{width:`${v}%`,height:'100%',background:v>85?'#ef4444':v>65?'#f59e0b':'#10b981',borderRadius:99}}/>
                        </div>
                        <span style={{fontSize:11.5,fontWeight:700,color:v>85?'#ef4444':'#f4f4f5'}}>{v}%</span>
                      </div>
                    </td>
                  ))}
                  <td style={{padding:'9px 8px',borderTop:'1px solid var(--border)'}}><StatusBadge status={h.status}/></td>

                  <td style={{padding:'9px 8px',borderTop:'1px solid var(--border)'}}>
                    <button 
                      aria-label={`Edit capacity for ${h.name}`}
                      onClick={() => { setSaveMessage(""); setEditing(h); }}
                      className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded text-xs hover:bg-blue-600/40 transition-colors"
                    >
                      Edit
                    </button>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Row 3 — AI triage metrics */}
      <div style={{background:'#09090b',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:20}}>
        <div style={{fontWeight:700,fontSize:13.5,marginBottom:6}}>AI Triage Engine Performance</div>
        <p style={{color:'#a1a1aa',fontSize:12.5,marginBottom:14}}>These metrics describe how the Azure AI Language service is performing as the primary triage classifier. A healthy system should show status <strong>ok</strong> with low latency. The fallback keyword classifier activates automatically when Azure is unreachable.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          {[
            {l:'AI Status',        v: healthData?.azure?.status    || 'unknown',  c: healthData?.azure?.status==='ok'?'#10b981':'#ef4444'},
            {l:'Total API Calls',  v: healthData?.azure?.callCount  || 0,          c: '#f4f4f5'},
            {l:'Error Count',      v: healthData?.azure?.errorCount || 0,          c: (healthData?.azure?.errorCount||0)>0?'#ef4444':'#10b981'},
            {l:'Avg Latency',      v: healthData?.azure?.avgLatencyMs ? `${healthData.azure.avgLatencyMs}ms` : '—', c: '#f4f4f5'},
          ].map((s,i)=>(
            <div key={i} style={{background:'#18181b',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:10,color:'#a1a1aa',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{s.l}</div>
              <div style={{fontWeight:800,fontSize:20,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>
        {healthData?.azure?.lastError && (
          <div style={{marginTop:14,padding:'10px 14px',background:'rgba(239,68,68,0.1)',borderRadius:8,fontSize:12,color:'#ef4444',fontWeight:600}}>
             Last Azure error: {healthData.azure.lastError}
          </div>
        )}
      </div>
    </div>
  );
};


const PredPage = ({hosps, feed}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontWeight:800,fontSize:22,marginBottom:6}}>Predictive Load Forecast</h2>
    <p style={{color:"#a1a1aa",marginBottom:22,fontSize:14}}>6-variable linear model · Variables: ward occupancy, discharge rate, inbound ambulances, avg length of stay, dept bed ratio, time-of-day load · mirrored in <code style={{background:"var(--border)",padding:"1px 5px",borderRadius:4}}>backend/services/capacityService.js</code></p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,marginBottom:24}}>
      {hosps.map((h,i)=>{
        const pred=PredictiveService.predict(h, feed.filter(patient => patient.destId === h.id || patient.destName === h.name).length);
        return(
          <div key={h.id} style={{background:"#09090b",border:"1px solid rgba(39, 39, 42, 0.5)",borderRadius:12,padding:20,animation:`scaleIn .4s ease ${i*.06}s both`}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>{h.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div style={{background:"#09090b",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"#a1a1aa",fontWeight:700,textTransform:"uppercase"}}>Now</div><div style={{fontWeight:800,fontSize:26,color:pred.curr>85?"var(--warn)":"var(--text)"}}>{pred.curr}%</div></div>
              <div style={{background:pred.p60>85?"rgba(239, 68, 68, 0.1)":"var(--surface)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"#a1a1aa",fontWeight:700,textTransform:"uppercase"}}>In 60 min</div><div style={{fontWeight:800,fontSize:26,color:pred.p60>85?"var(--warn)":"var(--accent2)"}}>{pred.p60}%</div></div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,marginBottom:8}}>
              <span style={{color:pred.trend==="up"?"var(--warn)":"var(--accent2)"}}>{pred.trend==="up"?"Increasing":pred.trend==="down"?"Decreasing":"Stable"}</span>
            </div>
            <Bar v={pred.p60}/>
          </div>
        );
      })}
    </div>
    <div className="bg-[#09090b] border border-zinc-800/50 rounded-xl p-5">
      <div style={{fontWeight:700,fontSize:14,color:"#3b82f6",marginBottom:10}}>🔵 Azure ML Integration Point</div>
      <p style={{color:"#a1a1aa",fontSize:13,lineHeight:1.7}}>Replace <code style={{background:"#09090b",padding:"2px 6px",borderRadius:4,fontSize:12}}>PredictiveService.predict()</code> with a <code style={{background:"#09090b",padding:"2px 6px",borderRadius:4,fontSize:12}}>fetch()</code> call to your Azure ML managed endpoint. ARIMA/LSTM trained on historical EHR telemetry. Interface contract is identical — no UI changes needed.</p>
    </div>
  </div>
);

// ─── SYSTEM HEALTH PAGE ──────────────────────────────────────────────────────
// Dedicated dependency health view with status colour coding, error details,
// and a brief commentary on each dependency's risk profile. This page is
// the interview-ready demonstration of "risk identification and mitigation."
const SysHealthPage = ({healthData}) => {
  const {
    azure  = {},
    server = {},
  } = healthData || {};

  const statusColor = s => ({
    ok:       '#059669',
    degraded: '#d97706',
    down:     '#ef4444',
    unknown:  '#a1a1aa',
    not_used: '#3b82f6',
    external: '#3b82f6',
  })[s] || '#a1a1aa';

  const statusBg = s => ({
    ok:       'rgba(16,185,129,0.1)',
    degraded: 'rgba(245,158,11,0.1)',
    down:     'rgba(239,68,68,0.1)',
    unknown:  '#18181b',
    not_used: 'rgba(59,130,246,0.1)',
    external: 'rgba(59,130,246,0.1)',
  })[s] || '#18181b';

  const deps = [
    {
      name:    'Azure AI Language (Text Analytics for Health)',
      icon:    '',
      status:  azure.status || 'unknown',
      metrics: [
        {l:'Total calls',     v: azure.callCount    || 0},
        {l:'Errors',          v: azure.errorCount   || 0},
        {l:'Error rate',      v: azure.callCount ? `${((azure.errorCount/azure.callCount)*100).toFixed(1)}%` : '—'},
        {l:'Avg latency',     v: azure.avgLatencyMs ? `${azure.avgLatencyMs}ms` : '—'},
        {l:'API key present', v: server.azureKeyConfigured ? 'Yes ✓' : 'No — fallback mode'},
        {l:'Last checked',    v: azure.lastChecked ? new Date(azure.lastChecked).toLocaleTimeString() : 'Never'},
      ],
      lastError: azure.lastError,
      // Risk commentary — the kind of trade-off analysis a TC interviewer probes
      risk: 'External SaaS dependency. If Azure Language service is unreachable, the system degrades gracefully to the rule-based keyword classifier — no patient data is lost and routing continues. Mitigation: the fallback is always present in triageService.js regardless of credentials.',
      mitigation: 'Graceful fallback to rule-based classifier · source badge visible in UI',
    },
    {
      name:    'OSRM Road Routing API',
      icon:    '',
      status:  'external',
      metrics: [
        {l:'Used in',   v: 'simulate.py (Python simulator)'},
        {l:'Protocol',  v: 'HTTP REST, public demo server'},
        {l:'Fallback',  v: 'Haversine straight-line distance'},
      ],
      lastError: null,
      risk: 'OSRM is called by the Python simulator, not the Node.js backend. The demo server (router.project-osrm.org) has no SLA. If it is down, simulate.py will fall back to Haversine distance calculation, which overestimates ETA slightly but does not break routing.',
      mitigation: 'Haversine fallback in SpatialService · no single-point-of-failure on routing path',
    },
    {
      name:    'Backend Server',
      icon:    '',
      status:  'ok',
      metrics: [
        {l:'Started at',        v: server.startedAt ? new Date(server.startedAt).toLocaleTimeString() : '—'},
        {l:'Patients triaged',  v: server.patientsTotal || 0},
        {l:'Total errors',      v: server.errorsTotal   || 0},
        {l:'Rate limit',        v: '10 req/IP/min on /api/triage'},
        {l:'Input validation',  v: 'Active on /api/triage + /api/classify'},
      ],
      lastError: null,
      risk: 'In-memory rate limiter resets on restart and does not scale horizontally. In production, replace with Redis-backed express-rate-limit to persist limits across instances and restarts.',
      mitigation: 'Rate limit (429) + input validation (400) guard against malformed or abusive requests',
    },
  ];

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:12,marginBottom:6}}>
        <h2 style={{fontWeight:800,fontSize:22,margin:0}}>System Health</h2>
        <span style={{fontSize:12,color:'#a1a1aa'}}>External dependency status · risk identification &amp; mitigation</span>
      </div>
      <p style={{color:'#a1a1aa',fontSize:13,marginBottom:22}}>
        Each dependency below is classified by its current status, failure mode, and the mitigation already in place.
        This view demonstrates the risk thinking behind the architecture.
      </p>

      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {deps.map((d,i) => (
          <div key={i} style={{background:'#09090b',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:22,animation:`fadeUp .4s ease ${i*.07}s both`}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,flexWrap:'wrap'}}>
              <span style={{fontSize:24}}>{d.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15}}>{d.name}</div>
              </div>
              <span style={{
                background: statusBg(d.status),
                color:      statusColor(d.status),
                fontWeight: 700,
                fontSize:   11,
                padding:    '4px 14px',
                borderRadius: 20,
                textTransform: 'uppercase',
                border: `1px solid ${statusColor(d.status)}40`,
              }}>{d.status.replace('_',' ')}</span>
            </div>

            {/* Metrics grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginBottom:14}}>
              {d.metrics.map((m,j) => (
                <div key={j} style={{background:'#09090b',borderRadius:7,padding:'8px 12px'}}>
                  <div style={{fontSize:10,color:'#a1a1aa',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>{m.l}</div>
                  <div style={{fontWeight:700,fontSize:13}}>{String(m.v)}</div>
                </div>
              ))}
            </div>

            {/* Last error */}
            {d.lastError && (
              <div style={{marginBottom:12,padding:'10px 14px',background:'rgba(239,68,68,0.1)',borderRadius:8,fontSize:12,color:'#ef4444',fontWeight:600}}>
                 Last error: {d.lastError}
              </div>
            )}

            {/* Risk + mitigation */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{background:'rgba(245,158,11,0.1)',borderRadius:8,padding:'11px 14px'}}>
                <div style={{fontSize:10.5,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}> Risk</div>
                <div style={{fontSize:12,color:'#78350f',lineHeight:1.6}}>{d.risk}</div>
              </div>
              <div style={{background:'rgba(16,185,129,0.1)',borderRadius:8,padding:'11px 14px'}}>
                <div style={{fontSize:10.5,fontWeight:700,color:'#065f46',textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>✓ Mitigation</div>
                <div style={{fontSize:12,color:'#064e3b',lineHeight:1.6}}>{d.mitigation}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


const TelPage = ({hosps,now}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontWeight:800,fontSize:22,marginBottom:6}}>Live Telemetry Feed</h2>
    <p style={{color:"#a1a1aa",marginBottom:20,fontSize:14}}>Facility snapshots received from the operations server.</p>
    <div style={{background:"#09090b",borderRadius:12,padding:22,fontSize:12.5,lineHeight:1.9,color:"#94a3b8",maxHeight:440,overflow:"auto",marginBottom:20}}>
      {hosps.map(h=>(
        <div key={h.id} style={{marginBottom:4}}>
          <span style={{color:"#60a5fa"}}>[{now?.toLocaleTimeString() ?? "Snapshot"}]</span>{" "}
          <span style={{color:"#34d399"}}>{h.id}</span>{" "}
          <span style={{color:h.status==="saturated"?"#f87171":"#a78bfa"}}>status={h.status}</span>{" "}
          <span style={{color:"#fcd34d"}}>occ={((h.occ/h.beds)*100).toFixed(1)}%</span>{" "}
          beds={h.occ}/{h.beds} icu={h.icuO}/{h.icuT} emg={h.emgO}/{h.emgT}
        </div>
      ))}
      <div style={{color:"#4ade80",marginTop:10}}>{">"} {hosps.length} facilities · {now ? `Last received ${now.toLocaleTimeString()}` : "Bundled snapshot"}</div>
    </div>

  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [view,setView]=useState("landing");
  const [initialSymptoms,setInitialSymptoms]=useState("");
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  return(
    <>

      {view==="landing" && 
        <Landing
          onAnalyse={(symptoms)=>{
            setInitialSymptoms(symptoms);
            setView("patient");
          }}
          onAdmin={()=>setView("adminLogin")}
        />
      }

      {view==="patient" && 
        <PatientFlow
          initialSymptoms={initialSymptoms}
          onBack={()=>setView("landing")}
        />
      }

      {view==="adminLogin" && 
        <AdminLogin
          onSuccess={()=>setView("admin")}
          onBack={()=>setView("landing")}
        />
      }

      {view==="admin" && 
        <Admin onLogout={()=>setView("landing")}/>
      }
    </>
  );
}
