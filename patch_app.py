import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add new state variables
new_state = """  const [isInitializing, setIsInitializing] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [derivedData, setDerivedData] = useState<{
    flatFiles: ScanNode[];
    largeFiles: ScanNode[];
    aiCaches: ScanNode[];
    leftoverData: ScanNode[];
  }>({ flatFiles: [], largeFiles: [], aiCaches: [], leftoverData: [] })"""

content = re.sub(r'const \[confirmDelete, setConfirmDelete\].*?\n', lambda m: m.group(0) + new_state + '\n', content)

# Modify the startup loadCache logic
old_load = """    // Try to load cached scan tree instantly
    invoke<ScanNode | null>('get_scan_cache')
      .then(cached => {
        if (cached) {
          setScanResult(cached)
        }
      })
      .catch(console.error)"""

new_load = """    // Try to load cached scan tree instantly
    invoke<ScanNode | null>('get_scan_cache')
      .then(cached => {
        if (cached) {
          setScanResult(cached)
        }
      })
      .catch(console.error)
      .finally(() => setIsInitializing(false))"""

content = content.replace(old_load, new_load)

# Replace the useMemo blocks with a single useEffect
memo_regex = r'  // Smart Clean useMemos\s+const flatFiles = useMemo\(\(\) => \{.*?\},\s*\[flatFiles, installedApps\]\)'
# Wait, regex for the whole block might be tricky. Let's use string find/replace from '// Smart Clean useMemos' to the end of leftoverData useMemo.

start_idx = content.find('  // Smart Clean useMemos')
end_idx = content.find('  const handleScan = async () =>')

new_processing_effect = """  // Async Data Processing (Prevents UI Freeze)
  useEffect(() => {
    if (!scanResult) return
    setIsProcessing(true)
    
    // Yield to the browser paint cycle so the "Processing" skeleton can render
    setTimeout(() => {
      const flat: ScanNode[] = []
      const traverse = (node: ScanNode) => {
        if (!node.children) {
          flat.push(node)
        } else {
          node.children.forEach(traverse)
        }
      }
      traverse(scanResult)

      const large = flat
        .filter(f => f.size > 100 * 1024 * 1024)
        .sort((a, b) => b.size - a.size)

      const ai = flat
        .filter(f => {
          const lower = f.path.toLowerCase()
          const isCacheDir = lower.includes('/.cache/') || lower.includes('/library/caches/') || 
                             lower.includes('/library/application support/') || lower.includes('/.config/') ||
                             lower.includes('/.local/share/') || lower.match(/\/\.[a-z0-9_-]+$/)
          if (!isCacheDir) return false
          
          return lower.includes('/huggingface') || lower.includes('/lm-studio') ||
                 lower.includes('/ollama') || lower.includes('/comfyui') ||
                 lower.includes('/cursor') || lower.includes('/github-copilot') ||
                 lower.includes('/.gemini') || lower.includes('/antigravity') ||
                 lower.includes('/claude') || lower.includes('/anthropic') ||
                 lower.includes('/chatgpt') || lower.includes('/openai') ||
                 lower.includes('/codeium') || lower.includes('/tabnine') ||
                 lower.includes('/continue') || lower.includes('/cody') ||
                 lower.includes('/sourcegraph') || lower.includes('/windsurf') ||
                 lower.includes('/aider') || lower.includes('/torch') ||
                 lower.includes('/tensorflow') || lower.includes('/.keras') ||
                 lower.includes('/conda') || lower.includes('/miniconda') ||
                 lower.includes('/pip') || lower.includes('/jupyter')
        })
        .sort((a, b) => b.size - a.size)

      const leftovers = flat
        .filter(f => {
          if (f.path.toLowerCase().includes('/com.apple.')) return false
          if (!f.path.includes('Library/Application Support') && !f.path.includes('Library/Caches')) return false
          const parts = f.path.split('/')
          const appName = parts.find(p => p.includes('.app') || p.includes('com.'))
          if (!appName) return false
          return !installedApps.some(app => app.toLowerCase().includes(appName.toLowerCase()))
        })
        .sort((a, b) => b.size - a.size)

      setDerivedData({ flatFiles: flat, largeFiles: large, aiCaches: ai, leftoverData: leftovers })
      setIsProcessing(false)
    }, 50)
  }, [scanResult, installedApps])
  
  const { flatFiles, largeFiles, aiCaches, leftoverData } = derivedData

"""

content = content[:start_idx] + new_processing_effect + content[end_idx:]

# Update executeDelete
old_delete = """  const executeDelete = async () => {
    if (!confirmDelete) return
    try {
      await invoke('move_to_trash', { paths: confirmDelete.paths })
      alert('Items moved to trash! Please rescan to update overview.')
    } catch (err) {
      console.error(err)
      alert(`Error deleting: ${err}`)
    }
    setConfirmDelete(null)
  }"""

new_delete = """  const executeDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await invoke('move_to_trash', { paths: confirmDelete.paths })
      // Delay alert slightly so UI updates first
      setTimeout(() => alert('Items moved to trash! Please rescan to update overview.'), 100)
    } catch (err) {
      console.error(err)
      alert(`Error deleting: ${err}`)
    } finally {
      setIsDeleting(false)
      setConfirmDelete(null)
    }
  }"""

content = content.replace(old_delete, new_delete)

# Update the ConfirmDeleteModal prop
content = content.replace(
  'totalSize={confirmDelete?.size || 0}\n      />',
  'totalSize={confirmDelete?.size || 0}\n        isDeleting={isDeleting}\n      />'
)

# Update the "Ready to scan" screen to show skeleton if initializing
old_ready = """          {!scanResult && !scanning && activeTab !== 'settings' && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm">"""

new_ready = """          {!scanResult && !scanning && activeTab !== 'settings' && isInitializing && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm p-8 animate-pulse">
              <div className="w-24 h-24 mb-6 rounded-full bg-white/5" />
              <div className="h-8 w-64 bg-white/5 rounded-lg mb-4" />
              <div className="h-4 w-96 bg-white/5 rounded-lg mb-8" />
              <div className="h-10 w-full max-w-sm bg-white/5 rounded-xl mb-4" />
            </div>
          )}
          {!scanResult && !scanning && activeTab !== 'settings' && !isInitializing && (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-black/20 backdrop-blur-sm animate-in fade-in duration-500">"""

content = content.replace(old_ready, new_ready)

# Add isProcessing overlay for main content
old_main = """          {/* Persisted Views (CSS hidden when inactive for 0ms switching) */}"""
new_main = """          {/* Loading Processing State */}
          {isProcessing && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <h3 className="text-xl font-semibold text-white">Processing Data...</h3>
              <p className="text-neutral-400 text-sm mt-2">Classifying files and organizing smart views</p>
            </div>
          )}

          {/* Persisted Views (CSS hidden when inactive for 0ms switching) */}"""
content = content.replace(old_main, new_main)

# Add Loader2 to imports if not there
if 'Loader2' not in content[:500]:
    content = content.replace('Trash2,', 'Trash2, Loader2,')

with open('src/App.tsx', 'w') as f:
    f.write(content)

