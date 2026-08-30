import type { ReactNode } from "react";
import { useState, useEffect } from 'react'
import { LayoutDashboard, ListTree, List, Settings, Trash2, Copy, Code, Monitor, Bot, HardDrive, Home, FolderOpen } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

export function Layout({ 
  children, 
  activeTab, 
  onTabChange,
  hasScanned,
  tabSizes,
  onNewScan,
  isScanning
}: { 
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasScanned: boolean;
  tabSizes?: Record<string, number>;
  onNewScan?: (type: 'full' | 'home' | 'custom') => void;
  isScanning?: boolean;
}) {
  const [sysInfo, setSysInfo] = useState<any>(null)

  useEffect(() => {
    invoke('get_system_info')
      .then((res: any) => {
        if (res?.disks?.length > 0) {
          // Find root disk or use first
          const mainDisk = res.disks.find((d: any) => d.mount_point === '/') || res.disks[0];
          setSysInfo(mainDisk);
        }
      })
      .catch(console.error);
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return ''
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  
  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-red-900/20 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      {/* Sidebar */}
      <aside className="w-64 h-full glass border-r border-white/5 flex flex-col relative z-10 pt-14">
        <div 
          className="px-6 py-4 flex items-center space-x-3 cursor-grab active:cursor-grabbing" 
          data-tauri-drag-region="true"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-red-900 flex items-center justify-center shadow-lg shadow-primary/20 pointer-events-none">
            <span className="text-white font-bold text-sm pointer-events-none">R</span>
          </div>
          <span className="font-bold tracking-wider text-lg pointer-events-none">Reclaim</span>
        </div>

        <nav className="flex-1 px-4 py-4 overflow-y-auto custom-scrollbar relative z-20 pointer-events-auto">
          <div className="mb-6 px-3">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">New Scan</h3>
            <div className="space-y-2">
              <button 
                onClick={() => !isScanning && onNewScan && onNewScan('full')}
                disabled={isScanning}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left font-bold ${
                  isScanning 
                    ? 'opacity-30 cursor-not-allowed bg-red-900/20 text-red-700' 
                    : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 cursor-pointer hover:scale-[1.02]'
                }`}
              >
                <HardDrive size={18} />
                <span className="text-sm">Scan Full Mac</span>
              </button>
              
              <div className="space-y-1">
                <NavItem 
                  icon={<Home size={18} />} 
                  label="Scan Home Folder" 
                  onClick={() => !isScanning && onNewScan && onNewScan('home')}
                  disabled={isScanning}
                />
                <NavItem 
                  icon={<FolderOpen size={18} />} 
                  label="Scan Custom Folder" 
                  onClick={() => !isScanning && onNewScan && onNewScan('custom')}
                  disabled={isScanning}
                />
              </div>
            </div>
          </div>

          <div className="mb-6 px-3">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Storage Stats</h3>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs text-neutral-300">
                <span>Scanned</span>
                <span className="font-bold text-white text-sm">{tabSizes?.large_files ? formatSize(Object.values(tabSizes).reduce((a,b)=>a+b, 0)) : '0 MB'}</span>
              </div>
              <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden mt-1 relative">
                {sysInfo && (
                  <div 
                    className="bg-white/20 h-full rounded-full absolute left-0 top-0" 
                    style={{ width: `${(sysInfo.used_bytes / sysInfo.total_bytes) * 100}%` }} 
                  />
                )}
                <div className="bg-primary h-full rounded-full absolute left-0 top-0" style={{ width: '10%' }} />
              </div>
              <div className="flex justify-between items-center text-[10px] text-neutral-500 mt-1">
                <span>Total: {sysInfo ? formatSize(sysInfo.total_bytes) : '...'}</span>
                <span>Free: {sysInfo ? formatSize(sysInfo.free_bytes) : '...'}</span>
              </div>
              {hasScanned && (
                <button 
                  onClick={() => onTabChange('large_files')}
                  className="mt-2 w-full bg-primary/20 hover:bg-primary/30 text-primary hover:text-white transition-colors py-1.5 rounded-lg text-xs font-bold border border-primary/20"
                >
                  Quick Reclaim
                </button>
              )}
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Dashboard</h3>
            <div className="space-y-1">
              <NavItem 
                icon={<LayoutDashboard size={18} />} 
                label="Space Overview" 
                active={activeTab === 'overview'} 
                onClick={() => onTabChange('overview')}
              />
              <NavItem 
                icon={<ListTree size={18} />} 
                label="Disk Explorer" 
                active={activeTab === 'list'}
                onClick={() => onTabChange('list')}
                disabled={!hasScanned}
              />
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Smart Clean</h3>
            <div className="space-y-1">
              <NavItem 
                icon={<Copy size={18} />} 
                label="Duplicates" 
                active={activeTab === 'duplicates'}
                onClick={() => onTabChange('duplicates')}
                disabled={!hasScanned}
                badge={tabSizes?.duplicates ? formatSize(tabSizes.duplicates) : undefined}
              />
              <NavItem 
                icon={<List size={18} />} 
                label="Large Files" 
                active={activeTab === 'large_files'}
                onClick={() => onTabChange('large_files')}
                disabled={!hasScanned}
                badge={tabSizes?.large_files ? formatSize(tabSizes.large_files) : undefined}
              />
              <NavItem 
                icon={<Bot size={18} />} 
                label="AI Cache & Logs" 
                active={activeTab === 'ai_cache'}
                onClick={() => onTabChange('ai_cache')}
                disabled={!hasScanned}
                badge={tabSizes?.ai_cache ? formatSize(tabSizes.ai_cache) : undefined}
              />
              <NavItem 
                icon={<Trash2 size={18} />} 
                label="App Leftovers" 
                active={activeTab === 'leftovers'}
                onClick={() => onTabChange('leftovers')}
                disabled={!hasScanned}
                badge={tabSizes?.leftovers ? formatSize(tabSizes.leftovers) : undefined}
              />
            </div>
          </div>

          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Tools</h3>
            <div className="space-y-1">
              <NavItem 
                icon={<Code size={18} />} 
                label="Dev Cleanup" 
                active={activeTab === 'dev_cleanup'}
                onClick={() => onTabChange('dev_cleanup')}
                disabled={!hasScanned}
                badge={tabSizes?.dev_cleanup ? formatSize(tabSizes.dev_cleanup) : undefined}
              />
              <NavItem 
                icon={<Monitor size={18} />} 
                label="System Info" 
                active={activeTab === 'system_info'}
                onClick={() => onTabChange('system_info')}
              />
            </div>
          </div>
        </nav>

        <div className="p-4 mt-auto relative z-20 pointer-events-auto">
          <NavItem icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => onTabChange('settings')} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10 h-full overflow-hidden">
        {/* Top titlebar drag region for macOS */}
        <div 
          data-tauri-drag-region="true"
          className="h-10 w-full shrink-0 cursor-grab active:cursor-grabbing" 
        />
        
        <div className="flex-1 overflow-y-auto p-8 relative z-0">
          {children}
        </div>
      </main>
    </div>
  )
}

function NavItem({ 
  icon, 
  label, 
  active = false,
  disabled = false,
  onClick,
  badge
}: { 
  icon: ReactNode; 
  label: string; 
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  badge?: string;
}) {
  return (
    <button 
      type="button"
      onClick={() => {
        if (!disabled && onClick) onClick();
      }}
      disabled={disabled}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group text-left ${active ? 'bg-primary/20 text-white shadow-inner shadow-primary/10' : 'text-gray-400 hover:text-white hover:bg-white/5'} ${disabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-gray-400' : ''}`}
    >
      <div className={`transition-transform duration-200 ${active ? 'text-primary scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className="font-medium text-sm flex-1">{label}</span>
      {badge && <span className="text-[10px] font-semibold text-neutral-500 bg-white/5 px-1.5 py-0.5 rounded-md">{badge}</span>}
    </button>
  )
}
