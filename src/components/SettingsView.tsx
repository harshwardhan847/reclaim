import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, ShieldCheck, Folder, RefreshCw, Download, CheckCircle2, Loader2 } from 'lucide-react'
import { useAppUpdater } from '@/lib/useAppUpdater'
import { LicenseView, type LicenseState } from './LicenseView'

export function SettingsView({ onLicenseChange }: { onLicenseChange?: (state: LicenseState) => void }) {
  const [exclusions, setExclusions] = useState<string[]>([])
  const [newPath, setNewPath] = useState('')
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const { status, availableVersion, progress, error, checkForUpdate, installUpdate, getCurrentVersion } = useAppUpdater()

  useEffect(() => {
    const saved = localStorage.getItem('reclaim_exclusions')
    if (saved) {
      try {
        setExclusions(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to load exclusions")
      }
    }
  }, [])

  useEffect(() => {
    getCurrentVersion().then(setCurrentVersion).catch(console.error)
  }, [getCurrentVersion])

  const saveExclusions = (paths: string[]) => {
    setExclusions(paths)
    localStorage.setItem('reclaim_exclusions', JSON.stringify(paths))
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPath.trim()) return
    // Ensure absolute path format loosely
    let path = newPath.trim()
    if (!path.startsWith('/')) {
      alert("Please enter an absolute path starting with '/'")
      return
    }
    
    if (!exclusions.includes(path)) {
      saveExclusions([...exclusions, path])
    }
    setNewPath('')
  }

  const handleRemove = (path: string) => {
    saveExclusions(exclusions.filter(p => p !== path))
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full">
      <div className="p-6 border-b border-white/5 bg-black/20">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="font-bold text-2xl text-white">Settings & Exclusions</h2>
            <p className="text-sm text-neutral-400 mt-1">Configure paths that Reclaim should never scan or delete.</p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl">
          <LicenseView onChange={onLicenseChange} />
          <h3 className="text-lg font-semibold text-white mb-2">Software Update</h3>
          <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl mb-6">
            <div>
              <p className="text-white font-medium">Reclaim {currentVersion && `v${currentVersion}`}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {status === 'idle' && 'Check for the latest version'}
                {status === 'checking' && 'Checking for updates...'}
                {status === 'up-to-date' && "You're on the latest version"}
                {status === 'available' && `Update available: v${availableVersion}`}
                {status === 'downloading' && `Downloading update... ${progress}%`}
                {status === 'installing' && 'Installing, restarting...'}
                {status === 'error' && `Update check failed: ${error}`}
              </p>
            </div>
            {status === 'available' ? (
              <Button onClick={installUpdate} className="bg-primary hover:bg-primary/90 text-white rounded-xl gap-2">
                <Download size={16} /> Update & Restart
              </Button>
            ) : (
              <Button
                onClick={checkForUpdate}
                disabled={status === 'checking' || status === 'downloading' || status === 'installing'}
                variant="outline"
                className="bg-transparent border-white/10 hover:bg-white/5 text-white rounded-xl gap-2"
              >
                {status === 'checking' || status === 'downloading' || status === 'installing' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : status === 'up-to-date' ? (
                  <CheckCircle2 size={16} className="text-green-500" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Check for Updates
              </Button>
            )}
          </div>

          <h3 className="text-lg font-semibold text-white mb-2">Hardcoded Safety Rules</h3>
          <p className="text-neutral-400 mb-6 text-sm">
            Reclaim engine automatically blocks the deletion of critical macOS paths, including <code className="bg-white/10 px-1 py-0.5 rounded text-white text-xs">/System</code>, <code className="bg-white/10 px-1 py-0.5 rounded text-white text-xs">/Library</code>, and <code className="bg-white/10 px-1 py-0.5 rounded text-white text-xs">/Applications</code>.
          </p>

          <h3 className="text-lg font-semibold text-white mb-2">Custom Excluded Paths</h3>
          <p className="text-neutral-400 mb-4 text-sm">
            Add paths to completely skip them during the disk scan. This speeds up scanning and guarantees files within are never presented for deletion.
          </p>
          
          <form onSubmit={handleAdd} className="flex space-x-2 mb-6">
            <input 
              type="text" 
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="/Users/mac/Projects/Work"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 text-white focus:outline-none focus:border-primary/50 transition-colors"
            />
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-[0_0_15px_rgba(220,38,38,0.3)] px-6">
              <Plus size={18} className="mr-2" /> Add Path
            </Button>
          </form>

          <div className="space-y-2">
            {exclusions.length === 0 && (
              <div className="text-center py-8 border border-dashed border-white/10 rounded-xl bg-black/20 text-neutral-500">
                No custom exclusions added.
              </div>
            )}
            
            {exclusions.map(path => (
              <div key={path} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl group hover:bg-white/10 transition-colors">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <Folder size={18} className="text-primary shrink-0" />
                  <span className="text-neutral-300 truncate font-mono text-sm">{path}</span>
                </div>
                <button 
                  onClick={() => handleRemove(path)}
                  className="text-neutral-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100 shrink-0"
                  title="Remove exclusion"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
