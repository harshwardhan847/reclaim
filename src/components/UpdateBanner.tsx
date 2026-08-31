import { useEffect, useState } from 'react'
import { Download, X, Loader2, RefreshCw } from 'lucide-react'
import { useAppUpdater } from '@/lib/useAppUpdater'

export function UpdateBanner() {
  const { status, availableVersion, progress, error, checkForUpdate, installUpdate } = useAppUpdater()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Silent background check on launch -- only surfaces UI if something's found.
    checkForUpdate()
  }, [checkForUpdate])

  if (dismissed) return null
  if (status !== 'available' && status !== 'downloading' && status !== 'installing' && status !== 'error') return null

  return (
    <div className="fixed bottom-6 left-6 z-[90] w-80 glass border border-primary/30 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-primary">
          {status === 'available' && <Download size={18} />}
          {(status === 'downloading' || status === 'installing') && <Loader2 size={18} className="animate-spin" />}
          {status === 'error' && <RefreshCw size={18} />}
          <span className="font-semibold text-white text-sm">
            {status === 'available' && `Update available: v${availableVersion}`}
            {status === 'downloading' && `Downloading update... ${progress}%`}
            {status === 'installing' && 'Installing, restarting...'}
            {status === 'error' && 'Update failed'}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-neutral-500 hover:text-white transition-colors shrink-0"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {status === 'error' && (
        <p className="text-xs text-neutral-500 mt-2 break-words">{error}</p>
      )}

      {status === 'available' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={installUpdate}
            className="flex-1 bg-primary hover:bg-primary/90 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
          >
            Update & Restart
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Later
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="mt-3 w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
