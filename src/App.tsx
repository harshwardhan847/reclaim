import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { TreemapViewer, type ScanNode } from '@/components/TreemapViewer'
import { Layout } from '@/components/Layout'
import { FileListView } from '@/components/FileListView'
import { SmartCleanView } from '@/components/SmartCleanView'
import { Trash2, AlertCircle, X, HardDrive, Cpu, AppWindow } from 'lucide-react'

function App() {
  const [scanning, setScanning] = useState(false)
  const [scannedBytes, setScannedBytes] = useState(0)
  const [scanResult, setScanResult] = useState<ScanNode | null>(null)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [stagedDeletes, setStagedDeletes] = useState<ScanNode[]>([])
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const [installedApps, setInstalledApps] = useState<string[]>([])

  useEffect(() => {
    // Fetch installed apps on mount
    invoke<string[]>('get_installed_apps').then(apps => {
      setInstalledApps(apps)
    }).catch(err => console.error("Failed to fetch installed apps:", err))

    const unlisten = listen<number>('scan_progress', (event) => {
      setScannedBytes(event.payload)
    })
    return () => {
      unlisten.then(f => f())
    }
  }, [])

  // Flatten tree helper
  const flattenTree = (root: ScanNode): ScanNode[] => {
    const flat: ScanNode[] = []
    const traverse = (node: ScanNode) => {
      flat.push(node)
      if (node.children) node.children.forEach(traverse)
    }
    traverse(root)
    return flat
  }

  // Smart Clean useMemos
  const largeFiles = useMemo(() => {
    if (!scanResult) return []
    const flat = flattenTree(scanResult)
    // Files > 100MB
    return flat.filter(n => !n.children && n.size > 100 * 1024 * 1024).sort((a, b) => b.size - a.size)
  }, [scanResult])

  const aiCaches = useMemo(() => {
    if (!scanResult) return []
    const flat = flattenTree(scanResult)
    const regex = /(gemini|antigravity|ollama|lm-studio|claude|openrouter|chat.?log|context.?file)/i
    return flat.filter(n => regex.test(n.path) && n.size > 1024 * 1024).sort((a, b) => b.size - a.size)
  }, [scanResult])

  const leftoverData = useMemo(() => {
    if (!scanResult || installedApps.length === 0) return []
    // Look for Application Support and Caches folders
    const leftovers: ScanNode[] = []
    
    const findLeftoversIn = (parentPathContains: string) => {
      const parent = flattenTree(scanResult).find(n => n.path.endsWith(parentPathContains))
      if (parent && parent.children) {
        parent.children.forEach(child => {
          // If the folder name (lowercased) doesn't fuzzily match any installed app
          const childNameLower = child.name.toLowerCase()
          // Very naive check: does any installed app name contain the folder name, or vice versa?
          const isAppInstalled = installedApps.some(app => 
            app.includes(childNameLower) || childNameLower.includes(app) || childNameLower.includes(app.replace(/\s+/g, ''))
          )
          // Exclude obvious Apple/system ones that aren't matching
          const isSystem = childNameLower.includes('apple') || childNameLower.includes('crashreporter') || childNameLower.includes('mobilesync')
          
          if (!isAppInstalled && !isSystem && child.size > 5 * 1024 * 1024) {
            leftovers.push(child)
          }
        })
      }
    }

    findLeftoversIn('Library/Application Support')
    findLeftoversIn('Library/Caches')
    
    return leftovers.sort((a, b) => b.size - a.size)
  }, [scanResult, installedApps])

  const handleScan = async () => {
    setScanning(true)
    setScannedBytes(0)
    try {
      const result = await invoke<ScanNode>('scan_path', { path: '/Users/harshwardhan' })
      setScanResult(result)
    } catch (err) {
      console.error(err)
    } finally {
      setScanning(false)
    }
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

  const handleSmartDelete = async (paths: string[]) => {
    if (!window.confirm(`Permanently delete ${paths.length} items?`)) return
    try {
      await invoke('move_to_trash', { paths })
      // To properly refresh, we'd rescan, but for now just alert.
      alert('Items moved to trash! Please rescan to update overview.')
    } catch (err) {
      console.error(err)
      alert(`Error deleting: ${err}`)
    }
  }

  const totalStagedSize = stagedDeletes.reduce((acc, curr) => acc + curr.size, 0)
  const formattedStagedSize = (totalStagedSize / 1e9).toFixed(2) + ' GB'

  return (
    <Layout activeTab={activeTab} onTabChange={(tab) => {
      console.log('Tab clicked:', tab);
      setActiveTab(tab);
    }} hasScanned={!!scanResult}>
      <div className="flex flex-col h-full relative">
        <header className="flex items-center justify-between mb-8 z-10 hidden">
          {/* Header tabs replaced by sidebar */}
        </header>

        <div className="flex-1 relative z-10 flex flex-col min-h-0 overflow-hidden">
          {!scanResult && !scanning && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm">
              <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-primary/20 to-red-900/40 flex items-center justify-center">
                <Trash2 size={40} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready to scan</h2>
              <p className="text-gray-400 mb-8 max-w-md text-center">Analyze your disk space and find junk files to reclaim gigabytes of storage safely.</p>
              
              <Button 
                className="text-lg h-14 px-8 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all duration-300 transform hover:scale-[1.02]"
                onClick={handleScan}
              >
                Start Full Scan
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

          {/* Persisted Views */}
          {scanResult && !scanning && (
            <div className="flex-1 min-h-0 relative flex flex-col pt-4">
              
              {/* Treemap View */}
              <div className={`flex-1 flex flex-col min-h-0 animate-in fade-in zoom-in-95 duration-500 pb-4 ${activeTab === 'overview' ? 'flex' : 'hidden'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Space Distribution</h3>
                  <p className="text-gray-400 text-sm">Drag boxes from the canvas to the radar trash icon</p>
                </div>
                <div className="flex-1 min-h-0">
                  <TreemapViewer data={scanResult} onStageItem={handleStageItem} />
                </div>
              </div>

              {/* Finder View */}
              <div className={`flex-1 flex flex-col min-h-0 animate-in fade-in zoom-in-95 duration-500 pb-4 ${activeTab === 'list' ? 'flex' : 'hidden'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Disk Explorer</h3>
                </div>
                <div className="h-full border border-white/5 rounded-xl overflow-hidden glass">
                   <FileListView data={scanResult} /> 
                </div>
              </div>

              {/* Smart Clean Views */}
              {activeTab === 'large_files' && (
                <div className="flex-1 flex flex-col min-h-0 animate-in fade-in zoom-in-95 duration-500 pb-4">
                  <SmartCleanView 
                    title="Large Files" 
                    description="Files larger than 100MB taking up significant space."
                    icon={<HardDrive size={24} />}
                    items={largeFiles}
                    onDelete={handleSmartDelete}
                  />
                </div>
              )}

              {activeTab === 'ai_cache' && (
                <div className="flex-1 flex flex-col min-h-0 animate-in fade-in zoom-in-95 duration-500 pb-4">
                  <SmartCleanView 
                    title="AI Cache & Logs" 
                    description="Hidden context files and caches from AI agents."
                    icon={<Cpu size={24} />}
                    items={aiCaches}
                    onDelete={handleSmartDelete}
                  />
                </div>
              )}

              {activeTab === 'leftovers' && (
                <div className="flex-1 flex flex-col min-h-0 animate-in fade-in zoom-in-95 duration-500 pb-4">
                  <SmartCleanView 
                    title="App Leftovers" 
                    description="Application Support and Cache folders for uninstalled apps. (Review carefully)"
                    icon={<AppWindow size={24} />}
                    items={leftoverData}
                    onDelete={handleSmartDelete}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Radar Trash */}
        {scanResult && !scanning && (activeTab === 'overview' || activeTab === 'list') && !isTrashOpen && (
          <div 
            id="radar-trash"
            className="absolute bottom-6 right-6 w-20 h-20 z-50 flex items-center justify-center cursor-pointer group"
            onClick={() => {
              if (stagedDeletes.length > 0) {
                setIsTrashOpen(true)
              }
            }}
          >
            {/* Pulse rings */}
            <div className="absolute inset-0 bg-red-600/30 rounded-full animate-ping opacity-75 group-hover:bg-red-500/50" />
            <div className="absolute inset-2 bg-red-600/40 rounded-full animate-pulse opacity-75" />
            
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
                  Delete Permanently
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default App
