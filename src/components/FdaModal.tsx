import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ShieldAlert, ExternalLink, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FdaModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Check if user already dismissed it forever
    if (localStorage.getItem('reclaim_skip_fda') === 'true') {
      return
    }

    checkStatus()
  }, [])

  const checkStatus = async () => {
    try {
      const status: boolean = await invoke('check_fda_status')
      if (!status) {
        setIsOpen(true)
      } else {
        setIsOpen(false)
      }
    } catch (err) {
      console.error("Error checking FDA status", err)
    }
  }

  const handleOpenSettings = async () => {
    await invoke('open_fda_settings')
  }

  const handleSkip = () => {
    localStorage.setItem('reclaim_skip_fda', 'true')
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      <div className="relative w-full max-w-lg bg-black/90 border border-white/10 rounded-2xl shadow-2xl p-8 glass overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-primary to-orange-500" />
        
        <button onClick={handleSkip} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-primary mb-2 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
            <ShieldAlert size={32} />
          </div>
          
          <h2 className="text-2xl font-bold text-white tracking-tight">Full Disk Access Required</h2>
          
          <p className="text-neutral-400 text-sm leading-relaxed max-w-sm">
            To accurately find large hidden files, duplicate caches, and system junk, Reclaim needs permission to scan your entire drive. Without this, macOS will silently hide gigabytes of wasted space.
          </p>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 w-full text-left my-4 space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <p className="text-sm text-neutral-300">Click <strong className="text-white">Open System Settings</strong> below.</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <p className="text-sm text-neutral-300">Toggle the switch next to <strong className="text-white">Reclaim</strong> to turn it on.</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <p className="text-sm text-neutral-300">Return here and click <strong className="text-white">Check Access</strong>.</p>
            </div>
          </div>

          <div className="flex flex-col w-full space-y-3 pt-2">
            <Button onClick={handleOpenSettings} className="w-full bg-primary hover:bg-red-700 text-white font-bold h-12 text-lg shadow-lg shadow-red-900/20">
              Open System Settings
              <ExternalLink size={18} className="ml-2" />
            </Button>
            
            <Button onClick={checkStatus} variant="outline" className="w-full bg-transparent border-white/10 hover:bg-white/5 text-white h-12">
              <CheckCircle2 size={18} className="mr-2 text-green-500" />
              I've granted access (Check again)
            </Button>
          </div>
          
          <button onClick={handleSkip} className="text-xs text-neutral-500 hover:text-white mt-4 underline decoration-neutral-500/50 underline-offset-4 transition-colors">
            Continue without Full Disk Access
          </button>
        </div>
      </div>
    </div>
  )
}
