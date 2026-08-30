with open('src/App.tsx', 'r') as f:
    content = f.read()

import re

# 1. Add useCallback to handleSmartDelete
old_handle_delete = """  const handleSmartDelete = async (paths: string[]) => {
    const totalSize = paths.reduce((acc, p) => {
      const file = flatFiles.find(f => f.path === p)
      return acc + (file?.size || 0)
    }, 0)
    setConfirmDelete({ paths, size: totalSize })
  }"""

new_handle_delete = """  const handleSmartDelete = useCallback(async (paths: string[]) => {
    const totalSize = paths.reduce((acc, p) => {
      const file = flatFiles.find(f => f.path === p)
      return acc + (file?.size || 0)
    }, 0)
    setConfirmDelete({ paths, size: totalSize })
  }, [flatFiles])"""

content = content.replace(old_handle_delete, new_handle_delete)

# 2. Add useCallback to onReclaimCategory for ReclaimBanner
old_reclaim = """                <ReclaimBanner
                  duplicateWaste={0}
                  aiCacheSize={tabSizes.ai_cache}
                  largeFilesSize={tabSizes.large_files}
                  leftoverSize={tabSizes.leftovers}
                  onReclaimCategory={(cat) => {
                    startTransition(() => setActiveTab(cat === 'all' ? 'overview' : cat))
                  }}
                />"""

new_reclaim = """                <ReclaimBanner
                  duplicateWaste={0}
                  aiCacheSize={tabSizes.ai_cache}
                  largeFilesSize={tabSizes.large_files}
                  leftoverSize={tabSizes.leftovers}
                  onReclaimCategory={useCallback((cat: string) => {
                    startTransition(() => setActiveTab(cat === 'all' ? 'overview' : cat))
                  }, [])}
                />"""

content = content.replace(old_reclaim, new_reclaim)

# 3. Add useMemo for the heavy views
# Wait, rather than useMemo in App.tsx which can be messy, I can just patch the components to use React.memo.

with open('src/App.tsx', 'w') as f:
    f.write(content)

