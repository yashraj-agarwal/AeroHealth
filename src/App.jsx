/**
 * AeroHealth — Intelligent Healthcare Load Balancing
 * ====================================================
 * Prototype with:
 *  - Admin dashboard matching reference design (sidebar, KPIs, map, triage feed, table)
 *  - Patient flow with animated real-time routing map + ambulance animation
 *  - Live telemetry simulation (updates every 3s)
 *  - Semantic triage engine (rule-based, Azure OpenAI-ready)
 *  - Health score engine (weighted, configurable)
 *  - Predictive load model (Azure ML-ready)
 *  - Spatial routing (Haversine + traffic, Azure Maps-ready)
 */

import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  WEIGHTS: { urgencyMatch:0.25, deptAvailability:0.20, occupancyInverse:0.20, predictedLoadInverse:0.15, travelTime:0.15, icuAvailability:0.05 },
  PEAK_HOURS: [8,9,10,17,18,19,20],
  MAX_TRAVEL_MIN: 60,
  TICK_MS: 3000,
  URGENCY: {
    1:{label:"Non-Urgent",color:"#059669",bg:"#ecfdf5"},
    2:{label:"Low",color:"#65a30d",bg:"#f7fee7"},
    3:{label:"Moderate",color:"#d97706",bg:"#fffbeb"},
    4:{label:"High",color:"#e85d4a",bg:"#fff1f0"},
    5:{label:"Critical",color:"#991b1b",bg:"#fff1f0"},
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────
const mkHospitals = () => [
  // avgLosHours: average patient length of stay (hours) — used by 6-variable capacity model (V4)
  // deptBedRatio: fraction of specialist dept beds out of total — capacity pressure proxy (V5)
  {id:"h1",name:"Fortis Cunningham Rd", area:"Langford Town",      coords:{lat:12.9550,lng:77.5855},depts:["Cardiology","Emergency","ICU","Neurology","General Medicine"],beds:380,occ:238,icuT:38,icuO:14,emgT:30,emgO:10,status:"accepting",avgLosHours:28,deptBedRatio:0.45},
  {id:"h2",name:"Narayana Bommasandra", area:"Electronic City",    coords:{lat:12.8305,lng:77.6707},depts:["Cardiology","Cardiac Surgery","Emergency","ICU","Orthopedics"],beds:1000,occ:512,icuT:60,icuO:29,emgT:60,emgO:22,status:"accepting",avgLosHours:32,deptBedRatio:0.55},
  {id:"h3",name:"Apollo Jayanagar",     area:"Jayanagar 4th Block",coords:{lat:12.9252,lng:77.5823},depts:["Neurology","Oncology","Emergency","ICU","General Medicine"],beds:350,occ:273,icuT:28,icuO:22,emgT:25,emgO:16,status:"moderate",avgLosHours:36,deptBedRatio:0.50},
  {id:"h4",name:"Manipal Whitefield",   area:"Whitefield",         coords:{lat:12.9700,lng:77.7500},depts:["General Medicine","Orthopedics","Emergency","Pediatrics"],beds:440,occ:414,icuT:44,icuO:42,emgT:35,emgO:33,status:"saturated",avgLosHours:24,deptBedRatio:0.35},
  {id:"h5",name:"Sakra Premium",        area:"Marathahalli",       coords:{lat:12.9561,lng:77.6966},depts:["Neurology","Cardiology","Emergency","ICU","Ophthalmology"],beds:300,occ:219,icuT:32,icuO:23,emgT:22,emgO:14,status:"moderate",avgLosHours:30,deptBedRatio:0.48},
  {id:"h6",name:"Aster CMI Hebbal",     area:"Hebbal",             coords:{lat:13.0499,lng:77.5979},depts:["Spine Surgery","Neurology","Emergency","ICU","Urology"],beds:350,occ:140,icuT:35,icuO:10,emgT:25,emgO:7,status:"accepting",avgLosHours:22,deptBedRatio:0.42},
];

const INIT_FEED = [
  {id:"BLR-0091",name:"Arjun M., 45",   desc:"Acute Cardiac Distress · Cardiac ICU required",     dest:"Fortis Cunningham Rd",eta:8, sev:"critical",time:"Now"},
  {id:"BLR-0089",name:"Meera K., 32",   desc:"Traumatic Head Injury · Neurosurgery required",      dest:"Narayana Bommasandra",eta:14,sev:"critical",time:"2m ago"},
  {id:"BLR-0088",name:"Ravi S., 60",    desc:"Respiratory Failure · General ICU needed",           dest:"Apollo Jayanagar",    eta:11,sev:"urgent",  time:"5m ago"},
  {id:"BLR-0087",name:"Lakshmi R., 28", desc:"Obstetric Emergency · Labour & Delivery required",   dest:"Sakra Premium",       eta:9, sev:"urgent",  time:"8m ago"},
  {id:"BLR-0086",name:"Deepak A., 40",  desc:"Fractured Tibia · Orthopedic department",            dest:"Fortis Cunningham Rd",eta:12,sev:"stable",  time:"12m ago"},
];

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
    const tm=peak?1.6+Math.random()*0.4:1.1+Math.random()*0.2;
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
    const avgLengthOfStayHours = avgLosHours;

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
    const conf = +(0.82 + Math.random() * 0.12).toFixed(2);

    return { curr, p60, trend, conf };
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
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;width:100%;font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#f0f4f8;color:#1a2636;overflow-x:hidden;}
  #root{min-height:100vh;width:100%;}
  vite-plugin-checker-error-overlay,#vite-error-overlay,[data-vite-dev-id]{display:none!important;}
  :root{
    --bg:#f0f4f8;--sidebar:#0a1628;--card:#fff;--accent:#1d6fe5;--accent2:#0fb47a;
    --warn:#e85d4a;--amber:#f59e0b;--text:#1a2636;--muted:#6b7a8d;--border:#e2e8f0;
    --sw:220px;--r:12px;
    --shsm:0 1px 3px rgba(0,0,0,.06);--shmd:0 4px 16px rgba(0,0,0,.08);--shlg:0 8px 32px rgba(0,0,0,.10);
  }
  button{cursor:pointer;font-family:inherit;}input,textarea{font-family:inherit;}
  ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:var(--border);border-radius:99px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
  @keyframes slideIn{from{opacity:0;transform:translateX(-10px);}to{opacity:1;transform:translateX(0);}}
  @keyframes scaleIn{from{opacity:0;transform:scale(.93);}to{opacity:1;transform:scale(1);}}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes pd{0%,100%{box-shadow:0 0 0 0 rgba(15,180,122,.5);}50%{box-shadow:0 0 0 5px rgba(15,180,122,0);}}
  @keyframes blink{0%,100%{opacity:1;}50%{opacity:.4;}}
  @keyframes toast{from{opacity:0;transform:translateX(60px);}to{opacity:1;transform:translateX(0);}}
`;

// ─────────────────────────────────────────────────────────────────────────────
// TINY SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const Spinner = ({size=20,color="var(--accent)"}) => (
  <div style={{width:size,height:size,border:`2px solid ${color}25`,borderTopColor:color,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
);

const Toast = ({items}) => (
  <div style={{position:"fixed",top:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
    {items.map(t=><div key={t.id} style={{background:t.type==="error"?"var(--warn)":t.type==="warn"?"var(--amber)":"var(--sidebar)",color:"#fff",padding:"11px 18px",borderRadius:10,boxShadow:"var(--shlg)",animation:"toast .3s ease",fontSize:13,fontWeight:600,maxWidth:320}}>{t.msg}</div>)}
  </div>
);

const Bar = ({v,max=100,h=6}) => {
  const p=Math.min(100,(v/max)*100);
  return <div style={{background:"var(--border)",borderRadius:99,height:h,overflow:"hidden"}}><div style={{width:`${p}%`,height:"100%",background:p>85?"var(--warn)":p>65?"var(--amber)":"var(--accent2)",borderRadius:99,transition:"width .6s"}}/></div>;
};

const StatusBadge = ({status}) => {
  const M={accepting:{bg:"#ecfdf5",c:"#059669",l:"Accepting"},moderate:{bg:"#fffbeb",c:"#d97706",l:"Moderate"},saturated:{bg:"#fff1f0",c:"var(--warn)",l:"Saturated"}};
  const s=M[status]||M.accepting;
  return <span style={{background:s.bg,color:s.c,fontSize:10.5,fontWeight:700,padding:"3px 10px",borderRadius:20}}>{s.l}</span>;
};

const Spark = ({data,color="var(--accent)"}) => {
  const max=Math.max(...data,1);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height:60}}>
      {data.map((v,i)=><div key={i} style={{flex:1,background:color,borderRadius:"3px 3px 0 0",opacity:i===data.length-3?1:0.55,height:`${(v/max)*56}px`,minHeight:4,transition:"height .4s"}}/>)}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SVG MAP — patient routing with animated ambulance
// ─────────────────────────────────────────────────────────────────────────────
const RouteMap = ({hospitals,results,patCoords,bestId,step}) => {
  const B={mnLa:12.82,mxLa:13.06,mnLn:77.47,mxLn:77.77};
  const xy=(la,ln)=>({x:((ln-B.mnLn)/(B.mxLn-B.mnLn))*680+20,y:((B.mxLa-la)/(B.mxLa-B.mnLa))*280+20});
  const pt=xy(patCoords.lat,patCoords.lng);
  const bh=hospitals.find(h=>h.id===bestId);
  const bp=bh?xy(bh.coords.lat,bh.coords.lng):null;
  const t=Math.min(1,step/100);
  const ax=bp?pt.x+(bp.x-pt.x)*t:pt.x;
  const ay=bp?pt.y+(bp.y-pt.y)*t:pt.y;
  const pLen=bp?Math.sqrt((bp.x-pt.x)**2+(bp.y-pt.y)**2):0;

  return (
    <div style={{background:"var(--card)",borderRadius:"var(--r)",border:"1px solid var(--border)",overflow:"hidden"}}>
      <div style={{padding:"13px 18px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent2)",animation:"pd 1.8s infinite"}}/>
          <span style={{fontWeight:700,fontSize:14}}>Live Route Map — Bengaluru</span>
        </div>
        <span style={{background:"#eff6ff",color:"var(--accent)",fontSize:10.5,fontWeight:700,padding:"3px 10px",borderRadius:20}}>Simulation Mode</span>
      </div>
      <div style={{padding:8}}>
        <svg width="100%" viewBox="0 0 720 320" style={{display:"block"}}>
          <defs>
            <pattern id="rg" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0L0 0 0 28" fill="none" stroke="rgba(29,111,229,.07)" strokeWidth=".7"/>
            </pattern>
          </defs>
          <rect width="720" height="320" fill="#eef5ff"/>
          <rect width="720" height="320" fill="url(#rg)"/>

          {bp&&<line x1={pt.x} y1={pt.y} x2={bp.x} y2={bp.y} stroke="#e2e8f0" strokeWidth="2.5" strokeDasharray="6 4"/>}
          {bp&&<line x1={pt.x} y1={pt.y} x2={bp.x} y2={bp.y} stroke="var(--accent)" strokeWidth="2.5"
            strokeDasharray={`${pLen} ${pLen}`} strokeDashoffset={pLen*(1-t)} style={{transition:"stroke-dashoffset .1s linear"}}/>}

          {hospitals.map(h=>{
            const p=xy(h.coords.lat,h.coords.lng);
            const isBest=h.id===bestId;
            const res=results.find(r=>r.h.id===h.id);
            const oc=h.occ/h.beds;
            const dc=oc>.85?"var(--warn)":oc>.65?"var(--amber)":"var(--accent2)";
            return (
              <g key={h.id}>
                {isBest&&<><circle cx={p.x} cy={p.y} r={26} fill="var(--accent)" opacity=".10"/>
                <circle cx={p.x} cy={p.y} r={18} fill="var(--accent)" opacity=".16"/></>}
                <circle cx={p.x} cy={p.y} r={isBest?11:8} fill={isBest?"var(--accent)":dc} stroke="#fff" strokeWidth="2.5"/>
                {isBest&&<text x={p.x} y={p.y+1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="7" fontWeight="700">✓</text>}
                <rect x={p.x-40} y={p.y-36} width={80} height={24} rx="5" fill="white" opacity=".92"/>
                <text x={p.x} y={p.y-27} textAnchor="middle" fill={isBest?"var(--accent)":"var(--text)"} fontSize="8.5" fontWeight={isBest?"700":"600"}>
                  {h.name.split(" ").slice(0,2).join(" ")}
                </text>
                {res&&<text x={p.x} y={p.y-18} textAnchor="middle" fill="var(--muted)" fontSize="7.5">{res.score}pts · {res.rt.mins}m</text>}
              </g>
            );
          })}

          {bp&&t>0&&t<0.98&&(
            <g transform={`translate(${ax},${ay})`}>
              <circle r={12} fill="var(--warn)" opacity=".9"/>
              <text textAnchor="middle" dominantBaseline="middle" fontSize={10}>🚑</text>
            </g>
          )}

          <g>
            <circle cx={pt.x} cy={pt.y} r={14} fill="var(--amber)" opacity=".2"/>
            <circle cx={pt.x} cy={pt.y} r={8} fill="var(--amber)" stroke="#fff" strokeWidth="2.5"/>
            <text x={pt.x} y={pt.y-18} textAnchor="middle" fill="var(--amber)" fontSize="9" fontWeight="800">YOU</text>
          </g>

          <g transform="translate(12,296)">
            <circle cx="6" cy="6" r="4" fill="var(--accent)"/><text x="14" y="10" fontSize="8" fill="var(--muted)">Best match</text>
            <circle cx="76" cy="6" r="4" fill="var(--amber)"/><text x="84" y="10" fontSize="8" fill="var(--muted)">Your location</text>
            <circle cx="148" cy="6" r="4" fill="var(--warn)"/><text x="156" y="10" fontSize="8" fill="var(--muted)">Near capacity</text>
            <text x="218" y="10" fontSize="8" fill="var(--accent)" fontWeight="600">🚑 Ambulance (simulated)</text>
          </g>
        </svg>
      </div>
      <p style={{padding:"6px 16px 10px",color:"var(--muted)",fontSize:11,fontStyle:"italic"}}>
        ⚠ Simulation map. In production, replaced by Azure Maps with real traffic routing.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MAP (dashboard)
// ─────────────────────────────────────────────────────────────────────────────
const AdminMap = ({hospitals}) => {
  const B={mnLa:12.82,mxLa:13.06,mnLn:77.47,mxLn:77.77};
  return (
    <div style={{background:"linear-gradient(135deg,#e8f4ff,#f0f8f0)",borderRadius:10,height:260,position:"relative",overflow:"hidden",border:"1px solid #d6eaff"}}>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        <defs><pattern id="mg" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0L0 0 0 30" fill="none" stroke="rgba(29,111,229,.06)" strokeWidth=".8"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#mg)"/>
        {hospitals.map(h=>{
          const px=((h.coords.lng-B.mnLn)/(B.mxLn-B.mnLn))*100;
          const py=((B.mxLa-h.coords.lat)/(B.mxLa-B.mnLa))*100;
          const oc=h.occ/h.beds;
          const dc=oc>.85?"var(--warn)":oc>.65?"var(--amber)":"var(--accent2)";
          return (
            <g key={h.id}>
              <circle cx={`${px}%`} cy={`${py}%`} r="7" fill={dc} stroke="#fff" strokeWidth="2.5"/>
              <foreignObject x={`${Math.min(px+1.5,70)}%`} y={`${Math.max(py-8,2)}%`} width="110" height="30">
                <div style={{background:"rgba(255,255,255,.92)",borderRadius:5,padding:"2px 7px",fontSize:8.5,fontWeight:700,border:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>
                  {h.name.split(" ").slice(0,2).join(" ")}
                  <span style={{color:dc,marginLeft:4}}>{Math.round(oc*100)}%</span>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
      <div style={{position:"absolute",top:12,left:12,background:"rgba(255,255,255,.92)",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:700}}>📍 Bengaluru Metro</div>
      <div style={{position:"absolute",bottom:12,right:12,background:"rgba(255,255,255,.9)",borderRadius:8,padding:"7px 12px",fontSize:10,display:"flex",gap:12}}>
        <span>🟢 Available</span><span>🟡 Moderate</span><span>🔴 Critical</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LANDING
// ─────────────────────────────────────────────────────────────────────────────
const Landing = ({ onAnalyse, onAdmin }) => {
  const [symptoms,setSymptoms]=useState("");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* NAVBAR */}
      <nav style={{
        height: 64,
        padding: "0 48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--card)",
        borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            color: "#fff"
          }}>
            AH
          </div>
          <span style={{ fontWeight: 800, fontSize: 20 }}>
            Aero<span style={{ color: "var(--accent2)" }}>Health</span>
          </span>
        </div>

        <button
          onClick={onAdmin}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "1.5px solid var(--border)",
            background: "transparent",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--muted)"
          }}
        >
          Admin Login
        </button>
      </nav>

      {/* HERO */}
      <div style={{
        flex: 1,
        padding: "100px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center"
      }}>
        <div style={{ maxWidth: 760 }}>

          <h1 style={{
            fontWeight: 700,
            fontSize: "clamp(34px,5vw,56px)",
            marginBottom: 20,
            lineHeight: 1.15
          }}>
            Intelligent Healthcare Routing
          </h1>

          <p style={{
            fontSize: 17,
            color: "var(--muted)",
            marginBottom: 40,
            lineHeight: 1.7
          }}>
            Describe your symptoms and our AI engine will instantly
            determine the optimal hospital based on urgency,
            real-time capacity and travel time.
          </p>

          <textarea
            value={symptoms}
            onChange={(e)=>setSymptoms(e.target.value)}
            placeholder="Describe your symptoms..."
            rows={4}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 10,
              border: "1.5px solid var(--border)",
              fontSize: 15,
              background: "#fff",
              marginBottom: 20
            }}
          />

          <button
            onClick={()=>onAnalyse(symptoms)}
            style={{
              padding: "14px 40px",
              borderRadius: 10,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              boxShadow: "0 6px 22px rgba(29,111,229,.25)"
            }}
          >
            Analyse & Find Best Hospital
          </button>

          <p style={{
            marginTop: 14,
            fontSize: 12,
            color: "var(--muted)"
          }}>
            For real emergencies call 112 immediately.
          </p>

        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN LOGIN
// ─────────────────────────────────────────────────────────────────────────────
const AdminLogin = ({onSuccess,onBack}) => {
  const [u,setU]=useState("");const [p,setP]=useState("");const [err,setErr]=useState("");const [loading,setL]=useState(false);
  const submit=async()=>{setL(true);setErr("");await new Promise(r=>setTimeout(r,700));if(u==="admin"&&p==="admin")onSuccess();else setErr("Use admin / admin for this prototype.");setL(false);};
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)"}}>
      <div style={{background:"var(--card)",borderRadius:16,padding:"44px 38px",maxWidth:400,width:"100%",boxShadow:"var(--shlg)",animation:"scaleIn .4s ease"}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{width:52,height:52,borderRadius:12,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>🔐</div>
          <h2 style={{fontWeight:800,fontSize:22,marginBottom:4}}>Admin Access</h2>
          <p style={{color:"var(--muted)",fontSize:13}}>AeroHealth Command Center</p>
        </div>
        {[["Username","text",u,setU,"admin"],["Password","password",p,setP,"••••••"]].map(([lbl,type,val,set,ph])=>(
          <div key={lbl} style={{marginBottom:16}}>
            <label style={{display:"block",fontWeight:700,fontSize:12,marginBottom:6,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5}}>{lbl}</label>
            <input type={type} value={val} onChange={e=>set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={ph}
              style={{width:"100%",padding:"11px 14px",border:"1.5px solid var(--border)",borderRadius:8,fontSize:14,outline:"none",background:"#f8fafc",transition:"border-color .2s"}}
              onFocus={e=>e.target.style.borderColor="var(--accent)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
          </div>
        ))}
        {err&&<div style={{color:"var(--warn)",fontSize:12.5,marginBottom:14,padding:"10px 12px",background:"#fff1f0",borderRadius:8}}>{err}</div>}
        <button onClick={submit} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:8,border:"none",background:loading?"var(--border)":"var(--accent)",color:loading?"var(--muted)":"#fff",fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12}}>
          {loading&&<Spinner size={16} color="#fff"/>}{loading?"Authenticating...":"Login to Dashboard"}
        </button>
        <button onClick={onBack} style={{width:"100%",padding:"11px",borderRadius:8,border:"1.5px solid var(--border)",background:"transparent",fontSize:13,color:"var(--muted)"}}>← Back to Home</button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT FLOW
// ─────────────────────────────────────────────────────────────────────────────
const PatientFlow = ({ initialSymptoms, onBack }) => {
  const [step,setStep]=useState("input");
  const [sx,setSx]=useState(initialSymptoms || "");
  const [coords,setCoords]=useState({lat:12.9716,lng:77.5946});
  const [locName,setLoc]=useState("Central Bengaluru (default)");
  const [triage,setTriage]=useState(null);
  const [ranked,setRanked]=useState([]);
  const [hospitals]=useState(mkHospitals);
  const [toasts,setToasts]=useState([]);
  const [routeStep,setRouteStep]=useState(0);
  const [selId,setSelId]=useState(null);
  const [liveH,setLiveH]=useState(mkHospitals());
  const tiRef=useRef(null);

  useEffect(()=>{
  if(initialSymptoms && initialSymptoms.length > 10){
    analyse();
  }
},[]);

  const toast=(msg,type="info")=>{const id=Date.now();setToasts(t=>[...t,{id,msg,type}]);setTimeout(()=>setToasts([]),3500);};

  const gps=()=>{if(!navigator.geolocation){toast("Using default location","warn");return;}navigator.geolocation.getCurrentPosition(pos=>{setCoords({lat:pos.coords.latitude,lng:pos.coords.longitude});setLoc(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);toast("📍 Location acquired!");},()=>toast("Could not get GPS. Using default.","warn"));};

  const analyse=async()=>{
    if(sx.trim().length<10){toast("Please describe symptoms in more detail.","error");return;}
    setStep("analyzing");
    await new Promise(r=>setTimeout(r,800));

    let tr = null;
    // --- Attempt Azure AI backend classification first ---
    // Falls back to local classifier automatically if backend is unavailable.
    try {
      const resp = await fetch("/api/classify", {
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
    } catch (_) {
      // Network error or timeout — silent fallback
    }

    // --- Local keyword classifier fallback ---
    if (!tr) {
      const local = TriageService.classify(sx);
      tr = { ...local, source: "fallback", confidence: 1.0 };
    }

    await new Promise(r=>setTimeout(r,800));
    const rk=ScoreEngine.rank(hospitals,tr,coords);
    setTriage(tr);
    setRanked(rk);
    setSelId(rk[0]?.h.id||null);
    setStep("results");
    toast(`✅ Optimal route found! (${tr.source === "azure" ? "🤖 Azure AI" : "📋 Rule-based"})`);
  };

  useEffect(()=>{if(step!=="results")return;setRouteStep(0);clearInterval(tiRef.current);tiRef.current=setInterval(()=>setRouteStep(s=>{if(s>=100){clearInterval(tiRef.current);return 100;}return s+0.5;}),50);return()=>clearInterval(tiRef.current);},[step,selId]);

  useEffect(()=>{if(step!=="results")return;const iv=setInterval(()=>setLiveH(prev=>prev.map(h=>({...h,occ:Math.min(h.beds,Math.max(Math.round(h.beds*.25),h.occ+Math.round((Math.random()-.48)*3)))}))),CFG.TICK_MS);return()=>clearInterval(iv);},[step]);

  const SAMPLES=["Severe chest pain radiating to my left arm with shortness of breath and sweating","Sudden severe headache, confused speech and facial drooping on one side","High fever, difficulty breathing and persistent cough for 3 days","Mild fever and body ache since yesterday, feeling very fatigued"];

  if(step==="input")return(
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      <Toast items={toasts}/>
      <nav style={{height:58,padding:"0 24px",display:"flex",alignItems:"center",gap:14,background:"var(--card)",borderBottom:"1px solid var(--border)"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"var(--muted)",fontSize:13,fontWeight:600}}>← Home</button>
        <span style={{fontWeight:800,fontSize:18,color:"var(--sidebar)"}}>Aero<span style={{color:"var(--accent2)"}}>Health</span></span>
        <span style={{color:"var(--muted)",fontSize:13}}>/ Patient Triage</span>
      </nav>
      <div style={{maxWidth:660,margin:"0 auto",padding:"40px 24px",animation:"fadeUp .5s ease"}}>
        <h1 style={{fontWeight:800,fontSize:30,marginBottom:8}}>What are your <span style={{color:"var(--accent2)"}}>symptoms?</span></h1>
        <p style={{color:"var(--muted)",fontSize:15,marginBottom:28}}>Describe what you're experiencing and we'll find the best hospital right now.</p>
        <div style={{background:"var(--card)",borderRadius:"var(--r)",padding:24,boxShadow:"var(--shsm)",marginBottom:18}}>
          <label style={{display:"block",fontWeight:700,fontSize:11,marginBottom:10,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5}}>Describe Your Symptoms</label>
          <textarea value={sx} onChange={e=>setSx(e.target.value)} rows={5} placeholder="e.g. Severe chest pain radiating to my left arm, difficulty breathing, feel dizzy..."
            style={{width:"100%",padding:"12px 14px",border:"1.5px solid var(--border)",borderRadius:8,fontSize:14,resize:"vertical",lineHeight:1.6,outline:"none",background:"#f8fafc"}}
            onFocus={e=>e.target.style.borderColor="var(--accent)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
          <div style={{marginTop:14}}>
            <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Quick Select:</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {SAMPLES.map((s,i)=><button key={i} onClick={()=>setSx(s)} style={{padding:"6px 13px",border:`1px solid ${sx===s?"var(--accent)":"var(--border)"}`,borderRadius:20,background:sx===s?"#eff6ff":"#f8fafc",color:sx===s?"var(--accent)":"var(--muted)",fontSize:11.5,fontWeight:600,transition:"all .15s"}}>{s.substring(0,42)}...</button>)}
            </div>
          </div>
        </div>
        <div style={{background:"var(--card)",borderRadius:"var(--r)",padding:"16px 20px",boxShadow:"var(--shsm)",marginBottom:22,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontWeight:700,fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>Your Location</div><div style={{fontSize:14,fontWeight:600}}>📍 {locName}</div></div>
          <button onClick={gps} style={{padding:"9px 18px",border:"1.5px solid var(--border)",borderRadius:8,background:"transparent",color:"var(--accent)",fontSize:13,fontWeight:700}}>📡 Use GPS</button>
        </div>
        <button onClick={analyse} style={{width:"100%",padding:"16px",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontWeight:800,fontSize:17,boxShadow:"0 4px 18px rgba(29,111,229,.35)",transition:"transform .2s"}} onMouseOver={e=>e.target.style.transform="translateY(-2px)"} onMouseOut={e=>e.target.style.transform=""}>🔍 Analyse &amp; Find Best Hospital</button>
        <p style={{textAlign:"center",marginTop:14,fontSize:11.5,color:"var(--muted)"}}>⚠️ Simulation. For real emergencies call 112.</p>
      </div>
    </div>
  );

  if(step==="analyzing")return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"var(--bg)",gap:20,animation:"fadeUp .4s ease"}}>
      <Spinner size={52} color="var(--accent)"/>
      <h2 style={{fontWeight:800,fontSize:24,marginBottom:6}}>Analysing your case...</h2>
      <div style={{color:"var(--muted)",fontSize:14,lineHeight:2,textAlign:"center"}}>
        🧠 Running semantic triage<br/>🏥 Evaluating hospital capacities<br/>📍 Calculating traffic-aware routes<br/>⚖️ Computing health scores
      </div>
    </div>
  );

  // RESULTS
  const selR=ranked.find(r=>r.h.id===selId)||ranked[0];
  const best=ranked[0];
  const U=CFG.URGENCY[triage.urgency]||CFG.URGENCY[1];

  return(
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      <Toast items={toasts}/>
      <nav style={{height:58,padding:"0 24px",display:"flex",alignItems:"center",gap:14,background:"var(--card)",borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:100}}>
        <button onClick={()=>setStep("input")} style={{background:"none",border:"none",color:"var(--muted)",fontSize:13,fontWeight:600}}>← Back</button>
        <span style={{fontWeight:800,fontSize:18,color:"var(--sidebar)"}}>Aero<span style={{color:"var(--accent2)"}}>Health</span></span>
        <span style={{color:"var(--muted)",fontSize:13}}>/ Results</span>
      </nav>
      <div style={{maxWidth:960,margin:"0 auto",padding:"26px 20px"}}>

        {/* Triage summary */}
        <div style={{background:"var(--card)",borderRadius:"var(--r)",padding:22,boxShadow:"var(--shsm)",marginBottom:20,border:"1px solid var(--border)",animation:"fadeUp .4s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <h2 style={{fontWeight:800,fontSize:19,margin:0}}>🧠 Triage Assessment</h2>
            {/* Source badge — shows whether Azure AI or rule-based classifier was used */}
            <span style={{
              background: triage.source==="azure" ? "#eff6ff" : "#f8fafc",
              color:       triage.source==="azure" ? "var(--accent)" : "var(--muted)",
              border:      `1px solid ${triage.source==="azure" ? "var(--accent)" : "var(--border)"}`,
              fontSize:10.5,fontWeight:700,padding:"4px 12px",borderRadius:20,
            }}>
              {triage.source==="azure" ? "🤖 Azure AI Language" : "📋 Rule-based classifier"}
            </span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
            {[
              {l:"Urgency Level",v:<span style={{background:U.bg,color:U.color,padding:"5px 14px",borderRadius:20,fontWeight:700,fontSize:13}}>{U.label}</span>},
              {l:"Department",v:<span style={{fontWeight:800,fontSize:16,color:"var(--accent)"}}>🏥 {triage.dept}</span>},
              {l:"Priority Score",v:<span style={{fontWeight:800,fontSize:26,color:triage.priority>60?"var(--warn)":"var(--amber)"}}>{triage.priority}<span style={{fontSize:12,fontWeight:400}}>/100</span></span>},
              {l:"Best Time-to-Care",v:<span style={{fontWeight:800,fontSize:26,color:"var(--accent2)"}}>{best?.timeToCare}m</span>},
            ].map((x,i)=>(
              <div key={i} style={{background:"#f8fafc",borderRadius:8,padding:"13px 15px"}}>
                <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:7}}>{x.l}</div>
                <div>{x.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected hospital + map */}
        {selR&&(
          <div style={{background:selR.h.id===best?.h.id?"linear-gradient(135deg,#eff6ff,#f0fdf4)":"var(--card)",border:`${selR.h.id===best?.h.id?2:1}px solid ${selR.h.id===best?.h.id?"var(--accent)":"var(--border)"}`,borderRadius:"var(--r)",padding:22,marginBottom:20,boxShadow:"var(--shmd)",animation:"scaleIn .3s ease",position:"relative"}}>
            {selR.h.id===best?.h.id&&<div style={{position:"absolute",top:14,right:14,background:"var(--accent)",color:"#fff",fontSize:10.5,fontWeight:700,padding:"4px 12px",borderRadius:20}}>⭐ RECOMMENDED</div>}
            <div style={{display:"flex",gap:14,marginBottom:18,flexWrap:"wrap",alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontWeight:800,fontSize:19,marginBottom:3}}>{selR.h.name}</div>
                <div style={{color:"var(--muted)",fontSize:13}}>📍 {selR.h.area}</div>
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {[{l:"Health Score",v:`${selR.score}`,c:selR.score>70?"var(--accent2)":selR.score>50?"var(--amber)":"var(--warn)",big:true},{l:"Travel Time",v:`${selR.rt.mins}m`},{l:"Time-to-Care",v:`${selR.timeToCare}m`,c:"var(--accent)"}].map((s,i)=>(
                  <div key={i} style={{background:"rgba(255,255,255,.75)",borderRadius:8,padding:"10px 14px",textAlign:"center",minWidth:90}}>
                    <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                    <div style={{fontWeight:800,fontSize:s.big?26:18,color:s.c||"var(--text)"}}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <RouteMap hospitals={liveH} results={ranked} patCoords={coords} bestId={selId} step={routeStep}/>
            <div style={{marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:"rgba(255,255,255,.75)",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>Occupancy Now (Live)</div>
                <div style={{fontWeight:800,fontSize:22,marginBottom:6}}>{Math.round((liveH.find(h=>h.id===selR.h.id)?.occ/selR.h.beds)*100)||0}%</div>
                <Bar v={Math.round((liveH.find(h=>h.id===selR.h.id)?.occ/selR.h.beds)*100)||0}/>
              </div>
              <div style={{background:"rgba(255,255,255,.75)",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>Predicted (60 min)</div>
                <div style={{fontWeight:800,fontSize:22,marginBottom:6}}>{selR.pred.p60}% {selR.pred.trend==="up"?"📈":"📉"}</div>
                <Bar v={selR.pred.p60}/>
              </div>
            </div>
          </div>
        )}

        {/* Rankings */}
        <h2 style={{fontWeight:800,fontSize:19,marginBottom:14}}>🏆 All Hospitals Ranked</h2>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {ranked.map(({h,rt,score,timeToCare},i)=>{
            const occ=Math.round((liveH.find(x=>x.id===h.id)?.occ/h.beds)*100)||0;
            const isSel=h.id===selId;
            return(
              <div key={h.id} onClick={()=>{setSelId(h.id);setRouteStep(0);}} style={{background:isSel?"#eff6ff":"var(--card)",border:`${isSel?2:1}px solid ${isSel?"var(--accent)":"var(--border)"}`,borderRadius:"var(--r)",padding:"14px 18px",cursor:"pointer",transition:"all .2s",animation:`fadeUp .4s ease ${i*.06}s both`,boxShadow:isSel?"var(--shmd)":"var(--shsm)"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{width:34,height:34,borderRadius:8,background:i===0?"var(--accent)":"#f0f4f8",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:i===0?15:13,color:i===0?"#fff":"var(--muted)",flexShrink:0}}>{i===0?"🏆":`#${i+1}`}</div>
                  <div style={{flex:1,minWidth:150}}>
                    <div style={{fontWeight:700,fontSize:14}}>{h.name}</div>
                    <div style={{color:"var(--muted)",fontSize:12}}>📍 {h.area}</div>
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    {[{l:"Score",v:score,c:score>70?"var(--accent2)":score>50?"var(--amber)":"var(--warn)"},{l:"Travel",v:`${rt.mins}m`},{l:"Occupancy",v:`${occ}%`,c:occ>85?"var(--warn)":occ>65?"var(--amber)":"var(--accent2)"},{l:"Time-to-Care",v:`${timeToCare}m`,c:"var(--accent)"}].map((s,j)=>(
                      <div key={j} style={{textAlign:"center"}}>
                        <div style={{fontSize:9.5,color:"var(--muted)",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                        <div style={{fontWeight:800,fontSize:j===0?20:15,color:s.c||"var(--text)"}}>{s.v}</div>
                      </div>
                    ))}
                    <StatusBadge status={h.status}/>
                  </div>
                </div>
                {isSel&&<div style={{marginTop:8,fontSize:11.5,color:"var(--accent)",fontWeight:600}}>↑ Route displayed above — click another hospital to compare</div>}
              </div>
            );
          })}
        </div>
        <div style={{textAlign:"center",marginTop:28,padding:"13px 20px",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:10,fontSize:12.5,color:"#92400e"}}>
          ⚠️ Simulation only. In real emergencies always call 112 immediately.
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const Admin = ({onLogout}) => {
  const [hosps,setHosps]=useState(mkHospitals());
  const [nav,setNav]=useState("dashboard");
  const [alert,setAlert]=useState(true);
  const [feed,setFeed]=useState(INIT_FEED);
  const [now,setNow]=useState(new Date());
  const spark=useRef([55,58,60,57,62,68,74,78,82,80,75,80]);

  useEffect(()=>{
    const iv=setInterval(()=>{
      setHosps(prev=>prev.map(h=>({...h,occ:Math.min(h.beds,Math.max(Math.round(h.beds*.25),h.occ+Math.round((Math.random()-.48)*5))),icuO:Math.min(h.icuT,Math.max(0,h.icuO+Math.round((Math.random()-.5)*2))),emgO:Math.min(h.emgT,Math.max(0,h.emgO+Math.round((Math.random()-.5)*1)))})));
      setNow(new Date());
      const sysOcc=Math.round((hosps.reduce((a,h)=>a+h.occ,0)/hosps.reduce((a,h)=>a+h.beds,0))*100);
      spark.current=[...spark.current.slice(1),sysOcc];
      if(Math.random()<.25){
        const desc=["Acute MI · Cardiology","Stroke · Neurology","Respiratory failure · Pulmonology","Trauma · Emergency"][Math.floor(Math.random()*4)];
        const nm=["Rahul K., 52","Sunita P., 38","Anil M., 67","Divya S., 29","Vikram R., 44"][Math.floor(Math.random()*5)];
        const dest=hosps[Math.floor(Math.random()*hosps.length)].name;
        setFeed(f=>[{id:`BLR-${9000+Math.floor(Math.random()*999)}`,name:nm,desc,dest,eta:5+Math.floor(Math.random()*15),sev:Math.random()<.3?"critical":Math.random()<.5?"urgent":"stable",time:"Just now"},...f.slice(0,6)]);
      }
    },CFG.TICK_MS);
    return()=>clearInterval(iv);
  },[]);

  const totB=hosps.reduce((a,h)=>a+h.beds,0),totO=hosps.reduce((a,h)=>a+h.occ,0);
  const icuT=hosps.reduce((a,h)=>a+h.icuT,0),icuO=hosps.reduce((a,h)=>a+h.icuO,0);
  const sysP=Math.round((totO/totB)*100);
  const nearC=hosps.filter(h=>(h.occ/h.beds)>.85).length;

  const NAVS=[
    {id:"dashboard",icon:"⊞",label:"Dashboard",sec:"Overview"},
    {id:"livemap",icon:"🗺",label:"Live Map",sec:null},
    {id:"hospitals",icon:"🏥",label:"Hospitals",sec:"Operations"},
    {id:"triage",icon:"🔔",label:"Triage Queue",sec:null},
    {id:"analytics",icon:"📊",label:"Analytics",sec:null},
    {id:"predict",icon:"📈",label:"Predictive Load",sec:"Intelligence"},
    {id:"syshealth",icon:"🛡",label:"System Health",sec:null},
    {id:"telemetry",icon:"⚡",label:"Telemetry",sec:null},
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
        const r = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
        if (r.ok) setHealthData(await r.json());
      } catch (_) { /* backend not running — keep defaults */ }
    }
    fetchHealth();
    const iv = setInterval(fetchHealth, 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, []);

  const Page = () => {
    switch(nav){
      case "dashboard":return <DashMain hosps={hosps} feed={feed} alert={alert} setAlert={setAlert} sysP={sysP} icuFree={icuT-icuO} nearC={nearC} spark={spark.current} healthData={healthData}/>;
      case "livemap":  return <div style={{animation:"fadeUp .4s ease"}}><h2 style={{fontWeight:800,fontSize:22,marginBottom:20}}>Live Spatial Map</h2><div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:22}}><AdminMap hospitals={hosps}/><div style={{marginTop:20,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>{hosps.map(h=>{const oc=Math.round((h.occ/h.beds)*100);return(<div key={h.id} style={{background:"var(--bg)",borderRadius:8,padding:"12px 14px"}}><div style={{fontWeight:700,fontSize:13,marginBottom:3}}>{h.name}</div><div style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>{h.area}</div><Bar v={oc}/><div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,fontWeight:700}}><span style={{color:"var(--muted)"}}>Occupancy</span><span style={{color:oc>85?"var(--warn)":oc>65?"var(--amber)":"var(--accent2)"}}>{oc}%</span></div></div>);})}</div></div></div>;
      case "hospitals":return <HospPage hosps={hosps}/>;
      case "triage":   return <TriagePage feed={feed}/>;
      case "analytics":return <AnalyticsPage hosps={hosps} feed={feed} healthData={healthData}/>;
      case "predict":  return <PredPage hosps={hosps}/>;
      case "syshealth":return <SysHealthPage healthData={healthData}/>;
      case "telemetry":return <TelPage hosps={hosps} now={now}/>;
      default:return null;
    }
  };

  return(
    <div style={{display:"flex",minHeight:"100vh",background:"var(--bg)"}}>
      {/* Sidebar */}
      <aside style={{width:"var(--sw)",background:"var(--sidebar)",display:"flex",flexDirection:"column",position:"fixed",top:0,left:0,bottom:0,zIndex:100,overflowY:"auto"}}>
        <div style={{padding:"20px 18px 16px",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,background:"var(--accent)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🩺</div>
            <div><div style={{fontSize:16,fontWeight:800,color:"#fff"}}>AeroHealth</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:1}}>Command Center</div></div>
          </div>
        </div>
        <nav style={{padding:"12px 10px",flex:1}}>
          {NAVS.map(item=>(
            <div key={item.id}>
              {item.sec&&<div style={{fontSize:9.5,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"rgba(255,255,255,.3)",padding:"12px 8px 5px"}}>{item.sec}</div>}
              <button onClick={()=>setNav(item.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",background:nav===item.id?"var(--accent)":"transparent",color:nav===item.id?"#fff":"rgba(255,255,255,.6)",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",textAlign:"left"}}>
                <span style={{fontSize:14}}>{item.icon}</span>{item.label}
              </button>
            </div>
          ))}
        </nav>
        <div style={{padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,.07)",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,var(--accent),var(--accent2))",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#fff",fontSize:13}}>P</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,color:"#fff"}}>Dr. Priya R.</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Chief Medical Officer</div></div>
          <button onClick={onLogout} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:11,cursor:"pointer"}}>↩</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{marginLeft:"var(--sw)",flex:1,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
        <header style={{background:"var(--card)",borderBottom:"1px solid var(--border)",padding:"0 26px",height:58,display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,zIndex:50}}>
          <div style={{flex:1,fontWeight:800,fontSize:15}}>{NAVS.find(n=>n.id===nav)?.label}<span style={{color:"var(--muted)",fontWeight:400,fontSize:13,marginLeft:8}}>Bengaluru Metro Region</span></div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent2)",animation:"pd 1.8s infinite"}}/>
            <span style={{fontSize:11.5,color:"var(--muted)",fontWeight:700}}>LIVE</span>
            <span style={{fontSize:11,color:"var(--muted)"}}>{now.toLocaleTimeString()}</span>
            <button style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:"1.5px solid var(--border)",background:"transparent",fontSize:12,fontWeight:600}}>📊 Reports</button>
            <button style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:7,border:"none",background:"var(--warn)",color:"#fff",fontSize:12,fontWeight:700}}>⚠ {nearC} Saturation Alert{nearC!==1?"s":""}</button>
          </div>
        </header>
        <div style={{padding:"22px 24px",flex:1}}><Page/></div>
      </main>
    </div>
  );
};

