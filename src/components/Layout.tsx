import { usePro } from '@/hooks/usePro';
import type { ReactNode } from "react";
import { useState, useEffect } from 'react'
import { LayoutDashboard, ListTree, List, Settings, Trash2, Copy, Code, Monitor, Bot, HardDrive, Home, FolderOpen, LockKeyhole, Search, RefreshCw, Loader2 } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

export function Layout({
  children,
  activeTab,
  onTabChange,
  hasScanned,
  tabSizes,
  tabsLoading,
  onNewScan,
  isScanning,
  onUpgrade,
  onSearch,
  onRescan
}: {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasScanned: boolean;
  tabSizes?: Record<string, number>;
  /** Which tabs are still being scanned/fetched in the background after a scan -- shows a spinner instead of a stale/empty badge. */
  tabsLoading?: Record<string, boolean>;
  onNewScan?: (type: 'full' | 'home' | 'custom') => void;
  isScanning?: boolean;
  onUpgrade?: () => void;
  onSearch?: () => void;
  onRescan?: () => void;
}) {
  const { isPro } = usePro();
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
    <div className="flex h-screen flex-col bg-black text-white font-sans overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-red-900/20 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      {/* Shares the native macOS title bar; traffic-light controls stay system-owned. */}
      <header
        className="relative z-[100] flex h-8 shrink-0 items-center border-b border-white/5 bg-neutral-950/90 px-5 pl-20 py-2 backdrop-blur-xl"
        data-tauri-drag-region
      >
        {/* <div className="relative z-10 flex items-center gap-2 pointer-events-none">
          <span className="text-sm font-bold tracking-wider text-neutral-200">Reclaim</span>
        </div> */}

        <button
          type="button"
          onClick={onSearch}
          className="z-10 mx-auto flex h-8 w-full min-w-0 max-w-80 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-left text-sm text-neutral-500 transition-colors hover:border-white/20 hover:bg-white/[.08]"
          data-tauri-drag-region="false"
          data-titlebar-action="true"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 truncate">Search files...</span>
          <kbd className="hidden shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400 sm:inline-block">⌘K</kbd>
        </button>

        <div className="z-10 flex shrink-0 items-center gap-1" data-tauri-drag-region="false">
          {hasScanned && <button type="button" onClick={onRescan} title="Rescan drive" data-titlebar-action="true" className="mr-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-white"><RefreshCw size={13} className={isScanning ? 'animate-spin text-primary' : ''} /><span className="hidden sm:inline">Rescan</span></button>}
          {!isPro && <button type="button" onClick={onUpgrade} data-titlebar-action="true" className="whitespace-nowrap rounded-full bg-amber-500 px-4 py-1 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-400">Upgrade to Pro</button>}
          {isPro && <span className="whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300">PRO · Active</span>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="w-56 lg:w-64 h-full shrink-0 glass border-r border-white/5 flex flex-col relative z-10">
          <nav className="flex-1 px-4 py-4 overflow-y-auto custom-scrollbar relative z-20 pointer-events-auto">
            <div className="mb-6 px-3">
              <div className="space-y-2">
                <button
                  onClick={() => !isScanning && (isPro ? onNewScan?.('full') : onUpgrade?.())}
                  disabled={isScanning}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left font-bold ${isScanning
                    ? 'opacity-30 cursor-not-allowed bg-red-900/20 text-red-700'
                    : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 cursor-pointer hover:scale-[1.02]'
                    }`}
                >
                  <HardDrive size={18} />
                  <span className="text-sm">Scan Full Mac</span>
                  {!isPro && <LockKeyhole size={15} className="ml-auto text-amber-300" />}
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
                  <span className="font-bold text-white text-sm">{tabSizes?.large_files ? formatSize(Object.values(tabSizes).reduce((a, b) => a + b, 0)) : '0 MB'}</span>
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
                  locked={!isPro}
                  loading={hasScanned && tabsLoading?.duplicates}
                  badge={tabSizes?.duplicates ? formatSize(tabSizes.duplicates) : undefined}
                />
                <NavItem
                  icon={<List size={18} />}
                  label="Large Files"
                  active={activeTab === 'large_files'}
                  onClick={() => onTabChange('large_files')}
                  disabled={!hasScanned}
                  locked={!isPro}
                  loading={hasScanned && tabsLoading?.large_files}
                  badge={tabSizes?.large_files ? formatSize(tabSizes.large_files) : undefined}
                />
                <NavItem
                  icon={<Bot size={18} />}
                  label="AI Cache & Logs"
                  active={activeTab === 'ai_cache'}
                  onClick={() => onTabChange('ai_cache')}
                  disabled={!hasScanned}
                  locked={!isPro}
                  loading={hasScanned && tabsLoading?.ai_cache}
                  badge={tabSizes?.ai_cache ? formatSize(tabSizes.ai_cache) : undefined}
                />
                <NavItem
                  icon={<Trash2 size={18} />}
                  label="App Leftovers"
                  active={activeTab === 'leftovers'}
                  onClick={() => onTabChange('leftovers')}
                  disabled={!hasScanned}
                  locked={!isPro}
                  loading={hasScanned && tabsLoading?.leftovers}
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
                  locked={!isPro}
                  loading={hasScanned && tabsLoading?.dev_cleanup}
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
        <main className="flex-1 flex flex-col relative z-10 h-full min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 relative z-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  badge,
  locked = false,
  loading = false
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  badge?: string;
  locked?: boolean;
  loading?: boolean;
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
      {loading ? (
        <span title="Still scanning in the background" className="shrink-0">
          <Loader2 size={13} className="animate-spin text-neutral-500" />
        </span>
      ) : locked ? (
        <LockKeyhole size={13} className="text-amber-300 shrink-0" />
      ) : (
        badge && <span className="text-[10px] font-semibold text-neutral-500 bg-white/5 px-1.5 py-0.5 rounded-md">{badge}</span>
      )}
    </button>
  )
}
