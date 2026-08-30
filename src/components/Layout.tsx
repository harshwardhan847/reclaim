import type { ReactNode } from 'react'
import { LayoutDashboard, ListTree, List, Settings, Trash2 } from 'lucide-react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground relative">
      
      {/* Background gradients */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-900/10 rounded-full blur-[100px]" />
      </div>

      {/* Sidebar */}
      <aside className="w-64 h-full glass border-r border-white/5 flex flex-col relative z-10 pt-14">
        <div className="px-6 py-4 flex items-center space-x-3" data-tauri-drag-region>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-red-900 flex items-center justify-center shadow-lg shadow-primary/20 pointer-events-none">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <span className="font-bold tracking-wider text-lg pointer-events-none">Reclaim</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavItem icon={<LayoutDashboard size={20} />} label="Overview" active />
          <NavItem icon={<ListTree size={20} />} label="Treemap" />
          <NavItem icon={<List size={20} />} label="List View" />
          <NavItem icon={<Trash2 size={20} />} label="Clean Junk" />
        </nav>

        <div className="p-4 mt-auto">
          <NavItem icon={<Settings size={20} />} label="Settings" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10 h-full overflow-hidden">
        {/* Top titlebar drag region for macOS */}
        <div data-tauri-drag-region className="h-10 w-full absolute top-0 left-0 z-50 cursor-grab" />
        
        <div className="flex-1 overflow-y-auto p-8 pt-12">
          {children}
        </div>
      </main>
    </div>
  )
}

function NavItem({ icon, label, active = false }: { icon: ReactNode, label: string, active?: boolean }) {
  return (
    <button 
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200
      ${active 
        ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(220,38,38,0.1)]' 
        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
      }`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </button>
  )
}
