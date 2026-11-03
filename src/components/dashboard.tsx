import { useState } from "react";
import { BentoPanel, CapacityGauge } from "@/components/ui/finance-bento";

interface Facility {
  id: string;
  name: string;
  status: string;
  beds: number;
  occ: number;
  icuT: number;
  icuO: number;
  emgT: number;
  emgO: number;
}

interface DashboardProps {
  hosps: Facility[];
  feed: { eta: number | null; sev: string }[];
  occupancyHistory: { at: number; percent: number }[];
  queueReceived: boolean;
  connected: boolean;
}

export function Dashboard({ hosps, feed, occupancyHistory, queueReceived, connected }: DashboardProps) {
  const [sampleLimit, setSampleLimit] = useState(30);
  const samples = occupancyHistory.slice(-sampleLimit);
  const total = (field: keyof Pick<Facility, "beds" | "occ" | "icuT" | "icuO" | "emgT" | "emgO">) =>
    hosps.reduce((sum, hospital) => sum + hospital[field], 0);
  const beds = total("beds");
  const occupied = total("occ");
  const icu = total("icuT");
  const emergency = total("emgT");
  const etas = feed.flatMap(({ eta }) => eta === null ? [] : [eta]);
  const saturated = hosps.filter(hospital => hospital.status === "saturated").length;
  const metrics = [
    ["Occupied ward beds", occupied.toLocaleString(), `Of ${beds.toLocaleString()} listed beds`],
    ["Ward occupancy", beds ? `${Math.round(occupied / beds * 100)}%` : "—", `Across ${hosps.length} facilities`],
    ["ICU beds available", (icu - total("icuO")).toLocaleString(), `Of ${icu} listed ICU beds`],
    ["Emergency beds available", (emergency - total("emgO")).toLocaleString(), `Of ${emergency} listed emergency beds`],
    ["Saturated facilities", saturated, `Of ${hosps.length} listed facilities`],
    ["Active triage cases", queueReceived ? feed.length : "—", queueReceived ? `${feed.filter(item => item.sev === "critical").length} marked critical` : "Awaiting queue data"],
    ["Mean reported ETA", etas.length ? `${Math.round(etas.reduce((sum, eta) => sum + eta, 0) / etas.length)} min` : "—", `${etas.length} cases with estimates`],
  ];
  const facilityLoad = hosps.map(hospital => ({
    ...hospital, percent: hospital.beds ? Math.round(hospital.occ / hospital.beds * 100) : 0,
  })).sort((a, b) => b.percent - a.percent);
  const first = samples[0];
  const latest = samples[samples.length - 1];
  const elapsed = first && latest ? Math.max(1, latest.at - first.at) : 1;
  const points = samples.map(point => `${4 + (point.at - first.at) / elapsed * 392},${104 - point.percent}`).join(" ");

  return (
    <div className="ops-overview">
      <div><p className="eyebrow">Network operations</p><h1>Capacity overview</h1><p className="route-area">{connected ? "Facility and queue updates from the operations server." : "Showing the last available facility snapshot."}</p></div>
      <div className="bento-lead">
        <BentoPanel>
          <div className="bento-chart-header">
            <div><h2>Occupancy trend</h2><p className="route-area">Ward occupancy observed during this session</p></div>
            <div className="bento-segment" role="group" aria-label="Occupancy trend range">
              {[10, 30].map(limit => <button key={limit} aria-pressed={sampleLimit === limit} onClick={() => setSampleLimit(limit)}>Last {limit}</button>)}
            </div>
          </div>
          {first && latest && samples.length > 1 ? <>
            <svg className="occupancy-chart" viewBox="0 0 400 108" role="img" aria-label={`Ward occupancy from ${first.percent.toFixed(1)}% to ${latest.percent.toFixed(1)}%`}>
              {[4, 54, 104].map(y => <line key={y} x1="4" x2="396" y1={y} y2={y} stroke="var(--border)"/>)}
              <polyline points={points} stroke="var(--care)" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke"/>
            </svg>
            <p className="route-area">{first.percent.toFixed(1)}% → {latest.percent.toFixed(1)}% · {samples.length} snapshots</p>
          </> : <p className="ops-empty">A trend appears after two facility updates.</p>}
        </BentoPanel>
        <CapacityGauge occupied={occupied} capacity={beds}/>
      </div>
      <dl className="ops-metrics">{metrics.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><span>{detail}</span></div>)}</dl>
      <div className="ops-charts">
        <BentoPanel>
          <h2>Facility load</h2><p className="route-area">Ward occupancy, highest first</p>
          <ol className="load-list">{facilityLoad.map(hospital => (
            <li key={hospital.id}>
              <div><span>{hospital.name}</span><strong>{hospital.percent}%</strong></div>
              <div className="load-track" aria-hidden="true"><i style={{width:`${hospital.percent}%`, background:hospital.percent >= 90 ? "var(--danger)" : hospital.percent >= 75 ? "var(--warning)" : "var(--care)"}}/></div>
            </li>
          ))}</ol>
        </BentoPanel>

        <BentoPanel>
          <h2>Queue by urgency</h2>
          {!queueReceived || !feed.length ? <p className="ops-empty">{queueReceived ? "No active triage cases." : "Awaiting queue data."}</p> :
            <dl className="queue-breakdown">{["critical", "urgent", "stable"].map(level => <div key={level}><dt>{level}</dt><dd>{feed.filter(item => item.sev === level).length}</dd></div>)}</dl>}
        </BentoPanel>
      </div>
    </div>
  );
}
