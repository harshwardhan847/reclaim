import { usePro } from '@/hooks/usePro';
import { useState, useEffect, useCallback, useRef, startTransition } from 'react'
import { Button } from '@/components/ui/button'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { TreemapViewer, type ScanNode } from '@/components/TreemapViewer'
import { Layout } from '@/components/Layout'
import { FileListView } from '@/components/FileListView'
import { SmartCleanView } from '@/components/SmartCleanView'
import { SettingsView } from '@/components/SettingsView'
import { AiCacheView } from '@/components/AiCacheView'
import { DuplicateView } from '@/components/DuplicateView'
import { SearchOverlay } from '@/components/SearchOverlay'
import { FdaModal } from '@/components/FdaModal'
import { DevCleanupView } from '@/components/DevCleanupView'
import { SystemInfoView } from '@/components/SystemInfoView'
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { UpdateBanner } from '@/components/UpdateBanner'
import { UpgradeModal } from '@/components/UpgradeModal'
import { Trash2, AlertCircle, X, HardDrive, AppWindow } from 'lucide-react'

interface ScanSummary {
  tree: ScanNode
  largeFilesSize: number
  aiCacheSize: number
}

const LARGE_FILE_MIN_SIZE = 100 * 1024 * 1024

function App() {
  const [scanning, setScanning] = useState(false)
  const [scannedBytes, setScannedBytes] = useState(0)
  const [scanResult, setScanResult] = useState<ScanNode | null>(null)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [stagedDeletes, setStagedDeletes] = useState<ScanNode[]>([])
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const [installedApps, setInstalledApps] = useState<string[]>([])
  const [installedAppsLoaded, setInstalledAppsLoaded] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ paths: string[], size: number } | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [scanTarget, setScanTarget] = useState<string>('/Users/harshwardhan')
  const { license, setLicense } = usePro()
  const [upgradeBenefit, setUpgradeBenefit] = useState<string | null>(null)

  // Badges we get for free from the scan itself (no tab needs to be opened
  // for these to be accurate).
  const [scanBadges, setScanBadges] = useState({ largeFilesSize: 0, aiCacheSize: 0 })
  const [duplicatesWastedSize, setDuplicatesWastedSize] = useState(0)
  const [devCleanupSize, setDevCleanupSize] = useState(0)

  // Each of these is fetched lazily, once, the first time its tab is opened
  // -- not eagerly derived from the whole tree on every scan.
  const [largeFiles, setLargeFiles] = useState<ScanNode[] | null>(null)
  const [aiCaches, setAiCaches] = useState<ScanNode[] | null>(null)
  const [leftoverData, setLeftoverData] = useState<ScanNode[] | null>(null)
  const fetchedTabs = useRef<Set<string>>(new Set())

  // Listen for Cmd+K globally
  useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    // Fetch installed apps on mount
    invoke<string[]>('get_installed_apps')
      .then(apps => setInstalledApps(apps))
      .catch(console.error)
      .finally(() => setInstalledAppsLoaded(true))

    setIsInitializing(false)

    const unlisten = listen<number>('scan_progress', (event) => {
      setScannedBytes(event.payload)
    })
    return () => {
      unlisten.then(f => f())
    }
  }, [])

  // Fetch whichever smart-clean list the active tab needs, once, the first
  // time it's opened after a scan. Everything here reads from the scan
  // index Rust already cached server-side -- no re-walk, no flattening a
  // multi-million-node tree in JS.
  useEffect(() => {
    if (!scanResult) return
    if (fetchedTabs.current.has(activeTab)) return

    if (activeTab === 'large_files') {
      fetchedTabs.current.add(activeTab)
      invoke<ScanNode[]>('get_large_files', { minSize: LARGE_FILE_MIN_SIZE })
        .then(setLargeFiles)
        .catch(console.error)
    } else if (activeTab === 'ai_cache') {
      fetchedTabs.current.add(activeTab)
      invoke<ScanNode[]>('get_ai_cache_files')
        .then(setAiCaches)
        .catch(console.error)
    } else if (activeTab === 'leftovers' && installedAppsLoaded) {
      fetchedTabs.current.add(activeTab)
      invoke<ScanNode[]>('get_leftover_candidates', { installedApps })
        .then(setLeftoverData)
        .catch(console.error)
    }
  }, [activeTab, scanResult, installedApps, installedAppsLoaded])

  const handleScan = async (overrideTarget?: string) => {
    if (scanning) return;
    setActiveTab('overview')
    setScanning(true)
    setScannedBytes(0)

    // A new scan invalidates every previously fetched/derived view.
    fetchedTabs.current = new Set()
    setLargeFiles(null)
    setAiCaches(null)
    setLeftoverData(null)
    setDuplicatesWastedSize(0)
    setScanBadges({ largeFilesSize: 0, aiCacheSize: 0 })

    const targetPath = overrideTarget || scanTarget;
    try {
      let exclusions = [];
      const saved = localStorage.getItem('reclaim_exclusions');
      if (saved) {
        try { exclusions = JSON.parse(saved); } catch (e) {}
      }

      const result = await invoke<ScanSummary>('scan_path', {
        path: targetPath,
        exclusions
      })
      setScanResult(result.tree)
      setScanBadges({ largeFilesSize: result.largeFilesSize, aiCacheSize: result.aiCacheSize })

    } catch (err) {
      console.error(err)
    } finally {
      setScanning(false)
    }
  }

  const handleNewScan = async (type: 'full' | 'home' | 'custom') => {
    let target = '/';
    if (type === 'home') {
      try {
        target = await invoke('get_home_dir') || '/Users/harshwardhan';
      } catch (e) { target = '/Users/harshwardhan'; }
    } else if (type === 'custom') {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true, title: 'Select folder to scan' })
        if (selected) {
          target = selected as string;
        } else {
          return;
        }
      } catch (e) {
        const path = prompt('Enter path to scan:', scanTarget);
        if (path) target = path;
        else return;
      }
    }
    setScanTarget(target);
    handleScan(target);
  }


  const handleStageItem = (node: ScanNode) => {
    if (!stagedDeletes.find(n => n.path === node.path)) {
      setStagedDeletes(prev => [...prev, node])
    }
  }

  const handleRemoveStaged = (path: string) => {
    setStagedDeletes(prev => {
      const next = prev.filter(n => n.path !== path)
      if (next.length === 0) setIsTrashOpen(false)
      return next
    })
  }

  const handleConfirmDelete = async () => {
    if (!license?.canUsePaidFeatures) { alert('Activate your Reclaim license to clean files.'); return }
    const paths = stagedDeletes.map(n => n.path)
    try {
      await invoke('move_to_trash', { paths })
      setStagedDeletes([])
      setIsTrashOpen(false)
      alert('Moved to trash!')
    } catch (err) {
      console.error(err)
      alert(`Error deleting: ${err}`)
    }
  }

  const handleSmartDelete = useCallback((items: { path: string; size: number }[]) => {
    if (!license?.canUsePaidFeatures) { setUpgradeBenefit('this cleanup action'); return }
    const totalSize = items.reduce((acc, i) => acc + i.size, 0)
    setConfirmDelete({ paths: items.map(i => i.path), size: totalSize })
  }, [license?.canUsePaidFeatures])

  const executeDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await invoke('move_to_trash', { paths: confirmDelete.paths })
      // Delay alert slightly so UI updates first
      setTimeout(() => alert('Items moved to trash! Please rescan to update overview.'), 100)
    } catch (err) {
      console.error(err)
      alert(`Error deleting: ${err}`)
    } finally {
      setIsDeleting(false)
      setConfirmDelete(null)
    }
  }

  const totalStagedSize = stagedDeletes.reduce((acc, curr) => acc + curr.size, 0)
  const formattedStagedSize = (totalStagedSize / 1e9).toFixed(2) + ' GB'

  const tabSizes = {
    duplicates: duplicatesWastedSize,
    large_files: scanBadges.largeFilesSize,
    ai_cache: scanBadges.aiCacheSize,
    leftovers: leftoverData ? leftoverData.reduce((acc, f) => acc + f.size, 0) : 0,
    dev_cleanup: devCleanupSize,
  }

  return (
    <>
      <FdaModal />
      <UpdateBanner />
      <Layout
        activeTab={activeTab}
        onTabChange={(tab) => {
          startTransition(() => {
            setActiveTab(tab);
          });
        }}
        hasScanned={!!scanResult}
        tabSizes={tabSizes}
        onNewScan={handleNewScan}
        isScanning={scanning}
        
        onUpgrade={() => setUpgradeBenefit('all cleanup features')}
        onSearch={() => setIsSearchOpen(true)}
        onRescan={() => handleScan()}
      >
        <div className="flex flex-col h-full relative">
        <SearchOverlay
          data={scanResult}
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onDelete={(node) => handleSmartDelete([{ path: node.path, size: node.size }])}
        />

        <div className="flex-1 relative z-10 flex flex-col min-h-0 overflow-hidden">
          {!scanResult && !scanning && activeTab !== 'settings' && isInitializing && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm p-8 animate-pulse">
              <div className="w-24 h-24 mb-6 rounded-full bg-white/5" />
              <div className="h-8 w-64 bg-white/5 rounded-lg mb-4" />
              <div className="h-4 w-96 bg-white/5 rounded-lg mb-8" />
              <div className="h-10 w-full max-w-sm bg-white/5 rounded-xl mb-4" />
            </div>
          )}
          {!scanResult && !scanning && activeTab !== 'settings' && !isInitializing && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm animate-in fade-in duration-500">
              <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-primary/20 to-red-900/40 flex items-center justify-center">
                <Trash2 size={40} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready to scan</h2>
              <p className="text-gray-400 mb-8 max-w-md text-center">Analyze your disk space and find junk files to reclaim gigabytes of storage safely.</p>

              <div className="flex items-center space-x-2 mb-6 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                <span className="text-sm text-neutral-400">Scan target:</span>
                <span className="text-sm text-white font-medium truncate max-w-[300px]">{scanTarget}</span>
                <button
                  onClick={async () => {
                    try {
                      const { open } = await import('@tauri-apps/plugin-dialog');
                      const selected = await open({ directory: true, title: 'Select folder to scan' })
                      if (selected) setScanTarget(selected as string)
                    } catch (e) {
                      console.error("Dialog error:", e);
                      const path = prompt('Enter path to scan:', scanTarget)
                      if (path) {
                        setScanTarget(path)
                      }
                    }
                  }}
                  className="text-xs text-primary hover:text-red-400 underline"
                >
                  Change
                </button>
              </div>

              <Button
                id="start-scan-btn"
                className="text-lg h-14 px-8 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all duration-300 transform hover:scale-[1.02]"
                onClick={() => license?.canUsePaidFeatures ? handleNewScan('full') : handleNewScan('home')}
              >
                {license?.canUsePaidFeatures ? 'Start Full Scan' : 'Start Free Home Scan'}
              </Button>
            </div>
          )}

          {scanning && (
            <div className="flex-1 flex flex-col items-center justify-center rounded-2xl glass">
               <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-6" />
               <h2 className="text-xl font-bold animate-pulse">Scanning Disk...</h2>
               <p className="text-gray-400 mt-2">{(scannedBytes / 1e9).toFixed(2)} GB analyzed</p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 pb-4 h-full overflow-y-auto">
            <SettingsView onLicenseChange={setLicense} />
            </div>
          )}

          {activeTab === 'system_info' && (
            <div className="flex-1 pb-4 h-full overflow-y-auto">
              <SystemInfoView />
            </div>
          )}

          {/* Persisted Views */}
          {scanResult && !scanning && activeTab !== 'settings' && activeTab !== 'system_info' && (
            <div className="flex-1 min-h-0 relative flex flex-col pt-4">

              {/* Treemap View */}
              <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'overview' ? 'flex' : 'hidden'}`}>
                <div className="mx-1 mb-3 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <div><p className="text-sm font-semibold text-white">{(Object.values(tabSizes).reduce((sum, size) => sum + size, 0) / 1e9).toFixed(2)} GB can be reclaimed</p><p className="text-xs text-neutral-500">Caches, large files, leftovers and developer artifacts found in this scan.</p></div>
                  <Button onClick={license?.canUsePaidFeatures ? () => setActiveTab('large_files') : () => setUpgradeBenefit('safe cleanup for the space you found')} className="bg-primary hover:bg-primary/90 text-white">{license?.canUsePaidFeatures ? 'Start Cleaning' : 'Upgrade to Reclaim It'}</Button>
                </div>
                <div className="flex-1 min-h-0">
                  <TreemapViewer data={scanResult} onStageItem={handleStageItem} onUpgrade={() => setUpgradeBenefit('treemap actions')} />
                </div>
              </div>

              {/* Finder View */}
              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'list' ? 'flex' : 'hidden'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Disk Explorer</h3>
                </div>
                <div className="h-full border border-white/5 rounded-xl overflow-hidden glass">
                   <FileListView data={scanResult} onUpgrade={() => setUpgradeBenefit('Finder reveal and file actions')} />
                </div>
              </div>

              {/* Smart Clean Views (Kept mounted, toggled via CSS to prevent re-renders) */}
              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'duplicates' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <DuplicateView
                  scanResult={scanResult}
                  onDelete={handleSmartDelete}
                  
                  onUpgrade={() => setUpgradeBenefit('duplicate cleanup')}
                  onWastedSizeChange={setDuplicatesWastedSize}
                />
                </div>
              </div>

              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'large_files' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <SmartCleanView
                  title="Large Files"
                  description="Files larger than 100MB taking up significant space."
                  icon={<HardDrive size={24} />}
                  items={largeFiles ?? []}
                  onDelete={handleSmartDelete}
                  
                  onUpgrade={() => setUpgradeBenefit('large-file cleanup')}
                />
                </div>
              </div>

              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'ai_cache' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <AiCacheView
                  items={aiCaches ?? []}
                  onDelete={handleSmartDelete}
                  
                  onUpgrade={() => setUpgradeBenefit('AI cache cleanup')}
                />
                </div>
              </div>

              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'leftovers' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <SmartCleanView
                  title="App Leftovers"
                  description="Data from applications you no longer have installed."
                  icon={<AppWindow size={24} />}
                  items={leftoverData ?? []}
                  onDelete={handleSmartDelete}
                  
                  onUpgrade={() => setUpgradeBenefit('leftover cleanup')}
                />
                </div>
              </div>

              {/* Dev Cleanup */}
              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'dev_cleanup' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <DevCleanupView onDelete={handleSmartDelete} onUpgrade={() => setUpgradeBenefit('developer cleanup')} onSizeChange={setDevCleanupSize} />
                </div>
              </div>
</div>
          )}
        </div>

        {/* Floating Radar Trash */}
        {scanResult && !scanning && activeTab === 'overview' && !isTrashOpen && (
          <div
            id="radar-trash"
            className="absolute bottom-6 right-6 w-20 h-20 z-50 flex items-center justify-center cursor-pointer group"
            onClick={() => {
              if (stagedDeletes.length > 0) {
                setIsTrashOpen(true)
              }
            }}
          >
            {/* Pulse rings (only worth animating when there's something staged) */}
            {stagedDeletes.length > 0 && (
              <>
                <div className="absolute inset-0 bg-red-600/30 rounded-full animate-ping opacity-75 group-hover:bg-red-500/50" />
                <div className="absolute inset-2 bg-red-600/40 rounded-full animate-pulse opacity-75" />
              </>
            )}

            {/* Core Icon */}
            <div className="absolute inset-4 bg-gradient-to-br from-red-500 to-red-900 rounded-full flex items-center justify-center shadow-lg shadow-red-900/50 border border-red-400/30 transition-transform group-hover:scale-110">
              <Trash2 className="text-white w-6 h-6" />
              {stagedDeletes.length > 0 && (
                <div className="absolute -top-3 -right-6 bg-white text-red-900 px-3 py-1 rounded-full flex items-center justify-center shadow-lg border border-red-200 whitespace-nowrap">
                  <span className="text-xs font-extrabold">{stagedDeletes.length} items • {formattedStagedSize}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trash Modal Overlay */}
        {isTrashOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[500px] max-h-[80vh] flex flex-col glass border border-red-500/30 rounded-2xl shadow-2xl shadow-red-900/20 animate-in zoom-in-95 duration-200 overflow-hidden">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/20">
                <div className="flex items-center space-x-2 text-red-400">
                  <AlertCircle size={20} />
                  <h3 className="font-bold text-lg">Trash Cart</h3>
                </div>
                <button
                  onClick={() => setIsTrashOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {stagedDeletes.map(item => (
                  <div key={item.path} className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex flex-col overflow-hidden mr-4">
                      <span className="font-medium text-gray-200 truncate" title={item.name}>{item.name}</span>
                      <span className="text-xs text-gray-500 truncate" title={item.path}>{item.path}</span>
                    </div>
                    <div className="flex items-center space-x-4 shrink-0">
                      <span className="text-sm font-semibold text-gray-400">
                        {(item.size / 1e9).toFixed(2)} GB
                      </span>
                      <button
                        onClick={() => handleRemoveStaged(item.path)}
                        className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        title="Remove from cart"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/10 bg-black/20 flex items-center justify-between">
                <div className="text-sm text-gray-300">
                  Total: <span className="font-bold text-white">{formattedStagedSize}</span>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-900/50 px-6"
                >
                  Move to Trash
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDeleteModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={executeDelete}
        itemCount={confirmDelete?.paths.length || 0}
        totalSize={confirmDelete?.size || 0}
        isDeleting={isDeleting}
      />
      {upgradeBenefit && <UpgradeModal benefit={upgradeBenefit} onClose={() => setUpgradeBenefit(null)} onActivated={(state) => { setLicense(state); setUpgradeBenefit(null) }} />}
    </Layout>
    </>
  )
}

export default App
