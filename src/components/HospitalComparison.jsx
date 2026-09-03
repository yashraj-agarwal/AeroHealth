import React from 'react';
import { X, CheckCircle, Navigation } from 'lucide-react';

const HospitalComparison = ({ hospitals, onClose }) => {
  if (!hospitals || hospitals.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-zinc-900/90 backdrop-blur border-b border-zinc-800 p-4 flex justify-between items-center z-10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Compare Hospitals</h2>
            <p className="text-zinc-400 text-sm">Comparing {hospitals.length} options</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Table */}
        <div className="overflow-auto p-4 flex-1">
          <div className="min-w-[700px]">
            {/* Headers row */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="font-semibold text-zinc-400 self-end pb-2">Metrics</div>
              {hospitals.map(h => (
                <div key={h.id} className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
                  <h3 className="font-bold text-white text-lg leading-tight mb-1">{h.name}</h3>
                  <p className="text-zinc-400 text-sm mb-3 h-10">{h.area}</p>
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${h.coords.lat},${h.coords.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex justify-center items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 text-sm font-semibold py-2 px-3 rounded-lg transition-colors border border-blue-500/20"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Route
                  </a>
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="space-y-2">
              <ComparisonRow 
                label="Overall Occupancy"
                hospitals={hospitals}
                renderValue={h => {
                  const pct = Math.round((h.occ / h.beds) * 100);
                  return (
                    <div>
                      <span className={pct > 85 ? 'text-red-400 font-bold' : pct > 65 ? 'text-amber-400 font-bold' : 'text-green-400 font-bold'}>
                        {pct}%
                      </span>
                      <div className="text-xs text-zinc-500 mt-1">{h.occ}/{h.beds} beds</div>
                    </div>
                  );
                }}
              />
              
              <ComparisonRow 
                label="ICU Availability"
                hospitals={hospitals}
                renderValue={h => {
                  const avail = h.icuT - h.icuO;
                  return (
                    <div>
                      <span className={avail < 5 ? 'text-red-400 font-bold' : 'text-zinc-200 font-bold'}>
                        {avail} beds
                      </span>
                      <div className="text-xs text-zinc-500 mt-1">out of {h.icuT}</div>
                    </div>
                  );
                }}
              />
              
              <ComparisonRow 
                label="Emergency Availability"
                hospitals={hospitals}
                renderValue={h => {
                  const avail = h.emgT - h.emgO;
                  return (
                    <div>
                      <span className={avail < 5 ? 'text-red-400 font-bold' : 'text-zinc-200 font-bold'}>
                        {avail} beds
                      </span>
                      <div className="text-xs text-zinc-500 mt-1">out of {h.emgT}</div>
                    </div>
                  );
                }}
              />
              
              <ComparisonRow 
                label="Average Wait Time"
                hospitals={hospitals}
                renderValue={h => (
                  <span className="text-zinc-200">{Math.round(h.avgLosHours * 0.5)} mins</span>
                )}
              />

              <ComparisonRow 
                label="Key Departments"
                hospitals={hospitals}
                renderValue={h => (
                  <div className="flex flex-wrap gap-1">
                    {h.depts.slice(0, 4).map(d => (
                      <span key={d} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
                        {d}
                      </span>
                    ))}
                    {h.depts.length > 4 && <span className="text-[10px] text-zinc-500">+{h.depts.length - 4}</span>}
                  </div>
                )}
              />
              
              <ComparisonRow 
                label="Facilities"
                hospitals={hospitals}
                renderValue={h => (
                  <div className="space-y-1">
                    {h.emergencyAvailable && <div className="text-xs flex items-center gap-1 text-green-400"><CheckCircle className="w-3 h-3"/> 24/7 ER</div>}
                    {h.ambulanceAvailable && <div className="text-xs flex items-center gap-1 text-green-400"><CheckCircle className="w-3 h-3"/> ALS Ambulance</div>}
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ComparisonRow = ({ label, hospitals, renderValue }) => (
  <div className="grid grid-cols-4 gap-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
    <div className="text-sm font-medium text-zinc-400 self-center pl-2">{label}</div>
    {hospitals.map(h => (
      <div key={h.id} className="text-sm self-center">
        {renderValue(h)}
      </div>
    ))}
  </div>
);

export default HospitalComparison;