// ─── DASHBOARD MAIN ───────────────────────────────────────────────────────────
const DashMain = ({hosps,feed,alert,setAlert,sysP,icuFree,nearC,spark,healthData}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    {alert&&(
      <div style={{background:"#fff8ed",border:"1px solid #fde68a",borderRadius:10,padding:"11px 16px",display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <span style={{fontSize:16,flexShrink:0}}>⚠</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12.5,fontWeight:700,color:"#92400e"}}>Saturation Warning — Manipal Whitefield approaching {Math.round((hosps.find(h=>h.id==="h4")?.occ/hosps.find(h=>h.id==="h4")?.beds)*100)||94}% ICU capacity</div>
          <div style={{fontSize:11,color:"#b45309",marginTop:1}}>Incoming ambulances being rerouted to Fortis Cunningham Road · ETA updated</div>
        </div>
        <button onClick={()=>setAlert(false)} style={{background:"none",border:"none",color:"#b45309",fontSize:16,cursor:"pointer"}}>✕</button>
      </div>
    )}
    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
      {[
        {bg:"#eff6ff",icon:"🏥",label:"Active Hospitals",value:hosps.length,delta:"+2 online today",up:true},
        {bg:"#ecfdf5",icon:"🛏",label:"Available ICU Beds",value:icuFree,delta:`of ${hosps.reduce((a,h)=>a+h.icuT,0)} total`,up:true},
        {bg:"#fff1f0",icon:"⏱",label:"Avg. Time-to-Care",value:"11 min",delta:"−23% this week",up:true},
        {bg:"#fffbeb",icon:"🚑",label:"Active Ambulances",value:27,delta:"7 en route now",up:true},
      ].map((k,i)=>(
        <div key={i} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:44,height:44,borderRadius:10,background:k.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{k.icon}</div>
          <div>
            <div style={{fontSize:10.5,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5}}>{k.label}</div>
            <div style={{fontSize:26,fontWeight:800,lineHeight:1.2,marginTop:2}}>{k.value}</div>
            <div style={{fontSize:11,fontWeight:600,color:k.up?"var(--accent2)":"var(--warn)",marginTop:1}}>↑ {k.delta}</div>
          </div>
        </div>
      ))}
    </div>

    {/* System Health summary strip — visible in the main dashboard at a glance */}
    {healthData && (
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
        {[
          {
            label:  "Azure AI Language",
            icon:   "🤖",
            status: healthData.azure?.status || 'unknown',
            detail: healthData.azure?.status === 'ok'
              ? `Avg ${healthData.azure.avgLatencyMs}ms · ${healthData.azure.callCount} calls`
              : healthData.azure?.status === 'unknown'
                ? healthData.server?.azureKeyConfigured ? 'Awaiting first call' : 'No API key — fallback mode'
                : healthData.azure?.lastError || 'Check credentials',
          },
          {
            label:  "OSRM Routing",
            icon:   "🗺",
            status: 'external',
            detail: "Runs in simulate.py · Road routing via OpenStreetMap",
          },
          {
            label:  "Server Uptime",
            icon:   "🖥",
            status: 'ok',
            detail: `${healthData.server?.patientsTotal || 0} patients processed · ${healthData.server?.errorsTotal || 0} errors`,
          },
        ].map((s, i) => {
          const colors = {
            ok:       { bg: '#ecfdf5', c: '#059669', dot: '#059669' },
            degraded: { bg: '#fffbeb', c: '#d97706', dot: '#d97706' },
            down:     { bg: '#fff1f0', c: 'var(--warn)', dot: 'var(--warn)' },
            unknown:  { bg: '#f8fafc', c: 'var(--muted)', dot: '#cbd5e1' },
            external: { bg: '#f0f4ff', c: 'var(--accent)', dot: 'var(--accent)' },
          };
          const cl = colors[s.status] || colors.unknown;
          return (
            <div key={i} style={{background:cl.bg,border:`1px solid ${cl.dot}30`,borderRadius:"var(--r)",padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:18}}>{s.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:cl.dot,flexShrink:0}}/>
                  <span style={{fontWeight:700,fontSize:12.5,color:cl.c}}>{s.label}</span>
                  <span style={{fontSize:10,fontWeight:700,background:cl.dot+'20',color:cl.c,padding:"1px 7px",borderRadius:20,textTransform:"uppercase",marginLeft:"auto"}}>{s.status}</span>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    )}

    {/* Map + Triage */}
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><div style={{fontWeight:700,fontSize:13.5}}>Spatial Load Map</div><div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>Real-time hospital occupancy · Bengaluru Metro</div></div>
          <span style={{background:"#ecfdf5",color:"#059669",fontSize:10.5,fontWeight:700,padding:"3px 9px",borderRadius:20}}>Azure Maps Live</span>
        </div>
        <AdminMap hospitals={hosps}/>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><div style={{fontWeight:700,fontSize:13.5}}>Triage Queue</div><div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>AI-classified incoming cases</div></div>
          <span style={{background:"#fff1f0",color:"var(--warn)",fontSize:10.5,fontWeight:700,padding:"3px 9px",borderRadius:20}}>{feed.filter(c=>c.sev==="critical").length} Critical</span>
        </div>
        {feed.slice(0,5).map((c,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"9px 0",borderBottom:i<4?"1px solid var(--border)":"none",animation:"slideIn .3s ease"}}>
            <div style={{width:8,height:8,borderRadius:"50%",marginTop:4,flexShrink:0,background:c.sev==="critical"?"var(--warn)":c.sev==="urgent"?"var(--amber)":"var(--accent2)"}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700}}>Case #{c.id} · {c.name}</div>
              <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>{c.desc}</div>
              <div style={{fontSize:11,color:"var(--accent)",fontWeight:600,marginTop:3}}>→ {c.dest} · ETA {c.eta} min</div>
            </div>
            <div style={{fontSize:10.5,color:"var(--muted)",whiteSpace:"nowrap"}}>{c.time}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Table + Trend */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
        <div style={{fontWeight:700,fontSize:13.5,marginBottom:14}}>Hospital Health Scores</div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Facility","ICU Beds","Load","Status"].map(h=><th key={h} style={{fontSize:10.5,fontWeight:700,color:"var(--muted)",textAlign:"left",padding:"0 10px 10px",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>)}</tr></thead>
          <tbody>
            {hosps.map(h=>{
              const oc=Math.round((h.occ/h.beds)*100);
              const bc=oc>85?"var(--warn)":oc>65?"var(--amber)":"var(--accent2)";
              return(
                <tr key={h.id} style={{transition:"background .15s"}} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background=""}>
                  <td style={{padding:10,borderTop:"1px solid var(--border)"}}><div style={{fontWeight:600,fontSize:13}}>{h.name}</div><div style={{fontSize:11,color:"var(--muted)"}}>{h.area}</div></td>
                  <td style={{padding:10,borderTop:"1px solid var(--border)",fontWeight:700,fontSize:12.5}}>{h.icuO} / {h.icuT}</td>
                  <td style={{padding:10,borderTop:"1px solid var(--border)"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:80,height:6,background:"var(--border)",borderRadius:99,overflow:"hidden"}}><div style={{width:`${oc}%`,height:"100%",background:bc,borderRadius:99,transition:"width .6s"}}/></div><span style={{fontSize:12,fontWeight:700,color:oc>85?"var(--warn)":"var(--text)"}}>{oc}%</span></div></td>
                  <td style={{padding:10,borderTop:"1px solid var(--border)"}}><StatusBadge status={h.status}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20,flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div><div style={{fontWeight:700,fontSize:13.5}}>City-Wide ICU Load</div><div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>Hourly trend — today</div></div>
            <span style={{background:"#eff6ff",color:"var(--accent)",fontSize:10.5,fontWeight:700,padding:"3px 9px",borderRadius:20}}>Azure ML Prediction</span>
          </div>
          <Spark data={spark} color="var(--accent)"/>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--muted)",marginTop:6}}>
            {["6AM","9AM","12PM","3PM","6PM →"].map(l=><span key={l}>{l}</span>)}
          </div>
          <div style={{marginTop:10,fontSize:11,color:"var(--muted)"}}>
            <span style={{display:"inline-block",width:10,height:10,background:"var(--accent)",borderRadius:2,opacity:.35,marginRight:5,verticalAlign:"middle"}}/>
            Predicted peak 85–92% at 6–8PM — rerouting pre-activated
          </div>
        </div>
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
          <div style={{fontWeight:700,fontSize:13.5,marginBottom:14}}>Resource Snapshot</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[{l:"O₂ Cylinders",v:847,c:"var(--accent2)"},{l:"Blood Units",v:214,c:"var(--amber)"},{l:"Surgeons On-Call",v:63,c:"var(--accent)"},{l:"Ventilators Free",v:18,c:"var(--warn)"}].map((s,i)=>(
              <div key={i} style={{background:"var(--bg)",borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{s.l}</div>
                <div style={{fontSize:22,fontWeight:800,marginTop:3,color:s.c}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const HospPage = ({hosps}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontWeight:800,fontSize:22,marginBottom:20}}>Hospital Details</h2>
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {hosps.map((h,i)=>{
        const oc=Math.round((h.occ/h.beds)*100);const pred=PredictiveService.predict(h);
        return(
          <div key={h.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:22,animation:`fadeUp .4s ease ${i*.07}s both`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div><div style={{fontWeight:800,fontSize:17}}>{h.name}</div><div style={{color:"var(--muted)",fontSize:13,marginTop:2}}>📍 {h.area}</div></div>
              <StatusBadge status={h.status}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:14}}>
              {[{l:"Occupancy",v:`${oc}%`,bar:oc},{l:"ICU",v:`${h.icuO}/${h.icuT}`,bar:Math.round((h.icuO/h.icuT)*100)},{l:"Emergency",v:`${h.emgO}/${h.emgT}`,bar:Math.round((h.emgO/h.emgT)*100)},{l:"Pred. 60m",v:`${pred.p60}% ${pred.trend==="up"?"📈":"📉"}`,bar:pred.p60}].map((s,j)=>(
                <div key={j} style={{background:"var(--bg)",borderRadius:8,padding:"11px 13px"}}>
                  <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{s.l}</div>
                  <div style={{fontWeight:800,fontSize:20,marginBottom:6}}>{s.v}</div>
                  <Bar v={s.bar}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{h.depts.map((d,j)=><span key={j} style={{background:"var(--bg)",color:"var(--muted)",fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:20}}>{d}</span>)}</div>
          </div>
        );
      })}
    </div>
  </div>
);

const TriagePage = ({feed}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{fontWeight:800,fontSize:22}}>Live Triage Queue</h2>
      <span style={{background:"#fff1f0",color:"var(--warn)",fontSize:11,fontWeight:700,padding:"5px 12px",borderRadius:20}}>{feed.filter(c=>c.sev==="critical").length} Critical · Auto-routing active</span>
    </div>
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
      {feed.map((c,i)=>(
        <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"12px 0",borderBottom:i<feed.length-1?"1px solid var(--border)":"none",animation:"slideIn .3s ease"}}>
          <div style={{width:10,height:10,borderRadius:"50%",marginTop:3,flexShrink:0,background:c.sev==="critical"?"var(--warn)":c.sev==="urgent"?"var(--amber)":"var(--accent2)"}}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13}}>Case #{c.id} · {c.name}</div>
            <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{c.desc}</div>
            <div style={{fontSize:12,color:"var(--accent)",fontWeight:700,marginTop:4}}>→ {c.dest} · ETA {c.eta} min</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <span style={{background:c.sev==="critical"?"#fff1f0":c.sev==="urgent"?"#fffbeb":"#ecfdf5",color:c.sev==="critical"?"var(--warn)":c.sev==="urgent"?"var(--amber)":"var(--accent2)",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,textTransform:"capitalize"}}>{c.sev}</span>
            <span style={{fontSize:11,color:"var(--muted)"}}>{c.time}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── ANALYTICS PAGE ───────────────────────────────────────────────────────────
// Aggregates operational stats for a decision-maker view: hospitals at capacity,
// urgency breakdown, avg response time, AI triage source split.
const AnalyticsPage = ({hosps, feed, healthData}) => {
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
  const avgEta = feed.length ? Math.round(feed.reduce((a,c)=>a+(c.eta||0),0)/feed.length) : 0;

  // Hospital-level capacity data for bar table
  const hospRows = hosps.map(h => ({
    name: h.name,
    occ:  Math.round((h.occ/h.beds)*100),
    icu:  Math.round((h.icuO/h.icuT)*100),
    emg:  Math.round((h.emgO/h.emgT)*100),
    status: h.status,
  }));

  const StatCard = ({label, value, sub, color='var(--text)', bg='var(--card)', icon}) => (
    <div style={{background:bg,border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'18px 20px'}}>
      <div style={{fontSize:11,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:6}}>{label}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4}}>
        {icon&&<span style={{fontSize:20}}>{icon}</span>}
        <span style={{fontWeight:800,fontSize:28,color}}>{value}</span>
      </div>
      {sub&&<div style={{fontSize:11.5,color:'var(--muted)'}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{animation:'fadeUp .4s ease'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:12,marginBottom:6}}>
        <h2 style={{fontWeight:800,fontSize:22,margin:0}}>Analytics Summary</h2>
        <span style={{fontSize:12,color:'var(--muted)'}}>Operational view for decision-makers · refreshes every 3s</span>
      </div>
      <p style={{color:'var(--muted)',fontSize:13,marginBottom:22}}>Aggregate hospital performance, urgency distribution, and AI triage metrics across the Bengaluru network.</p>

      {/* Row 1 — System KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:20}}>
        <StatCard label="System Occupancy"    value={`${sysOccPct}%`}      sub={`${occupiedBeds} of ${totalBeds} beds filled`}                         color={sysOccPct>85?'var(--warn)':'var(--text)'} icon="🏥"/>
        <StatCard label="Hospitals at Capacity" value={atCapacity}           sub={`${hosps.length - atCapacity} accepting patients`}                        color={atCapacity>0?'var(--warn)':'var(--accent2)'} icon="⚠️"/>
        <StatCard label="ICU Utilisation"     value={`${icuUtilPct}%`}     sub={`${occupiedIcu} of ${totalIcu} ICU beds`}                               color={icuUtilPct>80?'var(--warn)':'var(--text)'} icon="🛏"/>
        <StatCard label="Avg. ETA to Hospital"  value={`${avgEta} min`}      sub={`across ${feed.length} active cases`}                                   color="var(--accent)" icon="🚑"/>
      </div>

      {/* Row 2 — Urgency breakdown + hospital table */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:16,marginBottom:20}}>

        {/* Urgency distribution */}
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:20}}>
          <div style={{fontWeight:700,fontSize:13.5,marginBottom:16}}>Patients by Urgency</div>
          {[
            {label:'Critical', count:urgencyDist.critical, color:'var(--warn)',  bg:'#fff1f0'},
            {label:'Urgent',   count:urgencyDist.urgent,   color:'var(--amber)', bg:'#fffbeb'},
            {label:'Stable',   count:urgencyDist.stable,   color:'var(--accent2)',bg:'#ecfdf5'},
          ].map((u,i) => (
            <div key={i} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:700,marginBottom:5}}>
                <span style={{color:u.color}}>{u.label}</span>
                <span>{u.count} ({Math.round((u.count/totalCases)*100)}%)</span>
              </div>
              <div style={{background:'var(--border)',borderRadius:99,height:8,overflow:'hidden'}}>
                <div style={{width:`${(u.count/totalCases)*100}%`,height:'100%',background:u.color,borderRadius:99,transition:'width .6s'}}/>
              </div>
            </div>
          ))}
          <div style={{marginTop:16,padding:'10px 12px',background:'#f8fafc',borderRadius:8,fontSize:11.5,color:'var(--muted)'}}>
            <strong style={{color:'var(--text)'}}>Note for decision-makers:</strong> Critical cases trigger automatic rerouting to hospitals with ICU availability. This reduces time-to-care for the highest-risk patients.
          </div>
        </div>

        {/* Per-hospital capacity table */}
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:20}}>
          <div style={{fontWeight:700,fontSize:13.5,marginBottom:16}}>Per-Hospital Utilisation</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Hospital','Ward','ICU','Emergency','Status'].map(h=><th key={h} style={{fontSize:10,fontWeight:700,color:'var(--muted)',textAlign:'left',padding:'0 8px 10px',textTransform:'uppercase',letterSpacing:.5}}>{h}</th>)}</tr></thead>
            <tbody>
              {hospRows.map((h,i) => (
                <tr key={i} onMouseOver={e=>e.currentTarget.style.background='#f8fafc'} onMouseOut={e=>e.currentTarget.style.background=''}>
                  <td style={{padding:'9px 8px',borderTop:'1px solid var(--border)',fontSize:12.5,fontWeight:600}}>{h.name.split(' ').slice(0,2).join(' ')}</td>
                  {[h.occ, h.icu, h.emg].map((v,j)=>(
                    <td key={j} style={{padding:'9px 8px',borderTop:'1px solid var(--border)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={{width:56,height:5,background:'var(--border)',borderRadius:99,overflow:'hidden'}}>
                          <div style={{width:`${v}%`,height:'100%',background:v>85?'var(--warn)':v>65?'var(--amber)':'var(--accent2)',borderRadius:99}}/>
                        </div>
                        <span style={{fontSize:11.5,fontWeight:700,color:v>85?'var(--warn)':'var(--text)'}}>{v}%</span>
                      </div>
                    </td>
                  ))}
                  <td style={{padding:'9px 8px',borderTop:'1px solid var(--border)'}}><StatusBadge status={h.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 3 — AI triage metrics */}
      <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:20}}>
        <div style={{fontWeight:700,fontSize:13.5,marginBottom:6}}>AI Triage Engine Performance</div>
        <p style={{color:'var(--muted)',fontSize:12.5,marginBottom:14}}>These metrics describe how the Azure AI Language service is performing as the primary triage classifier. A healthy system should show status <strong>ok</strong> with low latency. The fallback keyword classifier activates automatically when Azure is unreachable.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
          {[
            {l:'AI Status',        v: healthData?.azure?.status    || 'unknown',  c: healthData?.azure?.status==='ok'?'var(--accent2)':'var(--warn)'},
            {l:'Total API Calls',  v: healthData?.azure?.callCount  || 0,          c: 'var(--text)'},
            {l:'Error Count',      v: healthData?.azure?.errorCount || 0,          c: (healthData?.azure?.errorCount||0)>0?'var(--warn)':'var(--accent2)'},
            {l:'Avg Latency',      v: healthData?.azure?.avgLatencyMs ? `${healthData.azure.avgLatencyMs}ms` : '—', c: 'var(--text)'},
          ].map((s,i)=>(
            <div key={i} style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>{s.l}</div>
              <div style={{fontWeight:800,fontSize:20,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>
        {healthData?.azure?.lastError && (
          <div style={{marginTop:14,padding:'10px 14px',background:'#fff1f0',borderRadius:8,fontSize:12,color:'var(--warn)',fontWeight:600}}>
            ⚠ Last Azure error: {healthData.azure.lastError}
          </div>
        )}
      </div>
    </div>
  );
};


const PredPage = ({hosps}) => (
  <div style={{animation:"fadeUp .4s ease"}}>
    <h2 style={{fontWeight:800,fontSize:22,marginBottom:6}}>Predictive Load Forecast</h2>
    <p style={{color:"var(--muted)",marginBottom:22,fontSize:14}}>6-variable linear model · Variables: ward occupancy, discharge rate, inbound ambulances, avg length of stay, dept bed ratio, time-of-day load · mirrored in <code style={{background:"var(--border)",padding:"1px 5px",borderRadius:4}}>backend/services/capacityService.js</code></p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,marginBottom:24}}>
      {hosps.map((h,i)=>{
        const pred=PredictiveService.predict(h);
        return(
          <div key={h.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20,animation:`scaleIn .4s ease ${i*.06}s both`}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>{h.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div style={{background:"var(--bg)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase"}}>Now</div><div style={{fontWeight:800,fontSize:26,color:pred.curr>85?"var(--warn)":"var(--text)"}}>{pred.curr}%</div></div>
              <div style={{background:pred.p60>85?"#fff1f0":"var(--bg)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--muted)",fontWeight:700,textTransform:"uppercase"}}>In 60 min</div><div style={{fontWeight:800,fontSize:26,color:pred.p60>85?"var(--warn)":"var(--accent2)"}}>{pred.p60}%</div></div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,marginBottom:8}}>
              <span style={{color:pred.trend==="up"?"var(--warn)":"var(--accent2)"}}>{pred.trend==="up"?"📈 Increasing":"📉 Decreasing"}</span>
              <span style={{color:"var(--muted)"}}>Conf. {Math.round(pred.conf*100)}%</span>
            </div>
            <Bar v={pred.p60}/>
          </div>
        );
      })}
    </div>
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
      <div style={{fontWeight:700,fontSize:14,color:"var(--accent)",marginBottom:10}}>🔵 Azure ML Integration Point</div>
      <p style={{color:"var(--muted)",fontSize:13,lineHeight:1.7}}>Replace <code style={{background:"var(--bg)",padding:"2px 6px",borderRadius:4,fontSize:12}}>PredictiveService.predict()</code> with a <code style={{background:"var(--bg)",padding:"2px 6px",borderRadius:4,fontSize:12}}>fetch()</code> call to your Azure ML managed endpoint. ARIMA/LSTM trained on historical EHR telemetry. Interface contract is identical — no UI changes needed.</p>
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
    osrm   = {},
    server = {},
  } = healthData || {};

  const statusColor = s => ({
    ok:       '#059669',
    degraded: '#d97706',
    down:     'var(--warn)',
    unknown:  'var(--muted)',
    not_used: 'var(--accent)',
    external: 'var(--accent)',
  })[s] || 'var(--muted)';

  const statusBg = s => ({
    ok:       '#ecfdf5',
    degraded: '#fffbeb',
    down:     '#fff1f0',
    unknown:  '#f8fafc',
    not_used: '#eff6ff',
    external: '#eff6ff',
  })[s] || '#f8fafc';

  const deps = [
    {
      name:    'Azure AI Language (Text Analytics for Health)',
      icon:    '🤖',
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
      icon:    '🗺',
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
      icon:    '🖥',
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
        <span style={{fontSize:12,color:'var(--muted)'}}>External dependency status · risk identification &amp; mitigation</span>
      </div>
      <p style={{color:'var(--muted)',fontSize:13,marginBottom:22}}>
        Each dependency below is classified by its current status, failure mode, and the mitigation already in place.
        This view demonstrates the risk thinking behind the architecture.
      </p>

      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {deps.map((d,i) => (
          <div key={i} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:22,animation:`fadeUp .4s ease ${i*.07}s both`}}>
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
                <div key={j} style={{background:'var(--bg)',borderRadius:7,padding:'8px 12px'}}>
                  <div style={{fontSize:10,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>{m.l}</div>
                  <div style={{fontWeight:700,fontSize:13}}>{String(m.v)}</div>
                </div>
              ))}
            </div>

            {/* Last error */}
            {d.lastError && (
              <div style={{marginBottom:12,padding:'10px 14px',background:'#fff1f0',borderRadius:8,fontSize:12,color:'var(--warn)',fontWeight:600}}>
                ⚠ Last error: {d.lastError}
              </div>
            )}

            {/* Risk + mitigation */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{background:'#fff8ed',borderRadius:8,padding:'11px 14px'}}>
                <div style={{fontSize:10.5,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>⚠ Risk</div>
                <div style={{fontSize:12,color:'#78350f',lineHeight:1.6}}>{d.risk}</div>
              </div>
              <div style={{background:'#ecfdf5',borderRadius:8,padding:'11px 14px'}}>
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
    <p style={{color:"var(--muted)",marginBottom:20,fontSize:14}}>IoT Hub simulation · Updates every 3s · Azure IoT Hub integration point</p>
    <div style={{background:"#0a1628",borderRadius:"var(--r)",padding:22,fontFamily:"monospace",fontSize:12.5,lineHeight:1.9,color:"#94a3b8",maxHeight:440,overflow:"auto",marginBottom:20}}>
      {hosps.map(h=>(
        <div key={h.id} style={{marginBottom:4}}>
          <span style={{color:"#60a5fa"}}>[{now.toLocaleTimeString()}]</span>{" "}
          <span style={{color:"#34d399"}}>{h.id}</span>{" "}
          <span style={{color:h.status==="saturated"?"#f87171":"#a78bfa"}}>status={h.status}</span>{" "}
          <span style={{color:"#fcd34d"}}>occ={((h.occ/h.beds)*100).toFixed(1)}%</span>{" "}
          beds={h.occ}/{h.beds} icu={h.icuO}/{h.icuT} emg={h.emgO}/{h.emgT}
        </div>
      ))}
      <div style={{color:"#4ade80",marginTop:10}}>{">"} Heartbeat OK — {hosps.length} nodes — {now.toISOString()}</div>
    </div>
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:20}}>
      <div style={{fontWeight:700,fontSize:14,color:"var(--accent)",marginBottom:10}}>🔵 Azure IoT Hub Integration Point</div>
      <p style={{color:"var(--muted)",fontSize:13,lineHeight:1.7}}>In production, replace the <code style={{background:"var(--bg)",padding:"2px 6px",borderRadius:4,fontSize:12}}>setInterval</code> with a <strong>SignalR / WebSocket</strong> subscription to Azure IoT Hub → Stream Analytics → Cosmos DB change feed. Same React state update, zero UI changes needed.</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [view,setView]=useState("landing");
  const [initialSymptoms,setInitialSymptoms]=useState("");

  return(
    <>
      <style>{CSS}</style>

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