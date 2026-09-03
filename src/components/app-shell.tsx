import React from "react";
import { LayoutGrid, BarChart2, Folder, Users, Zap, Key, Settings, CreditCard, HelpCircle, Book, Bell, Send, ChevronRight, Activity, Map, Stethoscope, ShieldCheck, Cpu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";

interface AppShellProps {
  children: React.ReactNode;
  nav: string;
  setNav: (id: string) => void;
  onLogout?: () => void;
  pageTitle?: string;
}

export function AppShell({ children, nav, setNav, onLogout, pageTitle = "Dashboard" }: AppShellProps) {
  
  const navItems = {
    product: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutGrid className="w-4 h-4 mr-3" /> },
      { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-4 h-4 mr-3" /> },
      { id: "triage", label: "Triage Queue", icon: <Activity className="w-4 h-4 mr-3" /> },
      { id: "livemap", label: "Spatial Map", icon: <Map className="w-4 h-4 mr-3" /> },
    ],
    workspace: [
      { id: "hospitals", label: "Hospitals", icon: <Stethoscope className="w-4 h-4 mr-3" /> },
      { id: "predict", label: "Predictive Load", icon: <Zap className="w-4 h-4 mr-3" /> },
    ],
    admin: [
      { id: "syshealth", label: "System Health", icon: <ShieldCheck className="w-4 h-4 mr-3" /> },
      { id: "telemetry", label: "Telemetry", icon: <Cpu className="w-4 h-4 mr-3" /> },
    ]
  };

  const renderNav = (items: any[]) => items.map(item => (
    <button
      key={item.id}
      onClick={() => setNav(item.id)}
      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
        nav === item.id 
          ? "bg-zinc-800/50 text-zinc-100" 
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/30"
      }`}
    >
      {item.icon} {item.label}
    </button>
  ));

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800/50 bg-[#0a0a0a] flex flex-col justify-between overflow-y-auto hidden md:flex">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-transparent shrink-0">
            <LayoutGrid className="w-5 h-5 mr-3 text-zinc-300" />
            <span className="font-medium tracking-wide text-zinc-100">AeroHealth</span>
          </div>

          <div className="px-3 py-4 space-y-8">
            {/* Product Section */}
            <div>
              <div className="px-3 text-xs font-semibold text-zinc-500 mb-2">Product</div>
              <nav className="space-y-1">
                {renderNav(navItems.product)}
              </nav>
            </div>

            {/* Workspace Section */}
            <div>
              <div className="px-3 text-xs font-semibold text-zinc-500 mb-2">Workspace</div>
              <nav className="space-y-1">
                {renderNav(navItems.workspace)}
              </nav>
            </div>

            {/* Administration Section */}
            <div>
              <div className="px-3 text-xs font-semibold text-zinc-500 mb-2">Administration</div>
              <nav className="space-y-1">
                {renderNav(navItems.admin)}
              </nav>
            </div>
          </div>
        </div>

        {/* Footer Area */}
        <div className="p-4 border-t border-zinc-800/50 shrink-0">
          <div className="px-2 pb-4 border-b border-zinc-800/50 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-xs text-white">
                PR
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-zinc-200 truncate">Dr. Priya R.</div>
                <div className="text-[10px] text-zinc-500 truncate">Chief Medical Officer</div>
              </div>
              {onLogout && (
                <button onClick={onLogout} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1" title="Log out">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <a href="#" className="flex items-center px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              <HelpCircle className="w-3.5 h-3.5 mr-3" /> Help Center
            </a>
            <a href="#" className="flex items-center px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              <Book className="w-3.5 h-3.5 mr-3" /> Documentation
            </a>
          </div>
          <div className="px-2 pt-6 text-[10px] text-zinc-600">© 2026 AeroHealth LLC</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Header */}
        <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-zinc-800/50 bg-[#0a0a0a]">
          <div className="flex items-center text-sm text-zinc-400">
            <LayoutGrid className="w-4 h-4 mr-2" />
            <span className="flex items-center gap-1.5">
              <span>AeroHealth</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <span className="text-zinc-200 font-medium">{pageTitle}</span>
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-full border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all">
              <Send className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-full border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-auto bg-[#0a0a0a]">
          <div className="p-6 h-full max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
