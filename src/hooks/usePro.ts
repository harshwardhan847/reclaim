// `usePro` used to run its own `setInterval(check, 1000)` per call site.
// Every tab view called it independently, and since tabs stay mounted (only
// hidden via CSS, see App.tsx), that meant up to ~9 concurrent 1s polling
// loops hitting the Tauri IPC bridge for the life of the app. It's now a
// thin re-export of the shared ProContext, which polls once for everyone.
export { useProContext as usePro } from '@/context/ProContext'
