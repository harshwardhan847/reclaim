import posthog from 'posthog-js'
import { POSTHOG_HOST, POSTHOG_KEY } from './constants'

const DISTINCT_ID_KEY = 'reclaim_distinct_id'

// The desktop app has no login, so a stable id persisted to localStorage is
// what ties a user's events together across launches -- this is also the id
// we later attach the license key to once they activate Pro.
function getOrCreateDistinctId(): string {
  try {
    let id = localStorage.getItem(DISTINCT_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DISTINCT_ID_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * Initializes PostHog for the desktop app. If VITE_POSTHOG_KEY isn't set
 * (e.g. not provisioned yet), this no-ops gracefully -- track() calls
 * elsewhere stay safe to call regardless, they just won't send anything.
 */
export function initAnalytics() {
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) {
      console.info('[posthog] VITE_POSTHOG_KEY is not set — analytics disabled.')
    }
    return
  }
  if (posthog.__loaded) return

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      // Tab navigation inside the app isn't page navigation, so autocapture
      // and pageview tracking would just add noise -- every event we care
      // about is fired explicitly instead.
      capture_pageview: false,
      autocapture: false,
      loaded: (ph) => ph.identify(getOrCreateDistinctId()),
    })
  } catch (err) {
    console.error('[posthog] Failed to initialize', err)
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  try {
    posthog.capture(event, properties)
  } catch (err) {
    console.error('[posthog] capture failed', err)
  }
}

// Links the anonymous local distinct id to the (masked) license key so a
// license activated on this Mac is identifiable as the same person across
// app relaunches -- called from ProContext whenever polling confirms Pro is
// active, which covers both a fresh activation and an already-licensed
// relaunch.
export function identifyLicense(maskedKey?: string) {
  if (!maskedKey) return
  try {
    posthog.identify(getOrCreateDistinctId(), { license_key_masked: maskedKey, is_pro: true })
  } catch (err) {
    console.error('[posthog] identify failed', err)
  }
}
