import { useState } from 'react'
import { Button } from './ui/button'
import { invoke } from '@tauri-apps/api/core'
import { Check, Crown, KeyRound, Loader2, X } from 'lucide-react'

const checkoutUrl = import.meta.env.VITE_DODO_CHECKOUT_URL || 'https://checkout.dodopayments.com/buy/RECLAIM_PRODUCT_ID'

type ActivatedLicense = { canUsePaidFeatures: boolean; status: string; maskedKey?: string }

export function UpgradeModal({ benefit, onClose, onActivated }: { benefit: string; onClose: () => void; onActivated?: (state: ActivatedLicense) => void }) {
  const [key, setKey] = useState('')
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')

  const activate = async () => {
    setActivating(true); setError('')
    try {
      const state = await invoke<ActivatedLicense>('activate_license', { key })
      onActivated?.(state)
      onClose()
    } catch (err) { setError(String(err)) }
    finally { setActivating(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button aria-label="Close upgrade dialog" className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl border border-primary/30 bg-neutral-950 p-7 shadow-2xl shadow-primary/20">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-neutral-500 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary"><Crown size={28} /></div>
        <h2 className="text-center text-2xl font-bold text-white">Unlock {benefit}</h2>
        <p className="mt-2 text-center text-sm text-neutral-400">You found the space. Pro lets you safely reclaim it.</p>
        <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-neutral-200">
          {[
            ['See and clean everything found', 'Turn recoverable space into real free storage.'],
            ['One-click bulk cleanup', 'Clean duplicates, caches, leftovers and developer junk together.'],
            ['Safe by default', 'Items move to Trash first, so cleanup stays recoverable.'],
          ].map(([title, copy]) => <div key={title} className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0 text-emerald-400" /><div><p className="font-semibold text-white">{title}</p><p className="mt-0.5 text-xs text-neutral-500">{copy}</p></div></div>)}
        </div>
        <Button onClick={() => invoke('open_checkout_url', { url: checkoutUrl }).catch(err => alert(String(err)))} className="mt-6 h-12 w-full bg-primary text-white hover:bg-primary/90">Buy Reclaim Pro · $19.99</Button>
        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[.2em] text-neutral-600"><div className="h-px flex-1 bg-white/10" />Already purchased?<div className="h-px flex-1 bg-white/10" /></div>
        <div className="flex gap-2">
          <div className="relative flex-1"><KeyRound size={16} className="absolute left-3 top-3 text-neutral-600" /><input value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && activate()} placeholder="Paste license key" className="h-11 w-full rounded-xl border border-white/10 bg-white/[.04] pl-9 pr-3 text-sm text-white outline-none focus:border-primary/60" /></div>
          <Button onClick={activate} disabled={activating || !key.trim()} variant="outline" className="h-11 border-white/10 bg-white/[.04] text-white">{activating ? <Loader2 size={16} className="animate-spin" /> : 'Activate'}</Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <p className="mt-3 text-center text-xs text-neutral-600">One-time payment · license key delivered by Dodo Payments</p>
      </div>
    </div>
  )
}
