import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, ShieldCheck, ShieldAlert, Folder, RefreshCw, Download, CheckCircle2, Loader2, ExternalLink } from 'lucide-react'
import { useAppUpdater } from '@/lib/useAppUpdater'
import { LicenseView, type LicenseState } from './LicenseView'

export function SettingsView({ onLicenseChange }: { onLicenseChange?: (state: LicenseState) => void }) {
  const [exclusions, setExclusions] = useState<string[]>([])
  const [newPath, setNewPath] = useState('')
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const { status, availableVersion, progress, error, checkForUpdate, installUpdate, getCurrentVersion } = useAppUpdater()

  // Full Disk Access status. The onboarding modal (FdaModal) only ever
  // appears once -- if a user skips it there's previously been no way back
  // in short of clearing localStorage/reinstalling.
  const [fdaGranted, setFdaGranted] = useState<boolean | null>(null)
  const [checkingFda, setCheckingFda] = useState(false)

  const checkFda = async () => {
    setCheckingFda(true)
    try {
      const granted = await invoke<boolean>('check_fda_status')
      setFdaGranted(granted)
    } catch (e) {
      console.error(e)
    } finally {
      setCheckingFda(false)
    }
  }

  useEffect(() => { checkFda() }, [])

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
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full min-h-0">
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
      
      <div className="flex-1 min-h-0 overflow-auto p-8">
        <div className="max-w-2xl">
          <section className="mb-8 p-5 rounded-2xl border border-white/10 bg-white/[.03]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className={`p-3 rounded-xl border ${fdaGranted ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Full Disk Access</h3>
                  <p className="text-sm text-neutral-400 mt-1">Required to scan hidden system folders and find every reclaimable file.</p>
                </div>
              </div>
              {fdaGranted && <CheckCircle2 className="text-emerald-400 mt-1" size={22} />}
            </div>
            <div className="mt-4 flex items-center gap-3">
              {!fdaGranted && (
                <button
                  onClick={() => invoke('open_fda_settings').catch(console.error)}
                  className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-sm"
                >
                  Open System Settings <ExternalLink size={13} />
                </button>
              )}
              <Button onClick={checkFda} disabled={checkingFda} variant="outline" size="sm" className="border-white/10 text-white bg-transparent ml-auto">
                {checkingFda ? <Loader2 size={15} className="animate-spin" /> : (fdaGranted ? 'Re-check' : 'Check Access')}
              </Button>
            </div>
          </section>

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
