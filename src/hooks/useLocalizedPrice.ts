import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type LocalizedPrice = {
  amount: number
  currency: string
  country: string
  fallback?: boolean
}

// Fetched once per app session (not per-component) -- every consumer shares
// the same in-memory result instead of each triggering its own network call.
let cached: LocalizedPrice | null = null
let inFlight: Promise<LocalizedPrice | null> | null = null

function fetchPrice(): Promise<LocalizedPrice | null> {
  if (cached) return Promise.resolve(cached)
  if (!inFlight) {
    inFlight = invoke<LocalizedPrice>('get_localized_price')
      .then(price => { cached = price; return price })
      .catch(err => { console.error('Failed to fetch localized price', err); return null })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

/** Formats a price using the visitor's own currency, falling back to plain USD text while loading or on failure. */
export function useLocalizedPrice() {
  const [price, setPrice] = useState<LocalizedPrice | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) return
    let mounted = true
    fetchPrice().then(p => { if (mounted) { setPrice(p); setLoading(false) } })
    return () => { mounted = false }
  }, [])

  const formatted = price
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(price.amount)
    : null

  return { price, formatted, loading }
}
