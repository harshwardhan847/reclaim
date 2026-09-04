import { usePro } from '@/hooks/usePro';
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { TreemapViewerMemo as TreemapViewer, type ScanNode } from '@/components/TreemapViewer'
import { Layout } from '@/components/Layout'
import { FileListViewMemo as FileListView } from '@/components/FileListView'
import { SmartCleanViewMemo as SmartCleanView } from '@/components/SmartCleanView'
import { SettingsView } from '@/components/SettingsView'
import { AiCacheViewMemo as AiCacheView } from '@/components/AiCacheView'
import { DuplicateViewMemo as DuplicateView, type SafeDeleteItem } from '@/components/DuplicateView'
import { SearchOverlay } from '@/components/SearchOverlay'
import { FdaModal } from '@/components/FdaModal'
import { DevCleanupViewMemo as DevCleanupView, type DevDirectory } from '@/components/DevCleanupView'
import { QuickCleanView, type CombinedCleanupItem } from '@/components/QuickCleanView'
import { SystemInfoView } from '@/components/SystemInfoView'
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { UpdateBanner } from '@/components/UpdateBanner'
import { UpgradeModal } from '@/components/UpgradeModal'
import { Trash2, AlertCircle, X, HardDrive, AppWindow, Map as MapIcon, Sparkles, Loader2 } from 'lucide-react'
import { track } from '@/lib/analytics'
import { ANALYTICS_EVENTS } from '@/lib/constants'

interface ScanSummary {
  tree: ScanNode
  largeFilesSize: number
  aiCacheSize: number
}

interface DeleteResult {
  deletedPaths: string[]
  errors: string[]
}

const LARGE_FILE_MIN_SIZE = 100 * 1024 * 1024

// Removes trashed paths from a cached scan tree in place (structurally --
// returns new objects) so the treemap/search reflect a delete immediately
// instead of needing a full rescan. Mirrors remove_path_from_index on the
// Rust side: subtracts the removed size from every ancestor along the way.
function pruneTree(node: ScanNode, deleted: Set<string>): ScanNode | null {
  if (deleted.has(node.path)) return null
  if (!node.children) return node

  let removedSize = 0
  const nextChildren: ScanNode[] = []
  for (const child of node.children) {
    const pruned = pruneTree(child, deleted)
    if (pruned === null) {
      removedSize += child.size
    } else {
      if (pruned !== child) removedSize += child.size - pruned.size
      nextChildren.push(pruned)
    }
  }
  if (removedSize === 0) return node
  return { ...node, size: node.size - removedSize, children: nextChildren }
}

