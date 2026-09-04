import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from './ui/button'
import { CheckCircle2, KeyRound, Loader2, ExternalLink } from 'lucide-react'
import { useLocalizedPrice } from '@/hooks/useLocalizedPrice'
import { track } from '@/lib/analytics'
import { ANALYTICS_EVENTS, CHECKOUT_URL } from '@/lib/constants'

export type LicenseState = {
  status: string
  maskedKey?: string
  activationInstanceId?: string
  lastValidatedAt?: number
  canUsePaidFeatures: boolean
  message?: string
}

export function LicenseView({ onChange }: { onChange?: (state: LicenseState) => void }) {
  const [state, setState] = useState<LicenseState | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { formatted: localizedPrice } = useLocalizedPrice()

  const refresh = async () => {
    const next = await invoke<LicenseState>('get_license_state')
    setState(next)
    onChange?.(next)
  }

  useEffect(() => { refresh().catch(console.error) }, [])

  const activate = async () => {
    setBusy(true); setError('')
    track(ANALYTICS_EVENTS.LICENSE_ACTIVATE_ATTEMPTED, { source: 'settings' })
    try {
      const next = await invoke<LicenseState>('activate_license', { key })
      track(ANALYTICS_EVENTS.LICENSE_ACTIVATED, { source: 'settings' })
      setState(next); onChange?.(next); setKey('')
    } catch (err) {
      setError(String(err))
      track(ANALYTICS_EVENTS.LICENSE_ACTIVATION_FAILED, { source: 'settings', error: String(err) })
    }
    finally { setBusy(false) }
  }

  const deactivate = async () => {
    setBusy(true); setError('')
    try {
      await invoke('deactivate_license')
      track(ANALYTICS_EVENTS.LICENSE_DEACTIVATED)
      await refresh()
    }
    catch (err) { setError(String(err)) }
    finally { setBusy(false) }
  }

  const licensed = state?.canUsePaidFeatures
  return (
    <section className="mb-8 p-5 rounded-2xl border border-primary/20 bg-primary/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="p-3 rounded-xl bg-primary/20 text-primary"><KeyRound size={22} /></div>
          <div>
            <h3 className="text-lg font-semibold text-white">Reclaim License</h3>
            <p className="text-sm text-neutral-400 mt-1">Scanning is free. A lifetime license unlocks cleanup and deletion.</p>
          </div>
        </div>
        {licensed && <CheckCircle2 className="text-emerald-400 mt-1" size={22} />}
      </div>
      {licensed ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-emerald-300">Active · {state?.maskedKey}</div>
          <Button onClick={deactivate} disabled={busy} variant="outline" className="border-white/10 text-white bg-transparent">Deactivate this Mac</Button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <input value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && activate()} placeholder="Paste your Dodo license key" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 text-white focus:outline-none focus:border-primary/50" />
            <Button onClick={activate} disabled={busy || !key.trim()} className="bg-primary hover:bg-primary/90 text-white">{busy ? <Loader2 size={17} className="animate-spin" /> : 'Activate'}</Button>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-500">{localizedPrice ? `One-time purchase · ${localizedPrice}` : 'One-time purchase'}</span>
            <button onClick={() => { track(ANALYTICS_EVENTS.CHECKOUT_OPENED, { source: 'settings' }); invoke('open_checkout_url', { url: CHECKOUT_URL }).catch(err => setError(String(err))) }} className="text-primary hover:text-primary/80 inline-flex items-center gap-1">Buy a license <ExternalLink size={13} /></button>
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </section>
  )
}
