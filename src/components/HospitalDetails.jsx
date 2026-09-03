import React from 'react';
import { X, CheckCircle, Clock, Users, Activity, PhoneCall, Navigation } from 'lucide-react';

const HospitalDetails = ({ hospital, onClose }) => {
  if (!hospital) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 p-4 sm:p-6 flex justify-between items-start z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">{hospital.name}</h2>
            <p className="text-zinc-400 text-sm flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5" />
              {hospital.address}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
              <div className="text-zinc-400 text-xs mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Occupancy</div>
              <div className="text-lg font-bold text-white">
                {Math.round((hospital.occ / hospital.beds) * 100)}%
              </div>
              <div className="text-xs text-zinc-500">{hospital.occ} / {hospital.beds} beds</div>
            </div>
            
            <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
              <div className="text-zinc-400 text-xs mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> ICU Status</div>
              <div className="text-lg font-bold text-white">
                {Math.round((hospital.icuO / hospital.icuT) * 100)}%
              </div>
              <div className="text-xs text-zinc-500">{hospital.icuT - hospital.icuO} available</div>
            </div>

            <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
              <div className="text-zinc-400 text-xs mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> Emergency</div>
              <div className="text-lg font-bold text-white">
                {Math.round((hospital.emgO / hospital.emgT) * 100)}%
              </div>
              <div className="text-xs text-zinc-500">{hospital.emgT - hospital.emgO} available</div>
            </div>

            <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
              <div className="text-zinc-400 text-xs mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Avg Wait</div>
              <div className="text-lg font-bold text-white">
                {Math.round(hospital.avgLosHours * 0.5)} mins
              </div>
              <div className="text-xs text-zinc-500">Estimated triage</div>
            </div>
          </div>

          {/* Departments */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">Available Departments</h3>
            <div className="flex flex-wrap gap-2">
              {hospital.depts.map(dept => (
                <span key={dept} className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-sm font-medium">
                  {dept}
                </span>
              ))}
            </div>
          </div>
          
          {/* Capabilities */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">Facilities</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 rounded bg-zinc-800/30">
                <CheckCircle className={hospital.emergencyAvailable ? "text-green-500 w-4 h-4" : "text-zinc-500 w-4 h-4"} />
                <span className={hospital.emergencyAvailable ? "text-zinc-200 text-sm" : "text-zinc-500 text-sm"}>24/7 Emergency Ward</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-zinc-800/30">
                <CheckCircle className={hospital.ambulanceAvailable ? "text-green-500 w-4 h-4" : "text-zinc-500 w-4 h-4"} />
                <span className={hospital.ambulanceAvailable ? "text-zinc-200 text-sm" : "text-zinc-500 text-sm"}>Advanced Life Support Ambulance</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4 flex gap-3">
          <a 
            href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.coords.lat},${hospital.coords.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            <Navigation className="w-4 h-4" />
            Get Directions
          </a>
          <button 
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors border border-zinc-700"
            onClick={() => alert(`Calling ${hospital.name}...`)}
          >
            <PhoneCall className="w-4 h-4" />
            Contact
          </button>
        </div>
      </div>
    </div>
  );
};

export default HospitalDetails;