function pruneList<T extends { path: string }>(list: T[] | null, deleted: Set<string>): T[] | null {
  if (!list) return list
  return list.filter(item => !deleted.has(item.path))
}

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
  const [isDeletingStaged, setIsDeletingStaged] = useState(false)
  const [scanTarget, setScanTarget] = useState<string>('')
  const { license, setLicense } = usePro()
  const [upgradeBenefit, setUpgradeBenefit] = useState<string | null>(null)

  // Stable per-benefit callbacks so the memoized tab views below (which stay
  // mounted and only toggle visibility via CSS) don't re-render on every tab
  // switch just because App re-rendered with a fresh inline arrow function.
  const onUpgradeAll = useCallback(() => setUpgradeBenefit('all cleanup features'), [])
  const onUpgradeTreemap = useCallback(() => setUpgradeBenefit('treemap actions'), [])
  const onUpgradeQuickClean = useCallback(() => setUpgradeBenefit('one-click safe cleanup'), [])
  const onUpgradeFinder = useCallback(() => setUpgradeBenefit('Finder reveal and file actions'), [])
  const onUpgradeDuplicates = useCallback(() => setUpgradeBenefit('duplicate cleanup'), [])
  const onUpgradeLargeFiles = useCallback(() => setUpgradeBenefit('large-file cleanup'), [])
  const onUpgradeAiCache = useCallback(() => setUpgradeBenefit('AI cache cleanup'), [])
  const onUpgradeLeftovers = useCallback(() => setUpgradeBenefit('leftover cleanup'), [])
  const onUpgradeDevCleanup = useCallback(() => setUpgradeBenefit('developer cleanup'), [])
  const onTabChange = useCallback((tab: string) => setActiveTab(tab), [])

  // Badges we get for free from the scan itself (no tab needs to be opened
  // for these to be accurate).
  const [scanBadges, setScanBadges] = useState({ largeFilesSize: 0, aiCacheSize: 0 })
  const [overviewView, setOverviewView] = useState<'map' | 'clean'>('map')

  // Every one of these starts `null` (meaning "not fetched/scanned yet, for
  // this scan") and is fetched eagerly as soon as a scan completes -- not
  // lazily per-tab -- so the combined Quick Clean list in Overview has data
  // without the user needing to open every individual tab first. `null` vs
  // `[]` matters: it's how we tell "still scanning" apart from "ran, found
  // nothing".
  const [largeFiles, setLargeFiles] = useState<ScanNode[] | null>(null)
  const [aiCaches, setAiCaches] = useState<ScanNode[] | null>(null)
  const [leftoverData, setLeftoverData] = useState<ScanNode[] | null>(null)
  const [duplicateItems, setDuplicateItems] = useState<SafeDeleteItem[] | null>(null)
  const [devDirectories, setDevDirectories] = useState<DevDirectory[] | null>(null)

  // Bumped with a fresh array (new reference) on every successful delete so
  // DuplicateView/DevCleanupView -- which own their own result lists derived
  // from dedicated backend commands -- can prune the exact paths that were
  // just trashed instead of the parent needing to know their internals.
  const [lastDeletedPaths, setLastDeletedPaths] = useState<string[]>([])

  useEffect(() => {
    track(ANALYTICS_EVENTS.APP_LAUNCHED)
  }, [])

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

    // Default the scan target to this machine's actual home dir, falling
    // back to '/' (a real, always-valid path) rather than a hardcoded user.
    invoke<string>('get_home_dir')
      .then(home => setScanTarget(home || '/'))
      .catch(() => setScanTarget('/'))

    setIsInitializing(false)

    const unlisten = listen<number>('scan_progress', (event) => {
      setScannedBytes(event.payload)
    })
    return () => {
      unlisten.then(f => f())
    }
  }, [])

  // Fetch every smart-clean list eagerly as soon as a scan completes -- not
  // lazily per-tab -- so the combined Quick Clean list in Overview (and
  // every individual tab) has data immediately, without the user needing to
  // open each tab first. These three read from the scan index Rust already
  // cached server-side (no re-walk, no flattening a multi-million-node tree
  // in JS), so they're cheap; duplicates/dev-cleanup run their own real
  // walks and self-trigger from within DuplicateView/DevCleanupView instead.
  useEffect(() => {
    if (!scanResult) return

    invoke<ScanNode[]>('get_large_files', { minSize: LARGE_FILE_MIN_SIZE })
      .then(setLargeFiles)
      .catch(console.error)
    invoke<ScanNode[]>('get_ai_cache_files')
      .then(setAiCaches)
      .catch(console.error)
    if (installedAppsLoaded) {
      invoke<ScanNode[]>('get_leftover_candidates', { installedApps })
        .then(setLeftoverData)
        .catch(console.error)
    }
  }, [scanResult, installedApps, installedAppsLoaded])

  const handleScan = async (overrideTarget?: string) => {
    if (scanning) return;
    setActiveTab('overview')
    setScanning(true)
    setScannedBytes(0)

    // A new scan invalidates every previously fetched/derived view.
    setLargeFiles(null)
    setAiCaches(null)
    setLeftoverData(null)
    setDuplicateItems(null)
    setDevDirectories(null)
    setScanBadges({ largeFilesSize: 0, aiCacheSize: 0 })
    setScanResult(null)

    const targetPath = overrideTarget || scanTarget;
    const startedAt = Date.now()
    track(ANALYTICS_EVENTS.SCAN_STARTED, { target: targetPath, isPro: !!license?.canUsePaidFeatures })
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
      track(ANALYTICS_EVENTS.SCAN_COMPLETED, {
        target: targetPath,
        totalSizeBytes: result.tree.size,
        durationMs: Date.now() - startedAt,
      })

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
        target = await invoke('get_home_dir') || '/';
      } catch (e) { target = '/'; }
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


  const handleStageItem = useCallback((node: ScanNode) => {
    setStagedDeletes(prev => prev.find(n => n.path === node.path) ? prev : [...prev, node])
  }, [])

  const handleRemoveStaged = (path: string) => {
    setStagedDeletes(prev => {
      const next = prev.filter(n => n.path !== path)
      if (next.length === 0) setIsTrashOpen(false)
      return next
    })
  }

  // Patches every locally cached view (scan tree, badges, and the flat
  // result lists) to drop whatever the backend actually trashed, instead of
  // requiring the user to trigger a full disk rescan after every delete.
  // move_to_trash already patched its own server-side ScanIndex the same
  // way, so this just mirrors that on the frontend's copies of the data.
  const applyDeleteResult = useCallback((result: DeleteResult) => {
    if (result.deletedPaths.length === 0) return
    const deleted = new Set(result.deletedPaths)

    // Size deltas are computed up front from the current lists (rather than
    // inside a setLargeFiles/setAiCaches updater) so every setState call
    // here stays a pure function of its own previous value -- calling
    // setScanBadges as a side effect from inside another setter's updater
    // would double-apply under StrictMode's dev-mode double-invocation.
    const removedLargeSize = (largeFiles ?? []).filter(f => deleted.has(f.path)).reduce((sum, f) => sum + f.size, 0)
    const removedAiSize = (aiCaches ?? []).filter(f => deleted.has(f.path)).reduce((sum, f) => sum + f.size, 0)

    setScanResult(prev => (prev ? pruneTree(prev, deleted) : prev))
    if (removedLargeSize > 0 || removedAiSize > 0) {
      setScanBadges(b => ({
        largeFilesSize: Math.max(0, b.largeFilesSize - removedLargeSize),
        aiCacheSize: Math.max(0, b.aiCacheSize - removedAiSize),
      }))
    }
    setLargeFiles(prev => pruneList(prev, deleted))
    setAiCaches(prev => pruneList(prev, deleted))
    setLeftoverData(prev => pruneList(prev, deleted))
    setStagedDeletes(prev => prev.filter(n => !deleted.has(n.path)))
    // Lets DuplicateView/DevCleanupView -- which own their own result lists
    // sourced from separate backend commands -- prune the same paths.
    setLastDeletedPaths(result.deletedPaths)
  }, [largeFiles, aiCaches])

  const handleConfirmDelete = async () => {
    if (!license?.canUsePaidFeatures) { alert('Activate your Reclaim license to clean files.'); return }
    const paths = stagedDeletes.map(n => n.path)
    setIsDeletingStaged(true)
    try {
      const result = await invoke<DeleteResult>('move_to_trash', { paths })
      applyDeleteResult(result)
      track(ANALYTICS_EVENTS.CLEANUP_COMPLETED, {
        source: 'trash_cart',
        itemCount: result.deletedPaths.length,
        errorCount: result.errors.length,
      })
      setIsTrashOpen(false)
      if (result.errors.length > 0) {
        alert(`Moved ${result.deletedPaths.length} item(s) to trash. ${result.errors.length} failed:\n${result.errors.join('\n')}`)
      } else {
        alert('Moved to trash!')
      }
    } catch (err) {
      console.error(err)
      alert(`Error deleting: ${err}`)
    } finally {
      setIsDeletingStaged(false)
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
      const result = await invoke<DeleteResult>('move_to_trash', { paths: confirmDelete.paths })
      applyDeleteResult(result)
      track(ANALYTICS_EVENTS.CLEANUP_COMPLETED, {
        source: 'smart_clean',
        itemCount: result.deletedPaths.length,
        errorCount: result.errors.length,
      })
      // Delay alert slightly so UI updates first
      setTimeout(() => {
        if (result.errors.length > 0) {
          alert(`Moved ${result.deletedPaths.length} item(s) to trash. ${result.errors.length} failed:\n${result.errors.join('\n')}`)
        } else {
          alert('Items moved to trash!')
        }
      }, 100)
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
    duplicates: duplicateItems ? duplicateItems.reduce((acc, i) => acc + i.size, 0) : 0,
    large_files: scanBadges.largeFilesSize,
    ai_cache: scanBadges.aiCacheSize,
    leftovers: leftoverData ? leftoverData.reduce((acc, f) => acc + f.size, 0) : 0,
    dev_cleanup: devDirectories ? devDirectories.reduce((acc, d) => acc + d.size, 0) : 0,
  }

  // Quick Clean only ever shows categories that are safe to delete by their
  // very nature, with no judgment call required: duplicate copies (the
  // original is always kept), tool/model caches (they just regenerate), and
  // dev build artifacts (rebuilt on your next `npm install`/`cargo build`).
  // Large Files and App Leftovers are deliberately left out -- there's no
  // way to know if a given large file or leftover folder is safe without a
  // human looking at it, so those stay in their own tabs with a per-item
  // safety badge instead of being offered as a one-click "clean everything".
  const quickCleanLoading = aiCaches === null || duplicateItems === null || devDirectories === null
  const quickCleanItems: CombinedCleanupItem[] = [
    ...(duplicateItems ?? []).map(i => ({ path: i.path, name: i.name, size: i.size, category: 'Duplicates' as const })),
    ...(aiCaches ?? []).map(n => ({ path: n.path, name: n.name, size: n.size, category: 'AI Cache' as const })),
    ...(devDirectories ?? []).map(d => ({ path: d.path, name: d.name, size: d.size, category: 'Dev Cleanup' as const, devCategory: d.category })),
  ]

  return (
    <>
      <FdaModal />
      <UpdateBanner />
      <Layout
        activeTab={activeTab}
        onTabChange={onTabChange}
        hasScanned={!!scanResult}
        tabSizes={tabSizes}
        tabsLoading={{
          duplicates: duplicateItems === null,
          large_files: largeFiles === null,
          ai_cache: aiCaches === null,
          leftovers: leftoverData === null,
          dev_cleanup: devDirectories === null,
        }}
        onNewScan={handleNewScan}
        isScanning={scanning}

        onUpgrade={onUpgradeAll}
        onSearch={() => setIsSearchOpen(true)}
        onRescan={() => handleScan()}
      >
        <div className="flex flex-col h-full min-h-0 relative">
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
            <div className="flex-1 min-h-0 pb-4 h-full overflow-y-auto">
            <SettingsView onLicenseChange={setLicense} />
            </div>
          )}

          {activeTab === 'system_info' && (
            <div className="flex-1 min-h-0 pb-4 h-full overflow-y-auto">
              <SystemInfoView />
            </div>
          )}

          {/* Persisted Views */}
          {scanResult && !scanning && activeTab !== 'settings' && activeTab !== 'system_info' && (
            <div className="flex-1 min-h-0 relative flex flex-col pt-4">

              {/* Treemap View */}
              <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'overview' ? 'flex' : 'hidden'}`}>
                <div className="mx-1 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <div><p className="text-sm font-semibold text-white">{(Object.values(tabSizes).reduce((sum, size) => sum + size, 0) / 1e9).toFixed(2)} GB can be reclaimed</p><p className="hidden text-xs text-neutral-500 sm:block">Caches, large files, leftovers and developer artifacts found in this scan.</p></div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                      <button
                        onClick={() => setOverviewView('map')}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${overviewView === 'map' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
                      >
                        <MapIcon size={13} /> Space Map
                      </button>
                      <button
                        onClick={() => setOverviewView('clean')}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${overviewView === 'clean' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
                      >
                        <Sparkles size={13} /> Quick Clean
                      </button>
                    </div>
                    {overviewView === 'map' && (
                      <Button onClick={license?.canUsePaidFeatures ? () => setActiveTab('large_files') : () => setUpgradeBenefit('safe cleanup for the space you found')} className="bg-primary hover:bg-primary/90 text-white">{license?.canUsePaidFeatures ? 'Start Cleaning' : 'Upgrade to Reclaim It'}</Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  {overviewView === 'map' ? (
                    <TreemapViewer data={scanResult} onStageItem={handleStageItem} onDelete={handleSmartDelete} onUpgrade={onUpgradeTreemap} />
                  ) : (
                    <QuickCleanView
                      items={quickCleanItems}
                      loading={quickCleanLoading}
                      onDelete={handleSmartDelete}
                      onUpgrade={onUpgradeQuickClean}
                    />
                  )}
                </div>
              </div>

              {/* Finder View */}
              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'list' ? 'flex' : 'hidden'}`}>
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-xl font-semibold">Disk Explorer</h3>
                </div>
                <div className="flex-1 min-h-0 border border-white/5 rounded-xl overflow-hidden glass">
                   <FileListView data={scanResult} onUpgrade={onUpgradeFinder} />
                </div>
              </div>

              {/* Smart Clean Views (Kept mounted, toggled via CSS to prevent re-renders) */}
              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'duplicates' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <DuplicateView
                  scanResult={scanResult}
                  onDelete={handleSmartDelete}
                  deletedPaths={lastDeletedPaths}
                  onUpgrade={onUpgradeDuplicates}
                  onItemsChange={setDuplicateItems}
                />
                </div>
              </div>

              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'large_files' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <SmartCleanView
                  title="Large Files"
                  description="Files larger than 100MB taking up significant space."
                  icon={<HardDrive size={24} />}
                  items={largeFiles ?? []}
                  loading={largeFiles === null}
                  onDelete={handleSmartDelete}
                  category="Large Files"
                  onUpgrade={onUpgradeLargeFiles}
                />
                </div>
              </div>

              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'ai_cache' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <AiCacheView
                  items={aiCaches ?? []}
                  loading={aiCaches === null}
                  onDelete={handleSmartDelete}

                  onUpgrade={onUpgradeAiCache}
                />
                </div>
              </div>

              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'leftovers' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <SmartCleanView
                  title="App Leftovers"
                  description="Data from applications you no longer have installed."
                  icon={<AppWindow size={24} />}
                  items={leftoverData ?? []}
                  loading={leftoverData === null}
                  onDelete={handleSmartDelete}
                  category="App Leftovers"
                  onUpgrade={onUpgradeLeftovers}
                />
                </div>
              </div>

              {/* Dev Cleanup */}
              <div className={`flex-1 flex flex-col min-h-0 pb-4 ${activeTab === 'dev_cleanup' ? 'flex' : 'hidden'}`}>
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                  <DevCleanupView scanResult={scanResult} onDelete={handleSmartDelete} deletedPaths={lastDeletedPaths} onUpgrade={onUpgradeDevCleanup} onItemsChange={setDevDirectories} />
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
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className="w-full max-w-125 max-h-[80vh] flex flex-col glass border border-red-500/30 rounded-2xl shadow-2xl shadow-red-900/20 animate-in zoom-in-95 duration-200 overflow-hidden">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/20">
                <div className="flex items-center space-x-2 text-red-400">
                  <AlertCircle size={20} />
                  <h3 className="font-bold text-lg">Trash Cart</h3>
                </div>
                <button
                  onClick={() => !isDeletingStaged && setIsTrashOpen(false)}
                  disabled={isDeletingStaged}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
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
                        disabled={isDeletingStaged}
                        className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                  disabled={isDeletingStaged}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-900/50 px-6 disabled:opacity-60"
                >
                  {isDeletingStaged ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Moving to Trash...</span> : 'Move to Trash'}
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
