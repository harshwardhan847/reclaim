// Central place for app-wide constants -- env-derived config and analytics
// event names both live here so no file reaches into import.meta.env or
// hardcodes an event-name string directly.

export const CHECKOUT_URL =
  import.meta.env.VITE_DODO_CHECKOUT_URL ||
  'https://checkout.dodopayments.com/buy/RECLAIM_PRODUCT_ID'

export const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
export const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

// Full conversion pipeline, in funnel order: launch the app, run a scan,
// hit a paywall, open checkout, activate (or fail to activate) a license,
// then actually use the paid cleanup features. Mirrors the event names the
// website uses for its half of the funnel (download_clicked ->
// pricing_cta_clicked) so both sides can be correlated in PostHog.
export const ANALYTICS_EVENTS = {
  APP_LAUNCHED: 'app_launched',
  SCAN_STARTED: 'scan_started',
  SCAN_COMPLETED: 'scan_completed',
  UPGRADE_MODAL_VIEWED: 'upgrade_modal_viewed',
  CHECKOUT_OPENED: 'checkout_opened',
  LICENSE_ACTIVATE_ATTEMPTED: 'license_activate_attempted',
  LICENSE_ACTIVATED: 'license_activated',
  LICENSE_ACTIVATION_FAILED: 'license_activation_failed',
  LICENSE_DEACTIVATED: 'license_deactivated',
  CLEANUP_COMPLETED: 'cleanup_completed',
} as const
