import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { invoke } from '@tauri-apps/api/core'
import { TreemapViewer } from '@/components/TreemapViewer'
import { Layout } from '@/components/Layout'
import { FileListView } from '@/components/FileListView'

function App() {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'list'>('overview')

  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await invoke('scan_path', { path: '/Users/harshwardhan' })
      setScanResult(result)
    } catch (err) {
      console.error(err)
    } finally {
      setScanning(false)
    }
  }

  return (
    <Layout>
      <div className="flex flex-col h-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <header className="flex items-end justify-between pb-4 border-b border-white/5">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Analyze and reclaim your Mac's storage.
            </p>
          </div>
          
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 backdrop-blur-md">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'overview' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-white'}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('list')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-white'}`}
            >
              List View
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0">
          {activeTab === 'list' ? (
            <FileListView />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              {scanResult ? (
                <div className="w-full h-full glass rounded-2xl p-2 border border-white/10 shadow-2xl">
                  <TreemapViewer data={scanResult} />
                </div>
              ) : (
                <div className="glass p-10 rounded-3xl w-full max-w-md flex flex-col items-center space-y-8 border border-white/10 shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="text-center space-y-2 relative z-10">
                    <h3 className="text-2xl font-bold">Ready to Scan</h3>
                    <p className="text-muted-foreground text-sm">Discover what's eating your disk space.</p>
                  </div>
                  
                  <div className="w-full relative z-10">
                    <Button 
                      className="w-full text-lg h-14 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all duration-300 transform hover:scale-[1.02]"
                      onClick={handleScan}
                      disabled={scanning}
                    >
                      {scanning ? 'Scanning Disk...' : 'Start Full Scan'}
                    </Button>
                  </div>
                  
                  <p className="text-xs text-neutral-500 text-center relative z-10">
                    Requires Full Disk Access to securely analyze all directories.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default App
