import React from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

interface DashboardProps {
  hosps?: any[];
  feed?: any[];
  healthData?: any;
}

export function Dashboard({ hosps = [], feed = [] }: DashboardProps) {
  
  // Safe defaults if no data passed
  const activeHospitals = hosps.length > 0 ? hosps : [
    { id: "h1", name: "Fortis Cunningham", occ: 238, beds: 380, icuO: 14, icuT: 38, status: "accepting" },
    { id: "h2", name: "Narayana Bommasandra", occ: 512, beds: 1000, icuO: 29, icuT: 60, status: "accepting" },
    { id: "h3", name: "Apollo Jayanagar", occ: 273, beds: 350, icuO: 22, icuT: 28, status: "moderate" },
    { id: "h4", name: "Manipal Whitefield", occ: 414, beds: 440, icuO: 42, icuT: 44, status: "saturated" },
    { id: "h5", name: "Sakra Premium", occ: 219, beds: 300, icuO: 23, icuT: 32, status: "moderate" },
    { id: "h6", name: "Aster CMI", occ: 140, beds: 350, icuO: 10, icuT: 35, status: "accepting" },
  ];

  const totalPatients = activeHospitals.reduce((acc, h) => acc + h.occ, 0);
  const totalBeds = activeHospitals.reduce((acc, h) => acc + h.beds, 0);
  const avgOccupancy = Math.round((totalPatients / totalBeds) * 100) || 0;

  // Formatting for the Bar Chart
  const barData = activeHospitals.map(h => ({
    name: h.name.split(" ")[0], // short name
    occupancy: Math.round((h.occ / h.beds) * 100)
  }));

  // Dummy step chart data for Predictive Load
  const stepData = [
    { time: "08:00", load1: 45, load2: 30 },
    { time: "09:00", load1: 52, load2: 38 },
    { time: "10:00", load1: 52, load2: 38 },
    { time: "11:00", load1: 58, load2: 44 },
    { time: "12:00", load1: 65, load2: 44 },
    { time: "13:00", load1: 65, load2: 48 },
    { time: "14:00", load1: 72, load2: 55 },
    { time: "15:00", load1: 72, load2: 60 },
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Top 4 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[1px] bg-zinc-800/60 border border-zinc-800/60 rounded-xl overflow-hidden shadow-2xl">
        
        {/* Card 1 */}
        <div className="bg-[#0a0a0a] p-6 flex flex-col justify-between">
          <div className="text-sm font-medium text-zinc-400">Active Patients</div>
          <div className="mt-4 flex flex-col gap-4">
            <span className="text-3xl font-semibold text-zinc-100">{totalPatients.toLocaleString()}</span>
            <div className="flex items-center text-xs font-medium text-emerald-500">
              <ArrowUp className="w-3 h-3 mr-1" />
              <span>3.1% vs last week</span>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#0a0a0a] p-6 flex flex-col justify-between">
          <div className="text-sm font-medium text-zinc-400">System Capacity</div>
          <div className="mt-4 flex flex-col gap-4">
            <span className="text-3xl font-semibold text-zinc-100">{avgOccupancy}%</span>
            <div className="flex items-center text-xs font-medium text-emerald-500">
              <ArrowUp className="w-3 h-3 mr-1" />
              <span>12.4% vs last week</span>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#0a0a0a] p-6 flex flex-col justify-between">
          <div className="text-sm font-medium text-zinc-400">Active Triage Queue</div>
          <div className="mt-4 flex flex-col gap-4">
            <span className="text-3xl font-semibold text-zinc-100">{feed.length}</span>
            <div className="flex items-center text-xs font-medium text-rose-500">
              <ArrowDown className="w-3 h-3 mr-1" />
              <span>0.4% vs last week</span>
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-[#0a0a0a] p-6 flex flex-col justify-between">
          <div className="text-sm font-medium text-zinc-400">Avg Dispatch Time</div>
          <div className="mt-4 flex flex-col gap-4">
            <span className="text-3xl font-semibold text-zinc-100">8.2m</span>
            <div className="flex items-center text-xs font-medium text-emerald-500">
              <ArrowUp className="w-3 h-3 mr-1" />
              <span>8.7% vs last week</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="flex flex-col flex-1 min-h-[400px]">
        
        {/* Bar Chart Pane */}
        <div className="bg-[#0a0a0a] border border-zinc-800/60 rounded-xl p-6 shadow-2xl flex flex-col relative overflow-hidden h-full">
          <div className="flex flex-col gap-2 mb-8 relative z-10">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-zinc-100">Live Facility Load</h3>
            </div>
            <p className="text-sm text-zinc-500">Current real-time occupancy levels by facility.</p>
          </div>
          <div className="flex-1 w-full relative z-10 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }} barSize={50}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#71717a" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#27272a" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="barGradientWarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#b45309" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="barGradientCrit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 12}} dy={10} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip 
                  cursor={{fill: '#27272a', opacity: 0.2}} 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#f4f4f5' }} 
                />
                <Bar dataKey="occupancy" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.occupancy >= 90 ? "url(#barGradientCrit)" : entry.occupancy >= 75 ? "url(#barGradientWarn)" : "url(#barGradient)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
