import { useCallback, useRef, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'installing' | 'error'

export function useAppUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0) // 0-100, best-effort
  const [error, setError] = useState<string | null>(null)
  const pendingUpdate = useRef<Update | null>(null)

  const checkForUpdate = useCallback(async () => {
    setStatus('checking')
    setError(null)
    try {
      const update = await check()
      if (update?.available) {
        pendingUpdate.current = update
        setAvailableVersion(update.version)
        setStatus('available')
      } else {
        pendingUpdate.current = null
        setStatus('up-to-date')
      }
    } catch (err) {
      console.error('Update check failed:', err)
      setError(String(err))
      setStatus('error')
    }
  }, [])

  const installUpdate = useCallback(async () => {
    const update = pendingUpdate.current
    if (!update) return
    setStatus('downloading')
    setProgress(0)
    try {
      let totalBytes = 0
      let downloaded = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (totalBytes > 0) setProgress(Math.min(100, Math.round((downloaded / totalBytes) * 100)))
        } else if (event.event === 'Finished') {
          setProgress(100)
        }
      })
      setStatus('installing')
      await relaunch()
    } catch (err) {
      console.error('Update install failed:', err)
      setError(String(err))
      setStatus('error')
    }
  }, [])

  return { status, availableVersion, progress, error, checkForUpdate, installUpdate, getCurrentVersion: getVersion }
}
