import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
const socket = io("http://localhost:5000");
const GlobalStyles = ({dark}) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy:       ${dark?"#07111f":"#f4f6fa"};
      --navy-mid:   ${dark?"#0A1628":"#eaecf3"};
      --navy-card:  ${dark?"#0d1f38":"#ffffff"};
      --navy-light: ${dark?"#112240":"#e2e8f5"};
      --teal:       #0FB47A;
      --teal-dim:   rgba(15,180,122,0.15);
      --teal-glow:  rgba(15,180,122,0.35);
      --blue:       #1D6FE5;
      --blue-dim:   rgba(29,111,229,0.15);
      --amber:      #f59e0b;
      --warn:       #ef4444;
      --warn-dim:   rgba(239,68,68,0.12);
      --border:     ${dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)"};
      --border-hi:  ${dark?"rgba(255,255,255,0.16)":"rgba(0,0,0,0.14)"};
      --text:       ${dark?"#e2e8f0":"#0f172a"};
      --text-dim:   ${dark?"rgba(226,232,240,0.55)":"rgba(15,23,42,0.6)"};
      --text-muted: ${dark?"rgba(226,232,240,0.3)":"rgba(15,23,42,0.38)"};
      --sw: 240px;
      --r: 14px;
    }
    html { scroll-behavior: smooth; }
    body {
      background: var(--navy);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      -webkit-font-smoothing: antialiased;
      transition: background 0.3s, color 0.3s;
    }
    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.12)"}; border-radius: 99px; }
    /* ── Animations ── */
    @keyframes spin      { to { transform: rotate(360deg); } }
    @keyframes fadeUp    { from { opacity:0; transform:translateY(22px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
    @keyframes scaleIn   { from { opacity:0; transform:scale(0.93); } to { opacity:1; transform:scale(1); } }
    @keyframes slideIn   { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
    @keyframes pd        { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
    @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes pulse     { 0%,100%{box-shadow:0 0 0 0 var(--teal-glow)} 70%{box-shadow:0 0 0 10px transparent} }
    @keyframes glowPulse { 0%,100%{filter:drop-shadow(0 0 10px var(--teal-glow))} 50%{filter:drop-shadow(0 0 24px rgba(15,180,122,0.6))} }
    @keyframes revealPath{ from{stroke-dashoffset:400;opacity:0} to{stroke-dashoffset:0;opacity:1} }
    @keyframes dotPop    { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.3);opacity:1} 100%{transform:scale(1);opacity:1} }
    @keyframes scanline  { from{transform:translateY(-100%)} to{transform:translateY(100vh)} }
    @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    /* ── Glass card ── */
    .glass {
      background: ${dark?"rgba(13,31,56,0.8)":"rgba(255,255,255,0.85)"};
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
    }
    .glass-hi {
      background: ${dark?"rgba(17,34,64,0.9)":"rgba(255,255,255,0.95)"};
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-hi);
    }
    /* ── Nav triangle ── */
    .live-nav-triangle { background: transparent; border: none; }
    /* ── Textarea & Input resets ── */
    textarea, input {
      font-family: 'Outfit', sans-serif;
    }
    textarea:focus, input:focus { outline: none; }
    /* ── Map tiles ── */
    .leaflet-tile { ${dark?"filter: brightness(0.8) saturate(0.7) hue-rotate(180deg) invert(1) hue-rotate(180deg);":""} }
    .leaflet-container { background: var(--navy) !important; }
    /* ── Priority color dots ── */
    .pri-1 { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.7); }
    .pri-2 { background: #f97316; box-shadow: 0 0 8px rgba(249,115,22,0.6); }
    .pri-3 { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
    .pri-4 { background: #84cc16; box-shadow: 0 0 8px rgba(132,204,22,0.5); }
    .pri-5 { background: #0FB47A; box-shadow: 0 0 8px rgba(15,180,122,0.5); }
    /* ── Responsive ── */
    @media (max-width: 768px) {
      :root { --sw: 0px; }
      .admin-sidebar { display: none !important; }
      .admin-main { margin-left: 0 !important; }
      .dash-kpi-grid { grid-template-columns: 1fr 1fr !important; }
      .dash-mid-grid { grid-template-columns: 1fr !important; }
      .dash-bot-grid { grid-template-columns: 1fr !important; }
      .meaning-grid  { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 480px) {
      .dash-kpi-grid { grid-template-columns: 1fr !important; }
    }
  `}</style>
);
const CFG = {
  PEAK_HOURS: [8,9,10,17,18,19,20],
  URGENCY: {
    1:{label:"Non-Urgent",color:"#059669",bg:"#ecfdf5"},
    2:{label:"Low",color:"#65a30d",bg:"#f7fee7"},
    3:{label:"Moderate",color:"#d97706",bg:"#fffbeb"},
    4:{label:"High",color:"#e85d4a",bg:"#fff1f0"},
    5:{label:"Critical",color:"#991b1b",bg:"#fff1f0"},
  },
};
const navTriangleIcon = new L.divIcon({
  className: 'live-nav-triangle',
  html: `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="38" height="38" style="filter:drop-shadow(0px 3px 8px rgba(0,0,0,0.5))">
      <path d="M12 2L2 22L12 18L22 22L12 2Z" fill="#0FB47A" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});
const mkWards = () => [
  {id:"w1",name:"Emergency",beds:35,occ:32,status:"saturated"},
  {id:"w2",name:"Intensive Care (ICU)",beds:44,occ:41,status:"saturated"},
  {id:"w3",name:"Cardiology",beds:80,occ:65,status:"moderate"},
  {id:"w4",name:"Neurology",beds:60,occ:40,status:"accepting"},
  {id:"w5",name:"General Ward",beds:221,occ:141,status:"accepting"},
];
const mkHospitals = () => [
  {id:"h1",name:"Adarsha Hospital",area:"Udupi",phone:"+91 820-2520520",coords:{lat:13.3375,lng:74.7441},depts:["Cardiology","Emergency"],beds:380,occ:370},
  {id:"h2",name:"KMC Hospital",area:"Mangaluru",phone:"+91 824-2445858",coords:{lat:12.8703,lng:74.8430},depts:["Cardiology","Emergency","Neurology"],beds:1000,occ:950},
  {id:"h4",name:"Kasturba Hospital",area:"Manipal",phone:"+91 820-2922761",coords:{lat:13.3533,lng:74.7844},depts:["General Medicine","Emergency","Cardiology"],beds:440,occ:120},
  {id:"h5",name:"Chinmayi Hospital",area:"Kundapura",phone:"+91 8254-230005",coords:{lat:13.6234,lng:74.6934},depts:["Neurology","Orthopedics","Emergency"],beds:300,occ:210},
];
const CRITICAL_PATTERNS = [
  /chest\s*pain/i, /heart\s*attack/i, /cardiac\s*arrest/i, /myocardial/i,
  /stroke/i, /facial\s*droop/i, /slurred\s*speech/i,
  /unconscious/i, /unresponsive/i, /collapsed/i, /not\s*breathing/i,
  /severe\s*bleeding/i, /anaphylax/i, /seizure/i, /overdose/i,
  /trauma/i, /head\s*injury/i,
];
const MODERATE_PATTERNS = [
  /shortness\s*of\s*breath/i, /difficulty\s*breathing/i, /asthma/i,
  /high\s*fever/i, /fever\s*above/i, /abdominal\s*pain/i, /severe/i,
  /fracture/i, /broken/i, /disloc/i, /laceration/i, /deep\s*cut/i,
  /vomiting/i, /severe\s*pain/i, /extreme/i, /worst/i,
];
const TriageService = {
  MAP:[
    {kw:["chest pain","cardiac","palpitation","angina","heart attack"],dept:"Cardiology",pri:1},
    {kw:["stroke","facial droop","slurred speech","seizure","brain","head injury","unconscious"],dept:"Neurology",pri:1},
    {kw:["breathing","shortness of breath","asthma","pneumonia","not breathing"],dept:"Emergency",pri:2},
    {kw:["fracture","bone","joint","sprain","orthopedic","knee","broken","disloc"],dept:"Orthopedics",pri:3},
    {kw:["unconscious","unresponsive","collapsed","trauma","overdose"],dept:"Emergency",pri:1},
    {kw:["fever","vomiting","abdominal","stomach"],dept:"General Ward",pri:2},
  ],
  classify(text){
    const t = text.toLowerCase();
    let deptScores = {}, deptPri = {};
    for(const e of this.MAP) {
      for(const k of e.kw) {
        if(t.includes(k)) {
          deptScores[e.dept] = (deptScores[e.dept]||0) + 1;
          if(!deptPri[e.dept] || e.pri < deptPri[e.dept]) deptPri[e.dept] = e.pri;
        }
      }
    }
    let dept = "General Ward", maxScore = 0;
    for(const d in deptScores) if(deptScores[d] > maxScore) { maxScore = deptScores[d]; dept = d; }
    let priority = 3;
    if(CRITICAL_PATTERNS.some(p => p.test(text))) priority = 1;
    else if(MODERATE_PATTERNS.some(p => p.test(text))) priority = 2;
    else if(deptPri[dept]) priority = Math.min(3, deptPri[dept]);
    const urgency = priority === 1 ? 5 : priority === 2 ? 3 : 1;
    return { urgency, dept, priority };
  }
};
const BASE_WAIT = {
  "Emergency": 45,
  "Intensive Care (ICU)": 90,
  "Cardiology": 35,
  "Neurology": 40,
  "General Ward": 20,
  "Orthopedics": 30,
  "General Medicine": 25,
};
const PEAK_MULTIPLIER = [8,9,10,17,18,19,20];
const WaitTimeService = {
  calcWait(occRatio, deptName, now = new Date()) {
    const base = BASE_WAIT[deptName] || 30;
    const occFactor = 1 + (occRatio * 2);
    const hr = now.getHours();
    const peakFactor = PEAK_MULTIPLIER.includes(hr) ? 1.4 : 1.0;
    const nightFactor = (hr >= 0 && hr < 5) ? 0.6 : 1.0;
    return Math.max(5, Math.round(base * occFactor * peakFactor * nightFactor));
  },
  forHospital(hospital, dept, liveWards, isKasturba) {
    let occRatio;
    if(isKasturba && liveWards) {
      const ward = liveWards.find(w => w.name === dept || w.name.includes(dept) || dept.includes(w.name.split(" ")[0]));
      if(ward) occRatio = ward.occ / ward.beds;
      else {
        const tot = liveWards.reduce((a,w)=>a+w.occ,0);
        const totB = liveWards.reduce((a,w)=>a+w.beds,0);
        occRatio = tot / totB;
      }
    } else {
      occRatio = hospital.occ / hospital.beds;
    }
    return this.calcWait(occRatio, dept);
  },
  saturationWait(ward) {
    const ratio = ward ? ward.occ / ward.beds : 0.92;
    return this.calcWait(ratio, ward ? ward.name : "Emergency");
  },
};
const PredictiveService = {
  predict(w){
    const curr=Math.round((w.occ/w.beds)*100);
    const hr = new Date().getHours();
    const trend=PEAK_MULTIPLIER.includes(hr)?4+Math.random()*6:-2+Math.random()*4;
    return {curr,p60:Math.min(100,Math.max(0,Math.round(curr+trend))),trend:trend>0?"up":"down",conf:+(0.76+Math.random()*0.14).toFixed(2)};
  },
};
const PriorityColor = {
  1: {bg:"rgba(239,68,68,0.15)",  border:"rgba(239,68,68,0.4)",   text:"#ef4444", dot:"#ef4444", label:"High Priority", short:"HIGH"},
  2: {bg:"rgba(245,158,11,0.15)", border:"rgba(245,158,11,0.4)",  text:"#f59e0b", dot:"#f59e0b", label:"Medium Priority", short:"MED"},
  3: {bg:"rgba(15,180,122,0.15)", border:"rgba(15,180,122,0.35)", text:"#0FB47A", dot:"#0FB47A", label:"Low Priority",    short:"LOW"},
};
const LogoMark = ({ size = 36, animated = false, dark = true }) => (
  <svg width={size} height={size} viewBox="0 0 140 140" fill="none" style={animated ? {animation:'glowPulse 3.5s ease-in-out infinite'} : {}}>
    <defs>
      <linearGradient id="arcG" x1="10" y1="100" x2="130" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1D6FE5"/><stop offset="100%" stopColor="#0FB47A"/>
      </linearGradient>
      <linearGradient id="pulG" x1="48" y1="90" x2="92" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#1D6FE5" stopOpacity="0.6"/><stop offset="100%" stopColor="#0FB47A"/>
      </linearGradient>
      <filter id="glo"><feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="dgl"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    {}
    {!dark&&<circle cx="70" cy="70" r="68" fill="rgba(29,111,229,0.08)" stroke="rgba(15,180,122,0.25)" strokeWidth="1.5"/>}
    <path d="M 18 108 C 28 72, 56 42, 122 28" stroke="url(#arcG)" strokeWidth="3.5" strokeLinecap="round" fill="none" filter="url(#glo)"
      style={animated ? {strokeDasharray:180,strokeDashoffset:180,animation:'revealPath 1.4s cubic-bezier(0.16,1,0.3,1) 0.2s forwards'} : {}}/>
    <polyline points="52,76 60,76 66,58 72,88 78,50 84,76 92,76" stroke="url(#pulG)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#glo)"
      style={animated ? {strokeDasharray:160,strokeDashoffset:160,animation:'revealPath 1s cubic-bezier(0.16,1,0.3,1) 0.9s forwards'} : {}}/>
    <circle cx="122" cy="28" r="6.5" fill="#0FB47A" filter="url(#dgl)"
      style={animated ? {animation:'dotPop 0.6s cubic-bezier(0.34,1.56,0.64,1) 1.5s both',transformOrigin:'122px 28px'} : {}}/>
    <circle cx="18" cy="108" r="3.5" fill="#1D6FE5" opacity="0.7"
      style={animated ? {animation:'dotPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s both',transformOrigin:'18px 108px'} : {}}/>
  </svg>
);
const Wordmark = ({ size = 22, dark = true }) => (
  <span style={{display:'flex',alignItems:'baseline',gap:1}}>
    <span style={{fontFamily:"'DM Serif Display',serif",fontSize:size,fontWeight:400,letterSpacing:'-0.5px',color:dark?'#e2e8f0':'#0A1628',lineHeight:1}}>Aero</span>
    <span style={{fontFamily:"'DM Serif Display',serif",fontStyle:'italic',fontSize:size,fontWeight:400,letterSpacing:'-0.5px',color:'#0FB47A',lineHeight:1}}>Health</span>
  </span>
);
const Spinner = ({size=20,color="#0FB47A"}) => (
  <div style={{width:size,height:size,border:`2px solid ${color}25`,borderTopColor:color,borderRadius:"50%",animation:"spin .8s linear infinite",flexShrink:0}}/>
);
const Bar = ({v,max=100,h=5}) => {
  const p=Math.min(100,(v/max)*100);
  const col=p>85?"#ef4444":p>65?"#f59e0b":"#0FB47A";
  return (
    <div style={{background:"rgba(128,128,128,0.12)",borderRadius:99,height:h,overflow:"hidden"}}>
      <div style={{width:`${p}%`,height:"100%",background:col,borderRadius:99,transition:"width .6s ease",boxShadow:`0 0 8px ${col}66`}}/>
    </div>
  );
};
const StatusBadge = ({status}) => {
  const M={accepting:{bg:"rgba(15,180,122,0.15)",c:"#0FB47A",l:"Accepting"},moderate:{bg:"rgba(245,158,11,0.15)",c:"#f59e0b",l:"Moderate"},saturated:{bg:"rgba(239,68,68,0.15)",c:"#ef4444",l:"Saturated"}};
  const s=M[status]||M.accepting;
  return <span style={{background:s.bg,color:s.c,fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:99,letterSpacing:'0.5px',textTransform:'uppercase',border:`1px solid ${s.c}33`}}>{s.l}</span>;
};
const SevDot = ({sev, priority}) => {
  let col;
  if(priority===1) col="#ef4444";
  else if(priority===2) col="#f59e0b";
  else if(priority===3) col="#0FB47A";
  else col=sev==="critical"?"#ef4444":sev==="urgent"?"#f59e0b":"#0FB47A";
  return <div style={{width:9,height:9,borderRadius:"50%",background:col,flexShrink:0,boxShadow:`0 0 7px ${col}`,marginTop:2}}/>;
};
const DarkToggle = ({dark,onToggle}) => (
  <button onClick={onToggle} title={dark?"Switch to light mode":"Switch to dark mode"}
    style={{width:36,height:36,borderRadius:9,border:"1px solid var(--border-hi)",background:"rgba(128,128,128,0.08)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.2s",flexShrink:0}}
    onMouseOver={e=>e.currentTarget.style.background="rgba(128,128,128,0.15)"}
    onMouseOut={e=>e.currentTarget.style.background="rgba(128,128,128,0.08)"}>
    {dark?(
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="#f59e0b" strokeWidth="1.6"/>
        <line x1="8" y1="1" x2="8" y2="3" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="8" y1="13" x2="8" y2="15" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="1" y1="8" x2="3" y2="8" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="13" y1="8" x2="15" y2="8" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="2.93" y1="2.93" x2="4.34" y2="4.34" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="11.66" y1="11.66" x2="13.07" y2="13.07" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="11.66" y1="4.34" x2="13.07" y2="2.93" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="2.93" y1="13.07" x2="4.34" y2="11.66" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ):(
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" stroke="#1D6FE5" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      </svg>
    )}
  </button>
);
const NavDirectionIcon = ({instruction=""}) => {
  const t = instruction.toLowerCase();
  const c = "#0FB47A";
  if(t.includes("arrive")) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke={c} strokeWidth="1.8"/>
      <circle cx="9" cy="9" r="3" fill={c}/>
    </svg>
  );
  if(t.includes("right")) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M5 14V7h5V4l4 4.5L10 13v-3H7v4H5z" fill={c}/>
    </svg>
  );
  if(t.includes("left")) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13 14V7H8V4L4 8.5 8 13v-3h3v4h2z" fill={c}/>
    </svg>
  );
  if(t.includes("roundabout")||t.includes("rotary")) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="4.5" stroke={c} strokeWidth="1.8" fill="none"/>
      <path d="M13.5 4.5l1.5-1.5M13.5 4.5h-2M13.5 4.5V2.5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if(t.includes("merge")||t.includes("fork")) return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 14V8M5 4l4 4M13 4l-4 4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 14V4M5 8l4-4 4 4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};
const AutoNavTracker = ({centerPos, navInstructions, currentStep, setCurrentStep}) => {
  const map = useMap();
  const prevPos = useRef(null);
  React.useEffect(()=>{
    if(!centerPos||!centerPos[0]||!centerPos[1]) return;
    map.flyTo(centerPos, 17, {animate:true, duration:1.2, easeLinearity:0.3});
    if(navInstructions && navInstructions.length > 0 && currentStep < navInstructions.length-1) {
      const next = navInstructions[currentStep+1];
      if(next && next.lat && next.lng) {
        const dlat = centerPos[0] - next.lat;
        const dlng = centerPos[1] - next.lng;
        const distMeters = Math.sqrt(dlat*dlat + dlng*dlng) * 111320;
        if(distMeters < 35) setCurrentStep(s => Math.min(navInstructions.length-1, s+1));
      }
    }
    prevPos.current = centerPos;
  },[centerPos, map, navInstructions, currentStep, setCurrentStep]);
  return null;
};
const mkPriorityIcon = (priority) => {
  const colors = { 1:"#ef4444", 2:"#f59e0b", 3:"#0FB47A" };
  const c = colors[priority] || "#94a3b8";
  return new L.divIcon({
    className: 'live-nav-triangle',
    html: `<div style="position:relative;width:28px;height:36px">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45))">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22S28 23.5 28 14C28 6.27 21.73 0 14 0z" fill="${c}"/>
        <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
      </svg>
    </div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
};
const hospitalIcon = new L.divIcon({
  className: 'live-nav-triangle',
  html: `<div style="width:36px;height:36px">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36" style="filter:drop-shadow(0 2px 8px rgba(0,0,0,0.4))">
      <rect x="2" y="2" width="32" height="32" rx="8" fill="#0FB47A"/>
      <rect x="15" y="8" width="6" height="20" rx="2" fill="white"/>
      <rect x="8" y="15" width="20" height="6" rx="2" fill="white"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
});
const mkDotIcon = (priority) => {
  const colors = { 1:"#ef4444", 2:"#f59e0b", 3:"#0FB47A" };
  const c = colors[priority] || "#94a3b8";
  const shadow = priority===1?"rgba(239,68,68,0.6)":priority===2?"rgba(245,158,11,0.5)":"rgba(15,180,122,0.5)";
  return new L.divIcon({
    className: 'live-nav-triangle',
    html: `<div style="width:18px;height:18px;display:flex;align-items:center;justify-content:center">
      <div style="width:14px;height:14px;border-radius:50%;background:${c};box-shadow:0 0 0 3px ${c}33,0 0 10px ${shadow};border:2px solid white"></div>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
};
const LiveRoadMap = ({feed}) => {
  const hospPos=[13.3533,74.7844];
  return (
    <div style={{borderRadius:10,height:260,position:"relative",overflow:"hidden",border:"1px solid var(--border)",zIndex:1}}>
      <MapContainer center={hospPos} zoom={13} style={{height:'100%',width:'100%'}} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <Circle center={hospPos} radius={600} pathOptions={{color:'#0FB47A',fillColor:'#0FB47A',fillOpacity:0.08}}/>
        <Marker position={hospPos} icon={hospitalIcon}><Popup><strong>Kasturba Hospital</strong><br/>Command Center</Popup></Marker>
        {feed.map((p)=>{
          if(!p.lat||!p.lng) return null;
          const pri = p.priority ? Number(p.priority) : (p.sev==="critical"?1:p.sev==="urgent"?2:3);
          const pc = PriorityColor[pri]||PriorityColor[3];
          return (
            <Marker key={p.id} position={[p.lat,p.lng]} icon={mkDotIcon(pri)}>
              <Popup>
                <div style={{fontFamily:"'Outfit',sans-serif",minWidth:120}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:3}}>{p.name}</div>
                  <div style={{color:pc.text,fontWeight:700,fontSize:11,marginBottom:2}}>{pc.label}</div>
                  <div style={{fontSize:11,color:"#666"}}>Dept: {p.dept}</div>
                  <div style={{fontSize:11,color:"#666"}}>ETA: {p.eta} min</div>
                  {p.phone&&<div style={{fontSize:11,color:"#666"}}>Tel: {p.phone}</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {}
      <div style={{position:"absolute",bottom:8,right:8,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",borderRadius:8,padding:"5px 8px",fontSize:10,fontWeight:600,zIndex:999,display:"flex",gap:8,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
        {[[1,"#ef4444","High"],[2,"#f59e0b","Med"],[3,"#0FB47A","Low"]].map(([p,c,l])=>(
          <div key={p} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
            <span style={{color:"#333"}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
const Landing = ({onAnalyse,onAdmin,dark,onToggleDark}) => {
  const [symptoms,setSymptoms]=useState("");
  const [focused,setFocused]=useState(false);
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--navy)",position:"relative",overflow:"hidden"}}>
      {}
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${dark?"rgba(15,180,122,0.025)":"rgba(29,111,229,0.04)"} 1px, transparent 1px), linear-gradient(90deg, ${dark?"rgba(15,180,122,0.025)":"rgba(29,111,229,0.04)"} 1px, transparent 1px)`,backgroundSize:"60px 60px",pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"-20%",right:"-5%",width:560,height:560,background:`radial-gradient(circle, ${dark?"rgba(29,111,229,0.1)":"rgba(29,111,229,0.06)"} 0%, transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"-15%",left:"-5%",width:480,height:480,background:`radial-gradient(circle, ${dark?"rgba(15,180,122,0.07)":"rgba(15,180,122,0.05)"} 0%, transparent 70%)`,pointerEvents:"none"}}/>
      {}
      <nav style={{height:60,padding:"0 clamp(20px,5vw,52px)",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:10,borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <LogoMark size={32} animated dark={dark}/>
          <Wordmark size={19} dark={dark}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <DarkToggle dark={dark} onToggle={onToggleDark}/>
          <button onClick={onAdmin} style={{padding:"7px 18px",borderRadius:8,border:`1px solid var(--border-hi)`,background:"transparent",fontWeight:600,fontSize:13,color:"var(--text-dim)",cursor:"pointer",transition:"all 0.2s",fontFamily:"'Outfit',sans-serif"}}
            onMouseOver={e=>{e.currentTarget.style.background=dark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.05)";}}
            onMouseOut={e=>{e.currentTarget.style.background="transparent";}}>
            Login
          </button>
        </div>
      </nav>
      {}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px clamp(20px,5vw,40px)",position:"relative",zIndex:1}}>
        <div style={{maxWidth:620,width:"100%",textAlign:"center",animation:"fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both"}}>
          {}
          {}
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:"clamp(34px,5vw,50px)",fontWeight:100,lineHeight:1.08,marginBottom:16,letterSpacing:"-1.5px",color:"var(--text)"}}>
            What is your <span style={{fontStyle:"italic",color:"#0FB47A"}}>Emergency</span> ?
          </h1>
          <br></br>
          {}
          <div style={{background:"var(--navy-card)",border:`1.5px solid ${focused?"rgba(15,180,122,0.4)":"var(--border)"}`,borderRadius:16,padding:4,boxShadow:focused?`0 0 0 3px rgba(15,180,122,0.1)`:`0 20px 50px ${dark?"rgba(0,0,0,0.35)":"rgba(0,0,0,0.08)"}`,transition:"all 0.3s",maxWidth:700,margin:"0 auto"}}>
            <textarea
              value={symptoms}
              onChange={e=>setSymptoms(e.target.value)}
              onFocus={()=>setFocused(true)}
              onBlur={()=>setFocused(false)}
              placeholder="Describe your symptoms… (e.g. severe chest pain, shortness of breath)"
              rows={3}
              style={{width:"100%",padding:"15px 17px",borderRadius:13,border:"none",fontSize:14,background:"transparent",color:"var(--text)",resize:"none",lineHeight:1.6,fontFamily:"'Outfit',sans-serif"}}
            />
            <div style={{padding:"4px 8px 8px",display:"flex",justifyContent:"flex-end"}}>
              <button
                onClick={()=>onAnalyse(symptoms)}
                disabled={!symptoms.trim()}
                style={{padding:"11px 26px",borderRadius:10,border:"none",background:symptoms.trim()?"linear-gradient(135deg,#1D6FE5,#0FB47A)":"rgba(128,128,128,0.1)",color:symptoms.trim()?"#fff":"var(--text-muted)",fontWeight:700,fontSize:14,cursor:symptoms.trim()?"pointer":"default",transition:"all 0.3s",fontFamily:"'Outfit',sans-serif",boxShadow:symptoms.trim()?"0 6px 20px rgba(15,180,122,0.28)":"none"}}>
                Analyse & Route →
              </button>
            </div>
          </div>
          {}
          <div style={{display:"flex",gap:28,justifyContent:"center",marginTop:36,flexWrap:"wrap"}}>
            {[["< 90s","Routing time"],["4","Hospitals live"],["100","Customer Served"]].map(([v,l],i)=>(
              <div key={i} style={{textAlign:"center",animation:`fadeUp 0.7s ease ${0.15+i*0.1}s both`}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,fontWeight:400,color:"#0FB47A"}}>{v}</div>
                <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:500,marginTop:1,letterSpacing:"0.5px",textTransform:"uppercase"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
const PatientFlow = ({initialSymptoms,onBack,liveWards,dark,onToggleDark}) => {
  const [step,setStep]=useState("analyzing");
  const [triage,setTriage]=useState(null);
  const [myId,setMyId]=useState(null);
  const [hospitals]=useState(mkHospitals());
  const [selectedHosp,setSelectedHosp]=useState(null);
  const [showRerouteAlert,setShowRerouteAlert]=useState(false);
  const [liveData,setLiveData]=useState(null);
  const [userLoc,setUserLoc]=useState(null);  
  const [roadEtas,setRoadEtas]=useState({});
  const [gpsStatus,setGpsStatus]=useState("pending");
  const [actionModal,setActionModal]=useState(null);
  const [userPhone,setUserPhone]=useState("");
  const [navInstructions,setNavInstructions]=useState([]);
  const [currentStep,setCurrentStep]=useState(0);
  const watchId=useRef(null);
  const rerouteHandled=useRef(false);
  useEffect(() => {
    const MIT_BLOCK_14 = { lat: 13.3484, lng: 74.7922 };
    if ("geolocation" in navigator) {
      const getAccuratePosition = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (pos.coords.accuracy > 2000) {
              console.warn(`GPS accuracy too low (${pos.coords.accuracy}m). Falling back to Block-14.`);
              setUserLoc(MIT_BLOCK_14);
              setGpsStatus("simulated"); 
              return;
            }
            setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setGpsStatus("success");
          },
          (err) => {
            console.warn("GPS Access Failed:", err.message, "Falling back to Block-14.");
            setUserLoc(MIT_BLOCK_14);
            setGpsStatus("simulated"); 
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 } 
        );
      };
      getAccuratePosition();
    } else {
      setUserLoc(MIT_BLOCK_14);
      setGpsStatus("simulated");
    }
  }, []);
  useEffect(() => {
    if (!userLoc) {
      const emptyEtas = {};
      hospitals.forEach(h => emptyEtas[h.id] = "--");
      setRoadEtas(emptyEtas);
      return; 
    }
    const fetchRealEtas = async () => {
      const newEtas = {};
      const hr = new Date().getHours();
      const trafficFactor = (hr>=8&&hr<=10)||(hr>=17&&hr<=20) ? 1.45 :
                            (hr>=7&&hr<=11)||(hr>=16&&hr<=21) ? 1.2 : 1.0;
      await Promise.all(hospitals.map(async h => {
        try {
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLoc.lng},${userLoc.lat};${h.coords.lng},${h.coords.lat}`);
          const data = await res.json();
          if (data.routes && data.routes[0]) {
            const baseMins = Math.ceil(data.routes[0].duration / 60);
            newEtas[h.id] = Math.max(1, Math.round(baseMins * trafficFactor));
          }
        } catch (e) {
          const dLat = h.coords.lat - userLoc.lat, dLng = h.coords.lng - userLoc.lng;
          newEtas[h.id] = Math.max(2, Math.round(Math.sqrt(dLat*dLat + dLng*dLng) * 1200));
        }
      }));
      setRoadEtas(newEtas);
    };
    fetchRealEtas();
  }, [userLoc, hospitals]);
  useEffect(()=>{
    if(step==="en_route"&&selectedHosp?.name==="Kasturba Hospital"&&triage&&liveWards&&!rerouteHandled.current){
      const targetWard=liveWards.find(w=>w.name===triage.dept||w.name.includes(triage.dept)||triage.dept.includes(w.name.split(" ")[0]));
      if(targetWard){const ratio=targetWard.occ/targetWard.beds;if(ratio>0.85){setShowRerouteAlert(true);}}
    }
  },[liveWards,step,selectedHosp,triage]);
  useEffect(()=>{
    socket.on("queue_update",(queue)=>{if(myId){const me=queue.find(p=>p.id===myId);if(me)setLiveData(me);}});
    return()=>socket.off("queue_update");
  },[myId]);
  useEffect(()=>{
    setTimeout(()=>{setTriage(TriageService.classify(initialSymptoms));setStep("results");},1800);
  },[initialSymptoms]);
  const startJourney = async (hospital, transportMode, phoneNum) => {
    if (!userLoc) {
      alert("A highly accurate GPS signal is required to dispatch transport. Please ensure location services are enabled and you are outdoors.");
      return;
    }
    setSelectedHosp(hospital);
    setStep("en_route"); 
    const initializeTracking=async(startLat,startLng)=>{
      try{
        let routeCoords=[];
        let steps=[];
        try{
          const osrmRes=await fetch(`https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${hospital.coords.lng},${hospital.coords.lat}?overview=full&geometries=geojson&steps=true&annotations=false`);
          const osrmData=await osrmRes.json();
          if(osrmData.routes&&osrmData.routes[0]){
            routeCoords=osrmData.routes[0].geometry.coordinates;
            const legs=osrmData.routes[0].legs||[];
            steps=legs.flatMap(leg=>(leg.steps||[]).map(s=>({
              instruction: s.maneuver?.instruction || formatManeuver(s.maneuver, s.name),
              distance: s.distance,
              duration: s.duration,
              name: s.name||"",
            }))).filter(s=>s.instruction);
            setNavInstructions(steps);
            setCurrentStep(0);
          }
        }catch(e){}
        const severityClass = triage.priority===1?"critical":triage.priority===2?"urgent":"stable";
        const res=await fetch("http://localhost:5000/api/triage",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({name:"Live Local User",desc:initialSymptoms.substring(0,40)+"...",dept:triage.dept,severityClass,priority:triage.priority,destName:hospital.name,destLat:hospital.coords.lat,destLng:hospital.coords.lng,lat:startLat,lng:startLng,route:routeCoords,transport:transportMode,phone:phoneNum})
        });
        const data=await res.json();setMyId(data.id);
        if("geolocation" in navigator){
          watchId.current=navigator.geolocation.watchPosition(
            pos=>fetch("http://localhost:5000/api/update_location",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:data.id,lat:pos.coords.latitude,lng:pos.coords.longitude})}).catch(()=>{}),
            err=>console.warn("GPS..."),
            {enableHighAccuracy:true,maximumAge:0,timeout:5000}
          );
        }
      }catch(err){}
    };
    initializeTracking(userLoc.lat,userLoc.lng);
  };
  const formatManeuver=(maneuver,streetName)=>{
    if(!maneuver) return null;
    const type=maneuver.type||"";
    const mod=maneuver.modifier||"";
    const street=streetName?" onto "+streetName:"";
    if(type==="depart") return `Head ${mod||"forward"}${street}`;
    if(type==="arrive") return "Arrive at destination";
    if(type==="turn") return `Turn ${mod}${street}`;
    if(type==="new name") return `Continue${street}`;
    if(type==="continue") return `Continue ${mod||"straight"}${street}`;
    if(type==="fork") return `Keep ${mod} at the fork${street}`;
    if(type==="merge") return `Merge ${mod}${street}`;
    if(type==="roundabout"||type==="rotary") return `Enter roundabout, take ${maneuver.exit||"the"} exit${street}`;
    return `${type.replace(/-/g," ")} ${mod}${street}`.trim();
  };
  const handleReroute=async()=>{
    rerouteHandled.current=true;
    const backupHosp=hospitals.find(h=>h.name==="Chinmayi Hospital");
    setShowRerouteAlert(false);setSelectedHosp(backupHosp);
    let newRoute=[];
    if(liveData&&liveData.lat){
      try{
        const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${liveData.lng},${liveData.lat};${backupHosp.coords.lng},${backupHosp.coords.lat}?geometries=geojson&steps=true`);
        const d=await r.json();
        if(d.routes&&d.routes[0]){
          newRoute=d.routes[0].geometry.coordinates;
          const steps=(d.routes[0].legs||[]).flatMap(leg=>(leg.steps||[]).map(s=>({
            instruction:formatManeuver(s.maneuver,s.name),distance:s.distance,name:s.name||""
          }))).filter(s=>s.instruction);
          setNavInstructions(steps);setCurrentStep(0);
        }
      }catch(e){}
    }
    await fetch("http://localhost:5000/api/reroute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:myId,newDestName:backupHosp.name,newLat:backupHosp.coords.lat,newLng:backupHosp.coords.lng,newRoute})});
  };
  const handleDismissReroute=()=>{
    rerouteHandled.current=true;
    setShowRerouteAlert(false);
  };
  if(step==="analyzing") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"var(--navy)",gap:24,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(15,180,122,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(15,180,122,0.03) 1px,transparent 1px)",backgroundSize:"60px 60px",pointerEvents:"none"}}/>
      <div style={{animation:"glowPulse 2s ease-in-out infinite"}}><LogoMark size={72} animated dark={dark}/></div>
      <div style={{textAlign:"center",animation:"fadeUp 0.6s ease 0.3s both"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:28,marginBottom:10}}>Analysing your case</h2>
        <p style={{color:"var(--text-dim)",fontSize:14}}>Evaluating hospitals · Computing road-accurate ETAs</p>
      </div>
      <div style={{display:"flex",gap:6,marginTop:8}}>
        {["AI Triage","Road ETAs","Capacity Check"].map((s,i)=>(
          <div key={i} style={{background:"rgba(15,180,122,0.1)",border:"1px solid rgba(15,180,122,0.2)",borderRadius:99,padding:"4px 12px",fontSize:11,color:"#0FB47A",fontWeight:600,animation:`fadeUp 0.5s ease ${0.5+i*0.15}s both`}}>{s}</div>
        ))}
      </div>
    </div>
  );
if(step==="en_route") return (
    <div style={{height:"100dvh", overflow:"hidden", background:"var(--navy)", display:"flex", flexDirection:"column", position:"relative"}}>
      {}
      {showRerouteAlert&&(()=>{
        const ward=liveWards?.find(w=>w.name===triage?.dept||w.name.includes(triage?.dept||"")||triage?.dept?.includes(w.name.split(" ")[0]));
        const satWait=WaitTimeService.saturationWait(ward);
        const backupWait=WaitTimeService.calcWait(0.48,"Emergency"); 
        return (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(6px)"}}>
          <div style={{background:"var(--navy-card)",padding:30,borderRadius:18,maxWidth:420,width:"100%",border:"1.5px solid rgba(239,68,68,0.3)",boxShadow:"0 0 60px rgba(239,68,68,0.12)",animation:"scaleIn 0.3s ease"}}>
            {}
            <div style={{width:48,height:48,background:"rgba(239,68,68,0.1)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L1 21h22L12 2z" fill="rgba(239,68,68,0.2)" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round"/>
                <line x1="12" y1="9" x2="12" y2="14" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="17" r="1" fill="#ef4444"/>
              </svg>
            </div>
            <h2 style={{color:"#ef4444",fontWeight:700,marginBottom:8,fontSize:17,letterSpacing:"-0.3px"}}>Destination at Capacity</h2>
            <p style={{color:"var(--text-dim)",marginBottom:16,lineHeight:1.65,fontSize:13}}>
              <b style={{color:"var(--text)"}}>{selectedHosp?.name}</b> — {triage?.dept} is saturated.<br/>
              Current estimated wait based on live occupancy:
            </p>
            {}
            <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",padding:"12px 16px",borderRadius:10,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,color:"rgba(239,68,68,0.7)",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Est. Wait · {selectedHosp?.name}</div>
                <div style={{fontSize:22,fontWeight:800,color:"#ef4444"}}>{satWait} min</div>
              </div>
              <div style={{fontSize:11,color:"rgba(239,68,68,0.6)",textAlign:"right"}}>
                <div>Occupancy: {ward?Math.round((ward.occ/ward.beds)*100):92}%</div>
                <div style={{marginTop:2}}>Based on live capacity data</div>
              </div>
            </div>
            {}
            <div style={{background:"rgba(15,180,122,0.07)",border:"1px solid rgba(15,180,122,0.2)",padding:"12px 16px",borderRadius:10,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,color:"#0FB47A",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:3}}>Recommended · Chinmayi Hospital</div>
                <div style={{fontSize:22,fontWeight:800,color:"#0FB47A"}}>{backupWait} min</div>
              </div>
              <div style={{fontSize:11,color:"rgba(15,180,122,0.7)",textAlign:"right"}}>
                <div>Occupancy: ~48%</div>
                <div style={{marginTop:2}}>Capacity available now</div>
              </div>
            </div>
            <button onClick={handleReroute} style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,#ef4444,#991b1b)",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,fontFamily:"'Outfit',sans-serif",letterSpacing:"-0.2px"}}>Reroute to Chinmayi Hospital</button>
            <button onClick={handleDismissReroute} style={{width:"100%",padding:"11px",background:"transparent",color:"var(--text-muted)",border:"1px solid var(--border)",borderRadius:10,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Continue to original destination</button>
          </div>
        </div>
        );
      })()}
      {}
      <div style={{position:"absolute",inset:0,zIndex:1}}>
        {liveData&&liveData.lat?(
          <MapContainer center={[liveData.lat,liveData.lng]} zoom={17} style={{height:'100%',width:'100%'}} zoomControl={false}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap"/>
            <AutoNavTracker centerPos={[liveData.lat,liveData.lng]} navInstructions={navInstructions} currentStep={currentStep} setCurrentStep={setCurrentStep}/>
            <Marker position={[selectedHosp.coords.lat,selectedHosp.coords.lng]} icon={hospitalIcon}/>
            {liveData.route&&<Polyline positions={liveData.route.map(c=>[c[1],c[0]])} color="#0FB47A" weight={5} opacity={0.92}/>}
            <Marker position={[liveData.lat,liveData.lng]} icon={navTriangleIcon}/>
          </MapContainer>
        ):(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12,background:"var(--navy)"}}>
            <Spinner size={32}/>
            <span style={{color:"var(--text-dim)",fontWeight:600,fontSize:14}}>Acquiring GPS signal</span>
          </div>
        )}
      </div>
      {}
      <div style={{position:"relative",zIndex:10,pointerEvents:"none",display:"flex",flexDirection:"column",height:"100%",justifyContent:"space-between",padding:"16px 14px 20px 14px",gap:10}}>
        {}
        <div style={{background:dark?"rgba(7,17,31,0.92)":"rgba(255,255,255,0.96)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:16,padding:"11px 16px",display:"flex",alignItems:"center",gap:14,border:"1px solid var(--border)",pointerEvents:"all",boxShadow:"0 2px 20px rgba(0,0,0,0.18)"}}>
          <div style={{width:34,height:34,background:"rgba(15,180,122,0.15)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="14" rx="3.5" stroke="#0FB47A" strokeWidth="1.4"/>
              <rect x="6.5" y="3.5" width="3" height="9" rx="1" fill="#0FB47A"/>
              <rect x="3.5" y="6.5" width="9" height="3" rx="1" fill="#0FB47A"/>
            </svg>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase"}}>En Route To</div>
            <div style={{fontWeight:700,fontSize:14,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedHosp?.name}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:26,fontWeight:800,color:"var(--text)",lineHeight:1}}>{liveData?.eta||"--"}</div>
            <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>min ETA</div>
          </div>
        </div>
        {}
        {navInstructions.length>0&&(
          <div style={{background:dark?"rgba(7,17,31,0.92)":"rgba(255,255,255,0.96)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:16,border:"1px solid var(--border)",overflow:"hidden",pointerEvents:"all",boxShadow:"0 2px 20px rgba(0,0,0,0.12)"}}>
            <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:38,height:38,background:"linear-gradient(135deg,rgba(29,111,229,0.2),rgba(15,180,122,0.2))",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <NavDirectionIcon instruction={navInstructions[currentStep]?.instruction||""}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text)",lineHeight:1.35}}>{navInstructions[currentStep]?.instruction||"Follow the route"}</div>
                {navInstructions[currentStep]?.name&&<div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{navInstructions[currentStep].name}</div>}
              </div>
              {navInstructions[currentStep]?.distance>0&&(
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:"#0FB47A",lineHeight:1}}>
                    {navInstructions[currentStep].distance>=1000
                      ?`${(navInstructions[currentStep].distance/1000).toFixed(1)}`
                      :`${Math.round(navInstructions[currentStep].distance)}`}
                  </div>
                  <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase"}}>
                    {navInstructions[currentStep].distance>=1000?"km":"m"}
                  </div>
                </div>
              )}
            </div>
            {}
            <div style={{padding:"6px 14px 10px",display:"flex",alignItems:"center",gap:6}}>
              <div style={{display:"flex",gap:3,flex:1}}>
                {navInstructions.slice(0,Math.min(navInstructions.length,12)).map((_,i)=>(
                  <div key={i} style={{height:3,flex:1,borderRadius:99,background:i<=currentStep?"#0FB47A":"rgba(128,128,128,0.2)",transition:"background 0.3s"}}/>
                ))}
              </div>
              <span style={{fontSize:10,color:"var(--text-muted)",flexShrink:0,marginLeft:8}}>{currentStep+1}/{navInstructions.length}</span>
            </div>
          </div>
        )}
        <div style={{flex:1}}/>
        {}
        <div style={{pointerEvents:"all"}}>
          <button onClick={async()=>{
            if(watchId.current) navigator.geolocation.clearWatch(watchId.current);
            if(myId){
              try{await fetch("http://localhost:5000/api/remove_patient",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:myId})});}catch(e){}
            }
            onBack();
          }}
            style={{width:"100%",padding:"15px",borderRadius:14,border:"1px solid rgba(239,68,68,0.35)",background:dark?"rgba(15,5,5,0.82)":"rgba(255,245,245,0.94)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",cursor:"pointer",fontWeight:700,color:"#ef4444",fontFamily:"'Outfit',sans-serif",fontSize:14,boxShadow:"0 2px 16px rgba(239,68,68,0.12)"}}>
            Cancel Journey
          </button>
        </div>
      </div>
    </div>
  );
  const urgencyInfo = triage ? CFG.URGENCY[triage.urgency] : null;
  return (
    <div style={{minHeight:"100vh",padding:"32px clamp(16px,4vw,24px)",background:"var(--navy)",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{maxWidth:700,width:"100%"}}>
        {}
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:"var(--text-muted)",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:14,fontWeight:600,marginBottom:24,padding:0}}>
          ← Back
        </button>
        {}
        {triage&&(
          <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:16,padding:24,marginBottom:24,animation:"fadeUp 0.5s ease both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",marginBottom:6}}>AI Triage Assessment</div>
                <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:24,marginBottom:4}}>
                  {triage.dept} <span style={{fontStyle:"italic",color:"#0FB47A"}}>Department</span>
                </h2>
              </div>
              {urgencyInfo&&(
                <div style={{background:`${urgencyInfo.color}18`,border:`1px solid ${urgencyInfo.color}44`,borderRadius:99,padding:"6px 16px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:urgencyInfo.color,boxShadow:`0 0 8px ${urgencyInfo.color}`}}/>
                  <span style={{color:urgencyInfo.color,fontWeight:700,fontSize:12,letterSpacing:"0.5px"}}>{urgencyInfo.label}</span>
                </div>
              )}
            </div>
            <div style={{marginTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text-muted)",marginBottom:8,alignItems:"center"}}>
                <span>Priority Level</span>
                {triage&&PriorityColor[triage.priority]&&(
                  <span style={{background:PriorityColor[triage.priority].bg,border:`1px solid ${PriorityColor[triage.priority].border}`,color:PriorityColor[triage.priority].text,fontSize:11,fontWeight:800,padding:"3px 12px",borderRadius:99}}>
                    {PriorityColor[triage.priority].label}
                  </span>
                )}
              </div>
              <div style={{display:"flex",gap:6}}>
                {}
                {[1,2,3].map(n=>{
                  const filled = n <= (4 - triage.priority); 
                  const col = n===3?"#ef4444":n===2?"#f59e0b":"#0FB47A";
                  return <div key={n} style={{flex:1,height:8,borderRadius:99,background:filled?col:"rgba(128,128,128,0.12)",transition:"background 0.4s",boxShadow:filled?`0 0 6px ${col}55`:""}}/>
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text-muted)",marginTop:4}}>
                <span>Low</span><span>Medium</span><span style={{color:triage.priority===1?"#ef4444":"var(--text-muted)"}}>High</span>
              </div>
            </div>
          </div>
        )}
        <h3 style={{fontWeight:700,fontSize:13,marginBottom:16,color:"var(--text-dim)",letterSpacing:"0.5px",textTransform:"uppercase"}}>Available Facilities</h3>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {hospitals.map(h=>{
            const isMatch=h.depts.includes(triage?.dept);
            const isKasturba=h.name==="Kasturba Hospital";
            const waitTime=WaitTimeService.forHospital(h,triage?.dept||"Emergency",liveWards,isKasturba);
            const realEta=roadEtas[h.id]||"--";
            const score=isKasturba?98:(isMatch?Math.max(10,85-waitTime*0.5):35);
            return {...h,waitTime,distance:realEta,score};
          }).sort((a,b)=>b.score-a.score).map((h,index)=>{
            const isBest=index===0;
            const capPct=Math.round((h.occ/h.beds)*100);
            const waitColor=h.waitTime>60?"#ef4444":h.waitTime>30?"#f59e0b":"#0FB47A";
            return (
              <div key={h.id} style={{background:"var(--navy-card)",border:`1.5px solid ${isBest?"rgba(15,180,122,0.3)":"var(--border)"}`,borderRadius:16,padding:20,animation:`fadeUp 0.5s ease ${index*0.08}s both`,boxShadow:isBest?"0 0 30px rgba(15,180,122,0.08)":"none",transition:"border-color 0.2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
                      <span style={{fontWeight:800,fontSize:16,color:"var(--text)"}}>{h.name}</span>
                      {isBest&&<span style={{background:"linear-gradient(135deg,#1D6FE5,#0FB47A)",color:"white",padding:"2px 10px",borderRadius:99,fontSize:9,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase"}}>Best Match</span>}
                      <span style={{fontSize:12,color:"var(--text-muted)"}}>· {h.area}</span>
                    </div>
                    <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:12}}>
                      {[
                        {l:"Drive",v:gpsStatus==="denied"?<span style={{color:"#ef4444"}}>GPS off</span>:`${h.distance} min`},
                        {l:"Est. Wait",v:<span style={{color:waitColor,fontWeight:700}}>{h.waitTime} min</span>,hint:"Based on current occupancy"},
                        {l:"Match",v:`${Math.round(h.score)}%`},
                      ].map(({l,v,hint},i)=>(
                        <div key={i} style={{fontSize:13}}>
                          <span style={{color:"var(--text-muted)",fontWeight:500}}>{l}: </span>
                          <span style={{fontWeight:700,color:"var(--text)"}}>{v}</span>
                          {hint&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:1}}>{hint}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{marginBottom:0}}>
                      <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>Capacity — {capPct}%</div>
                      <Bar v={capPct} h={4}/>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
                    <button onClick={()=>setActionModal({h,type:'ambulance'})} style={{padding:"10px 18px",background:"linear-gradient(135deg,#1D6FE5,#0FB47A)",color:"white",border:"none",borderRadius:9,fontWeight:700,cursor:"pointer",fontSize:13,whiteSpace:"nowrap",fontFamily:"'Outfit',sans-serif",boxShadow:"0 4px 16px rgba(15,180,122,0.25)"}}>
                      Ambulance
                    </button>
                    <button onClick={()=>setActionModal({h,type:'self'})} style={{padding:"10px 18px",background:"rgba(15,180,122,0.1)",color:"#0FB47A",border:"1px solid rgba(15,180,122,0.3)",borderRadius:9,fontWeight:700,cursor:"pointer",fontSize:13,whiteSpace:"nowrap",fontFamily:"'Outfit',sans-serif"}}>
                      Self-Drive
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {}
        {actionModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(6px)"}}>
            <div style={{background:"var(--navy-card)",padding:30,borderRadius:18,maxWidth:400,width:"100%",border:"1px solid var(--border-hi)",boxShadow:"0 24px 64px rgba(0,0,0,0.5)",animation:"scaleIn 0.25s ease"}}>
              {actionModal.type==='ambulance'?(
                <div style={{textAlign:"center"}}>
                  <div style={{width:52,height:52,background:"rgba(29,111,229,0.12)",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
                    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                      <rect x="2" y="8" width="18" height="12" rx="3" stroke="#1D6FE5" strokeWidth="1.8"/>
                      <path d="M20 13h3l1 3v2h-4v-5z" stroke="#1D6FE5" strokeWidth="1.8" strokeLinejoin="round"/>
                      <circle cx="6" cy="21" r="2" stroke="#1D6FE5" strokeWidth="1.8"/>
                      <circle cx="18" cy="21" r="2" stroke="#1D6FE5" strokeWidth="1.8"/>
                      <path d="M9 12v4M7 14h4" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:22,marginBottom:10,color:"var(--text)"}}>Dispatch Ambulance</h2>
                  <p style={{color:"var(--text-dim)",marginBottom:20,fontSize:14,lineHeight:1.6}}>Contact the hospital emergency line to dispatch a unit to your GPS location:</p>
                  <div style={{fontSize:24,fontWeight:800,color:"#0FB47A",marginBottom:24,background:"rgba(15,180,122,0.1)",border:"1px solid rgba(15,180,122,0.2)",padding:"14px",borderRadius:12}}>{actionModal.h.phone}</div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setActionModal(null)} style={{flex:1,padding:"12px",background:"transparent",border:"1px solid var(--border)",borderRadius:9,fontWeight:700,cursor:"pointer",color:"var(--text-muted)",fontFamily:"'Outfit',sans-serif"}}>Cancel</button>
                    <button onClick={()=>{startJourney(actionModal.h,'ambulance',actionModal.h.phone);setActionModal(null);}} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#1D6FE5,#0FB47A)",color:"white",border:"none",borderRadius:9,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Called — Track Journey</button>
                  </div>
                </div>
              ):(
                <div>
                  <div style={{width:52,height:52,background:"rgba(15,180,122,0.12)",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
                    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                      <rect x="3" y="10" width="20" height="12" rx="3" stroke="#0FB47A" strokeWidth="1.8"/>
                      <path d="M8 10V7a5 5 0 0 1 10 0v3" stroke="#0FB47A" strokeWidth="1.8" strokeLinecap="round"/>
                      <circle cx="9" cy="16" r="2" stroke="#0FB47A" strokeWidth="1.8"/>
                      <circle cx="17" cy="16" r="2" stroke="#0FB47A" strokeWidth="1.8"/>
                    </svg>
                  </div>
                  <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:22,marginBottom:8,textAlign:"center",color:"var(--text)"}}>Self-Drive Check-in</h2>
                  <p style={{color:"var(--text-dim)",marginBottom:20,fontSize:14,lineHeight:1.6,textAlign:"center"}}>Enter your contact number so <b style={{color:"var(--text)"}}>{actionModal.h.name}</b> can prepare for your arrival.</p>
                  <input type="tel" value={userPhone} onChange={e=>setUserPhone(e.target.value)} placeholder="Phone Number"
                    style={{width:"100%",padding:"14px",border:"1.5px solid var(--border-hi)",borderRadius:9,fontSize:15,background:"rgba(255,255,255,0.04)",color:"var(--text)",fontWeight:600,marginBottom:20}}/>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={()=>setActionModal(null)} style={{flex:1,padding:"12px",background:"transparent",border:"1px solid var(--border)",borderRadius:9,fontWeight:700,cursor:"pointer",color:"var(--text-muted)",fontFamily:"'Outfit',sans-serif"}}>Cancel</button>
                    <button onClick={()=>{startJourney(actionModal.h,'self',userPhone);setActionModal(null);}} disabled={userPhone.length<5} style={{flex:2,padding:"12px",background:userPhone.length>=5?"linear-gradient(135deg,#1D6FE5,#0FB47A)":"rgba(255,255,255,0.06)",color:userPhone.length>=5?"white":"var(--text-muted)",border:"none",borderRadius:9,fontWeight:700,cursor:userPhone.length>=5?"pointer":"default",fontFamily:"'Outfit',sans-serif"}}>Start Navigation</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
const AdminLogin = ({onSuccess,onBack,dark,onToggleDark}) => {
  const [u,setU]=useState(""),p_state=useState(""),p=p_state[0],setP=p_state[1];
  const [err,setErr]=useState(""),loading=useState(false),setL=loading[1],isLoading=loading[0];
  const submit=async()=>{
    setL(true);setErr("");
    await new Promise(r=>setTimeout(r,800));
    if(u==="admin"&&p==="admin") onSuccess();
    else setErr("Invalid credentials. Use admin / admin for this prototype.");
    setL(false);
  };
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--navy)",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${dark?"rgba(15,180,122,0.03)":"rgba(15,180,122,0.05)"} 1px,transparent 1px),linear-gradient(90deg,${dark?"rgba(15,180,122,0.03)":"rgba(15,180,122,0.05)"} 1px,transparent 1px)`,backgroundSize:"60px 60px",pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:700,height:700,background:"radial-gradient(circle,rgba(29,111,229,0.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
      {}
      <div style={{position:"absolute",top:16,right:16,zIndex:10}}>
        <DarkToggle dark={dark} onToggle={onToggleDark}/>
      </div>
      <div style={{background:"var(--navy-card)",border:"1px solid var(--border-hi)",borderRadius:20,padding:"44px 40px",maxWidth:400,width:"100%",boxShadow:`0 32px 80px ${dark?"rgba(0,0,0,0.5)":"rgba(0,0,0,0.1)"}`,animation:"scaleIn 0.4s ease",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{animation:"glowPulse 3s ease-in-out infinite",display:"inline-block",marginBottom:16}}>
            <LogoMark size={56} animated dark={dark}/>
          </div>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:24,marginBottom:6,color:"var(--text)"}}>Hospital Portal</h2>
        </div>
        {[["Username","text",u,setU,""],["Password","password",p,setP,""]].map(([lbl,type,val,set,ph])=>(
          <div key={lbl} style={{marginBottom:16}}>
            <label style={{display:"block",fontWeight:700,fontSize:11,marginBottom:7,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"1px"}}>{lbl}</label>
            <input type={type} value={val} onChange={e=>set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={ph}
              style={{width:"100%",padding:"12px 14px",border:"1.5px solid var(--border)",borderRadius:9,fontSize:14,background:"rgba(255,255,255,0.04)",color:"var(--text)",fontFamily:"'Outfit',sans-serif",transition:"border-color 0.2s"}}
              onFocus={e=>e.currentTarget.style.borderColor="rgba(15,180,122,0.4)"}
              onBlur={e=>e.currentTarget.style.borderColor="var(--border)"}
            />
          </div>
        ))}
        {err&&<div style={{color:"#ef4444",fontSize:12,marginBottom:14,padding:"10px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8,border:"1px solid rgba(239,68,68,0.2)"}}>{err}</div>}
        <button onClick={submit} disabled={isLoading} style={{width:"100%",padding:"13px",borderRadius:9,border:"none",background:isLoading?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#1D6FE5,#0FB47A)",color:isLoading?"var(--text-muted)":"#fff",fontWeight:800,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12,cursor:isLoading?"default":"pointer",fontFamily:"'Outfit',sans-serif",boxShadow:isLoading?"none":"0 8px 24px rgba(15,180,122,0.25)"}}>
          {isLoading&&<Spinner size={16} color="#fff"/>}{isLoading?"Authenticating…":"Login to Dashboard"}
        </button>
        <button onClick={onBack} style={{width:"100%",padding:"11px",borderRadius:9,border:"1px solid var(--border)",background:"transparent",fontSize:13,color:"var(--text-muted)",cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>← Back to Home</button>
      </div>
    </div>
  );
};
const Admin = ({wards,setWards,onLogout,dark,onToggleDark}) => {
  const [nav,setNav]=useState("dashboard");
  const [alert,setAlert]=useState(true);
  const [feed,setFeed]=useState([]);
  const [now,setNow]=useState(new Date());
  const spark=useRef([75,78,80,77,82,88,90,92,94,90,85,88]);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const handleRemovePatient=async(patientId)=>{
    try{await fetch("http://localhost:5000/api/remove_patient",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:patientId})});}catch(err){}
  };
  const updateWardCapacity=(wardId,newOcc)=>{
    const val=parseInt(newOcc,10),safeVal=isNaN(val)?0:val;
    setWards(prev=>prev.map(w=>{
      if(w.id===wardId){const ratio=safeVal/w.beds;let status="accepting";if(ratio>0.85)status="saturated";else if(ratio>0.65)status="moderate";return {...w,occ:safeVal,status};}
      return w;
    }));
  };
  useEffect(()=>{
    const iv=setInterval(()=>setNow(new Date()),1000);
    socket.on("queue_update",updatedQueue=>{setFeed(updatedQueue.filter(p=>p.destName==="Kasturba Hospital"));});
    return()=>{clearInterval(iv);};
  },[]);
  const totB=wards.reduce((a,w)=>a+w.beds,0),totO=wards.reduce((a,w)=>a+w.occ,0);
  const sysP=Math.round((totO/totB)*100);
  const icuWard=wards.find(w=>w.id==="w2");
  const nearC=wards.filter(w=>(w.occ/w.beds)>.85).length;
  const criticalSubjects=feed.filter(p=>(p.priority?Number(p.priority)===1:p.sev==="critical")).length;
  const NAVS=[
    {id:"dashboard",icon:"▦",label:"Command Center",sec:"Overview"},
    {id:"wards",icon:"▣",label:"Departments",sec:"Operations"},
    {id:"triage",icon:"◈",label:"Triage Queue",sec:null},
    {id:"predict",icon:"◎",label:"Predictive Load",sec:"Intelligence"},
  ];
  const renderPage=()=>{
    switch(nav){
      case "dashboard": return <DashMain wards={wards} feed={feed} alert={alert} setAlert={setAlert} sysP={sysP} icuFree={icuWard.beds-icuWard.occ} nearC={nearC} criticalSubjects={criticalSubjects} spark={spark.current} updateWardCapacity={updateWardCapacity} onRemovePatient={handleRemovePatient}/>;
      case "wards":     return <WardsPage wards={wards}/>;
      case "triage":    return <TriagePage feed={feed} onRemovePatient={handleRemovePatient}/>;
      case "predict":   return <PredPage wards={wards}/>;
      default: return null;
    }
  };
  const SidebarContent = () => (
    <>
      <div style={{padding:"22px 18px 18px",borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <LogoMark size={32} dark={dark}/>
          <Wordmark size={18} dark={dark}/>
        </div>
      </div>
      <nav style={{padding:"12px 10px",flex:1}}>
        {NAVS.map(item=>(
          <div key={item.id}>
            {item.sec&&<div style={{fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"rgba(128,128,128,0.4)",padding:"14px 8px 5px"}}>{item.sec}</div>}
            <button onClick={()=>{setNav(item.id);setMobileNavOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:9,border:"none",background:nav===item.id?"rgba(15,180,122,0.15)":"transparent",color:nav===item.id?"#0FB47A":"var(--text-dim)",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",textAlign:"left",borderLeft:nav===item.id?"2px solid #0FB47A":"2px solid transparent",fontFamily:"'Outfit',sans-serif"}}>
              <span style={{fontSize:14}}>{item.icon}</span>{item.label}
            </button>
          </div>
        ))}
      </nav>
      <div style={{padding:"14px 16px",borderTop:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#1D6FE5,#0FB47A)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",fontSize:13}}>P</div>
          <div><div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>Dr. Priya R.</div><div style={{fontSize:10,color:"var(--text-muted)"}}>Kasturba Hospital</div></div>
        </div>
        <button onClick={onLogout} style={{width:"100%",padding:"8px",borderRadius:7,border:"1px solid rgba(239,68,68,0.2)",background:"rgba(239,68,68,0.08)",color:"#f87171",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Sign Out</button>
      </div>
    </>
  );
  return (
    <div style={{display:"flex",minHeight:"100vh",background:"var(--navy)"}}>
      {}
      <aside className="admin-sidebar" style={{width:"var(--sw)",background:"var(--navy-mid)",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:100,overflowY:"auto",borderRight:"1px solid var(--border)"}}>
        <SidebarContent/>
      </aside>
      {}
      {mobileNavOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:200,display:"flex"}}>
          <div style={{width:260,background:"var(--navy-mid)",display:"flex",flexDirection:"column",borderRight:"1px solid var(--border)",overflowY:"auto"}}><SidebarContent/></div>
          <div style={{flex:1,background:"rgba(0,0,0,0.6)"}} onClick={()=>setMobileNavOpen(false)}/>
        </div>
      )}
      <main className="admin-main" style={{marginLeft:"var(--sw)",flex:1,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        <header style={{background:"var(--navy-mid)",borderBottom:"1px solid var(--border)",padding:"0 20px",height:58,display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,zIndex:50}}>
          <button onClick={()=>setMobileNavOpen(true)} style={{display:"none",background:"transparent",border:"none",color:"var(--text-dim)",fontSize:20,cursor:"pointer",padding:4,fontFamily:"'Outfit',sans-serif"}}
            className="mobile-menu-btn"></button>
          <div style={{flex:1,fontWeight:800,fontSize:15,color:"var(--text)"}}>{NAVS.find(n=>n.id===nav)?.label} <span style={{color:"var(--text-muted)",fontWeight:400,fontSize:12,marginLeft:6}}>· Kasturba Hospital</span></div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#0FB47A",animation:"pd 1.8s infinite"}}/>
              <span style={{fontSize:11,color:"#0FB47A",fontWeight:700}}>LIVE</span>
            </div>
            <span style={{fontSize:11,color:"var(--text-muted)"}}>{now.toLocaleTimeString()}</span>
            {nearC>0&&<div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:99,padding:"4px 12px"}}>
              <span style={{fontSize:10,color:"#ef4444",fontWeight:700}}> {nearC} Saturated</span>
            </div>}
            <DarkToggle dark={dark} onToggle={onToggleDark}/>
          </div>
        </header>
        <style>{`.mobile-menu-btn { display: none !important; } @media(max-width:768px){ .mobile-menu-btn { display: flex !important; } }`}</style>
        <div style={{padding:"20px clamp(12px,3vw,24px)",flex:1}}>{renderPage()}</div>
      </main>
    </div>
  );
};
const KpiCard = ({bg,icon,label,value,delta,up}) => (
  <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
    <div style={{width:46,height:46,borderRadius:12,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <span style={{fontSize:11,fontWeight:900,color:"inherit",letterSpacing:"-0.5px",opacity:0.8}}>{icon}</span>
    </div>
    <div style={{minWidth:0}}>
      <div style={{fontSize:10,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:3}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,lineHeight:1.1,color:"var(--text)"}}>{value}</div>
      <div style={{fontSize:11,fontWeight:600,color:up?"#0FB47A":"#ef4444",marginTop:2}}>{delta}</div>
    </div>
  </div>
);
const DashMain = ({wards,feed,alert,setAlert,sysP,icuFree,nearC,criticalSubjects,spark,updateWardCapacity,onRemovePatient}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    {alert&&(
      <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <span style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:24,height:24}}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L1 18h18L10 2z" fill="rgba(245,158,11,0.25)" stroke="#f59e0b" strokeWidth="1.6" strokeLinejoin="round"/><line x1="10" y1="8" x2="10" y2="12" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round"/><circle cx="10" cy="15" r="0.8" fill="#f59e0b"/></svg>
          </span>
        <div style={{flex:1}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"#f59e0b"}}>Saturation Warning — ER approaching max capacity</div>
          <div style={{fontSize:11,color:"rgba(245,158,11,0.7)",marginTop:1}}>Auto-routing low-acuity cases to backup facilities</div>
        </div>
        <button onClick={()=>setAlert(false)} style={{background:"none",border:"none",color:"rgba(245,158,11,0.6)",fontSize:16,cursor:"pointer",flexShrink:0,lineHeight:1}}>×</button>
      </div>
    )}
    <div className="dash-kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
      <KpiCard bg="rgba(29,111,229,0.12)" icon="OCC" label="System Occupancy" value={`${sysP}%`} delta="Based on live ward data" up={true}/>
      <KpiCard bg="rgba(15,180,122,0.12)" icon="ICU" label="Free ICU Beds" value={icuFree} delta={`of ${wards.find(w=>w.id==="w2").beds} total`} up={true}/>
      <KpiCard bg="rgba(245,158,11,0.12)" icon="TEL" label="Incoming Telemetry" value={feed.length} delta="Active data streams" up={true}/>
      <KpiCard bg="rgba(239,68,68,0.12)" icon="P1" label="Critical Subjects" value={criticalSubjects} delta="High priority · Active" up={false}/>
    </div>
    <div className="dash-mid-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
      <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:20}}>
        <div style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>Inbound Radar</div>
          <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>Real-time GPS positions</div>
        </div>
        <LiveRoadMap feed={feed}/>
      </div>
      <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>Triage Queue</div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>AI-classified cases</div>
          </div>
          {feed.filter(c=>(c.priority?Number(c.priority)===1:c.sev==="critical")).length>0&&(
            <span style={{background:"rgba(239,68,68,0.12)",color:"#ef4444",fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:99,border:"1px solid rgba(239,68,68,0.2)"}}>
              {feed.filter(c=>(c.priority?Number(c.priority)===1:c.sev==="critical")).length} Critical
            </span>
          )}
        </div>
        <div style={{maxHeight:260,overflowY:"auto"}}>
          {feed.length===0&&<p style={{color:"var(--text-muted)",fontSize:12,textAlign:"center",padding:24}}>No inbound patients.</p>}
          {feed.map((c,i)=>{
            const pri = c.priority ? Number(c.priority) : (c.sev==="critical"?1:c.sev==="urgent"?2:3);
            const pc = PriorityColor[pri]||PriorityColor[3];
            return (
            <div key={c.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderBottom:i<feed.length-1?"1px solid var(--border)":"none",animation:"slideIn .3s ease"}}>
              <SevDot sev={c.sev} priority={pri}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>#{c.id} · {c.name}</div>
                {c.phone&&<div style={{fontSize:10,color:"#0FB47A",fontWeight:700,marginTop:1}}>Phone Number: {c.phone}</div>}
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.desc}</div>
                <div style={{fontSize:11,color:pc.text,fontWeight:600,marginTop:2}}>{c.dept} · ETA {c.eta}m</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                <span style={{background:pc.bg,color:pc.text,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,border:`1px solid ${pc.border}`,letterSpacing:"0.3px"}}>{pc.short}</span>
                <div style={{fontSize:10,color:"var(--text-muted)"}}>{c.time}</div>
                <button onClick={()=>onRemovePatient(c.id)} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:5,color:"#ef4444",fontSize:10,padding:"2px 7px",cursor:"pointer",fontWeight:600,fontFamily:"'Outfit',sans-serif"}}>×</button>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
    <div className="dash-bot-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:20}}>
        <div style={{fontWeight:700,fontSize:14,color:"var(--text)",marginBottom:16}}>Department Load</div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>{["Ward","Beds","Load","Status"].map(h=><th key={h} style={{fontSize:9.5,fontWeight:700,color:"var(--text-muted)",textAlign:"left",padding:"0 8px 10px",textTransform:"uppercase",letterSpacing:"0.8px"}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {wards.map(w=>{
              const oc=Math.round((w.occ/w.beds)*100);
              return (
                <tr key={w.id}>
                  <td style={{padding:"9px 8px",borderTop:"1px solid var(--border)",fontWeight:600,fontSize:12,color:"var(--text)"}}>{w.name}</td>
                  <td style={{padding:"9px 8px",borderTop:"1px solid var(--border)",fontWeight:700,fontSize:12,color:"var(--text-dim)"}}>{w.occ}/{w.beds}</td>
                  <td style={{padding:"9px 8px",borderTop:"1px solid var(--border)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:72,flexShrink:0}}><Bar v={oc}/></div>
                      <span style={{fontSize:11,fontWeight:700,color:oc>85?"#ef4444":oc>65?"#f59e0b":"#0FB47A"}}>{oc}%</span>
                    </div>
                  </td>
                  <td style={{padding:"9px 8px",borderTop:"1px solid var(--border)"}}><StatusBadge status={w.status}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",animation:"blink 1.2s infinite",flexShrink:0}}/>
          <div style={{fontWeight:700,fontSize:14,color:"#ef4444"}}>Live Capacity Control</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {wards.map(w=>(
            <div key={w.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.03)",padding:"9px 12px",borderRadius:9,border:"1px solid var(--border)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--text)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:8}}>{w.name}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <input type="text" inputMode="numeric" key={w.id+w.occ} defaultValue={w.occ}
                  onBlur={e=>updateWardCapacity(w.id,e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){updateWardCapacity(w.id,e.target.value);e.target.blur();}}}
                  style={{width:46,padding:"6px",borderRadius:7,border:`1.5px solid ${(w.occ/w.beds)>0.85?"rgba(239,68,68,0.4)":"var(--border)"}`,fontSize:13,fontWeight:800,textAlign:"center",background:(w.occ/w.beds)>0.85?"rgba(239,68,68,0.08)":"rgba(255,255,255,0.04)",color:(w.occ/w.beds)>0.85?"#ef4444":"var(--text)",fontFamily:"'Outfit',sans-serif"}}
                />
                <span style={{fontSize:11,color:"var(--text-muted)",fontWeight:600}}>/{w.beds}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
const WardsPage = ({wards}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:26,marginBottom:6,color:"var(--text)"}}>Internal Departments</h2>
    <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:22}}>Kasturba Hospital · Live capacity</p>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {wards.map((w,i)=>{
        const oc=Math.round((w.occ/w.beds)*100);
        const pred=PredictiveService.predict(w);
        return (
          <div key={w.id} style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:22,animation:`fadeUp .4s ease ${i*.07}s both`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontWeight:800,fontSize:16,color:"var(--text)"}}>{w.name}</div>
                <div style={{color:"var(--text-muted)",fontSize:12,marginTop:2}}>Location: Kasturba Hospital</div>
              </div>
              <StatusBadge status={w.status}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
              {[{l:"Occupancy",v:`${oc}%`,bar:oc},{l:"Beds Filled",v:`${w.occ}/${w.beds}`,bar:Math.round((w.occ/w.beds)*100)},{l:"Predicted 60m",v:`${pred.p60}% ${pred.trend==="up"?"↑":"↓"}`,bar:pred.p60}].map((s,j)=>(
                <div key={j} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"12px 14px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:6}}>{s.l}</div>
                  <div style={{fontWeight:800,fontSize:20,marginBottom:8,color:"var(--text)"}}>{s.v}</div>
                  <Bar v={s.bar}/>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
const TriagePage = ({feed,onRemovePatient}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <div>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:26,color:"var(--text)"}}>Live Triage Queue</h2>
        <p style={{color:"var(--text-muted)",fontSize:13,marginTop:2}}>AI-classified incoming cases</p>
      </div>
      <span style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",fontSize:11,fontWeight:700,padding:"5px 14px",borderRadius:99,border:"1px solid rgba(239,68,68,0.2)"}}>
        {feed.filter(c=>(c.priority?Number(c.priority)===1:c.sev==="critical")).length} Critical · Auto-routing active
      </span>
    </div>
    <div style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:20}}>
      {feed.length===0&&<p style={{color:"var(--text-muted)",fontSize:14,textAlign:"center",padding:"32px 0"}}>No inbound patients at this time.</p>}
      {feed.map((c,i)=>{
        const pri = c.priority ? Number(c.priority) : (c.sev==="critical"?1:c.sev==="urgent"?2:3);
        const pc = PriorityColor[pri]||PriorityColor[3];
        return (
        <div key={c.id} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"14px 0",borderBottom:i<feed.length-1?"1px solid var(--border)":"none",animation:"slideIn .3s ease"}}>
          <SevDot sev={c.sev} priority={pri}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13,color:"var(--text)"}}>Case #{c.id} · {c.name}</div>
            {c.phone&&<div style={{fontSize:11,color:"#0FB47A",fontWeight:700,marginTop:2}}>Tel: {c.phone}</div>}
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>{c.desc}</div>
            <div style={{fontSize:12,color:pc.text,fontWeight:700,marginTop:4}}>{c.dept} Ward · ETA {c.eta} min</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
            <span style={{background:pc.bg,color:pc.text,fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:99,border:`1px solid ${pc.border}`}}>{pc.label}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:"var(--text-muted)"}}>{c.time}</span>
              <button onClick={()=>onRemovePatient(c.id)} style={{background:"rgba(239,68,68,0.1)",border:"none",borderRadius:6,color:"#ef4444",fontSize:11,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontFamily:"'Outfit',sans-serif"}}>Remove</button>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  </div>
);
const PredPage = ({wards}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontFamily:"'DM Serif Display',serif",fontWeight:400,fontSize:26,marginBottom:4,color:"var(--text)"}}>Predictive Load Forecast</h2>
    <p style={{color:"var(--text-muted)",marginBottom:22,fontSize:13}}>Moving average model</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
      {wards.map((w,i)=>{
        const pred=PredictiveService.predict(w);
        return (
          <div key={w.id} style={{background:"var(--navy-card)",border:"1px solid var(--border)",borderRadius:14,padding:20,animation:`scaleIn .4s ease ${i*.06}s both`}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:"var(--text)"}}>{w.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              <div style={{background:"rgba(128,128,128,0.06)",borderRadius:9,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px"}}>Now</div>
                <div style={{fontWeight:800,fontSize:24,color:pred.curr>85?"#ef4444":"var(--text)",marginTop:2}}>{pred.curr}%</div>
              </div>
              <div style={{background:pred.p60>85?"rgba(239,68,68,0.08)":"rgba(128,128,128,0.06)",borderRadius:9,padding:"10px 12px",border:pred.p60>85?"1px solid rgba(239,68,68,0.2)":"none"}}>
                <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.8px"}}>60 min</div>
                <div style={{fontWeight:800,fontSize:24,color:pred.p60>85?"#ef4444":"#0FB47A",marginTop:2}}>{pred.p60}%</div>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,marginBottom:8}}>
              <span style={{color:pred.trend==="up"?"#ef4444":"#0FB47A"}}>{pred.trend==="up"?"↑ Rising":"↓ Falling"}</span>
              <span style={{color:"var(--text-muted)"}}>Conf. {Math.round(pred.conf*100)}%</span>
            </div>
            <Bar v={pred.p60}/>
          </div>
        );
      })}
    </div>
  </div>
);
export default function App() {
  const [view,setView]=useState("landing");
  const [initialSymptoms,setInitialSymptoms]=useState("");
  const [dark,setDark]=useState(true);
  const [wards,setWards]=useState(()=>{
    try{const saved=localStorage.getItem("liveHospitalWards");return saved?JSON.parse(saved):mkWards();}
    catch{return mkWards();}
  });
  useEffect(()=>{
    document.title="AeroHealth";
    let link=document.querySelector("link[rel~='icon']");
    if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link);}
    link.href=`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'><path d='M18 108 C28 72,56 42,122 28' stroke='%230FB47A' stroke-width='6' stroke-linecap='round' fill='none'/><polyline points='52,76 60,76 66,58 72,88 78,50 84,76 92,76' stroke='%231D6FE5' stroke-width='5' stroke-linecap='round' stroke-linejoin='round' fill='none'/><circle cx='122' cy='28' r='8' fill='%230FB47A'/></svg>`;
  },[]);
  useEffect(()=>{localStorage.setItem("liveHospitalWards",JSON.stringify(wards));},[wards]);
  useEffect(()=>{
    const handleStorageChange=e=>{if(e.key==="liveHospitalWards"&&e.newValue)setWards(JSON.parse(e.newValue));};
    window.addEventListener("storage",handleStorageChange);
    return()=>window.removeEventListener("storage",handleStorageChange);
  },[]);
  return (
    <>
      <GlobalStyles dark={dark}/>
      {view==="landing"&&<Landing onAnalyse={s=>{setInitialSymptoms(s);setView("patient");}} onAdmin={()=>setView("adminLogin")} dark={dark} onToggleDark={()=>setDark(d=>!d)}/>}
      {view==="patient"&&<PatientFlow initialSymptoms={initialSymptoms} liveWards={wards} onBack={()=>setView("landing")} dark={dark} onToggleDark={()=>setDark(d=>!d)}/>}
      {view==="adminLogin"&&<AdminLogin onSuccess={()=>setView("admin")} onBack={()=>setView("landing")} dark={dark} onToggleDark={()=>setDark(d=>!d)}/>}
      {view==="admin"&&<Admin wards={wards} setWards={setWards} onLogout={()=>setView("landing")} dark={dark} onToggleDark={()=>setDark(d=>!d)}/>}
    </>
  );
}