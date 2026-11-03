import type { ReactNode } from "react";

export function BentoPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`bento-panel ${className}`}>{children}</section>;
}

export function CapacityGauge({ occupied, capacity }: { occupied: number; capacity: number }) {
  const percent = capacity > 0 ? Math.round(occupied / capacity * 100) : 0;
  return (
    <BentoPanel className="bento-gauge">
      <h2>Ward capacity</h2>
      <div className="bento-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="9"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bento-accent)" strokeWidth="9"
            pathLength="100" strokeDasharray={`${percent} 100`} strokeLinecap="round" transform="rotate(-90 60 60)"/>
        </svg>
        <div><strong>{capacity ? `${percent}%` : "—"}</strong><span>Occupied</span></div>
      </div>
      <p className="route-area">{occupied.toLocaleString()} occupied of {capacity.toLocaleString()} listed beds</p>
    </BentoPanel>
  );
}
