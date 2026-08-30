import React from 'react';
import { useState, useEffect, useMemo } from 'react'
import { type ScanNode } from './TreemapViewer'
import { invoke } from '@tauri-apps/api/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileIcon, CheckCircle2, Trash2, Copy, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DuplicateViewProps {
  scanResult: ScanNode | null
  onDelete: (items: { path: string; size: number }[]) => void
  onWastedSizeChange?: (size: number) => void
}

interface DuplicateGroupResult {
  size: number
  paths: string[]
}

const MIN_DUPLICATE_SIZE = 1024 * 1024 // ignore files under 1MB

function DuplicateView({ scanResult, onDelete, onWastedSizeChange }: DuplicateViewProps) {
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroupResult[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Format bytes
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const runDuplicateScan = async () => {
    if (!scanResult) return
    setLoading(true)
    setHasRun(true)
    setDuplicateGroups([])
    setSelectedPaths(new Set())

    // Yield to the browser so the loading spinner actually appears before we freeze the main thread
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      // Grouping by size and hashing both happen server-side against the
      // already-scanned index -- no re-walk, no flattening the tree in JS.
      const trueDuplicates: DuplicateGroupResult[] = await invoke('find_duplicates', { minSize: MIN_DUPLICATE_SIZE })

      const mediaExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.aac', '.m4a', '.flac'])
      const finalDuplicates: DuplicateGroupResult[] = []

      for (const group of trueDuplicates) {
        const mediaPaths = group.paths.filter(p => {
          const idx = p.lastIndexOf('.')
          if (idx === -1) return false
          const ext = p.substring(idx).toLowerCase()
          return mediaExts.has(ext)
        })

        const nonMediaPaths = group.paths.filter(p => {
          const idx = p.lastIndexOf('.')
          if (idx === -1) return true
          const ext = p.substring(idx).toLowerCase()
          return !mediaExts.has(ext)
        })

        // Media files are considered duplicates anywhere
        if (mediaPaths.length > 1) {
          finalDuplicates.push({ size: group.size, paths: mediaPaths })
        }

        // Non-media files MUST be in the same parent directory to be considered duplicates
        const parentMap = new Map<string, string[]>()
        for (const p of nonMediaPaths) {
          const parentDir = p.substring(0, p.lastIndexOf('/'))
          if (!parentMap.has(parentDir)) parentMap.set(parentDir, [])
          parentMap.get(parentDir)!.push(p)
        }

        for (const pathsInSameDir of parentMap.values()) {
          if (pathsInSameDir.length > 1) {
            finalDuplicates.push({ size: group.size, paths: pathsInSameDir })
          }
        }
      }

      finalDuplicates.sort((a, b) => b.size - a.size) // largest first
      setDuplicateGroups(finalDuplicates)
    } catch (err) {
      console.error("Error finding duplicates:", err)
    } finally {
      setLoading(false)
    }
  }

  // Auto-run when scanResult changes (new disk scan or cache load)
  useEffect(() => {
    setDuplicateGroups([])
    setSelectedPaths(new Set())
    setHasRun(false)
  }, [scanResult])

  const toggleSelect = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newSelected = new Set(selectedPaths)
    if (newSelected.has(path)) newSelected.delete(path)
    else newSelected.add(path)
    setSelectedPaths(newSelected)
  }

  const handleSmartSelect = () => {
    const newSelected = new Set<string>()
    duplicateGroups.forEach(group => {
      for (let i = 1; i < group.paths.length; i++) {
        newSelected.add(group.paths[i])
      }
    })
    setSelectedPaths(newSelected)
  }

  // Every path in a group shares that group's size, so this is a cheap
  // derived map from the (bounded) duplicate results -- no tree traversal.
  const pathSizeMap = useMemo(() => {
    const map = new Map<string, number>()
    duplicateGroups.forEach(group => {
      group.paths.forEach(p => map.set(p, group.size))
    })
    return map
  }, [duplicateGroups])

  const handleDelete = () => {
    if (selectedPaths.size === 0) return
    const items = Array.from(selectedPaths).map(path => ({ path, size: pathSizeMap.get(path) || 0 }))
    onDelete(items)
    setSelectedPaths(new Set())
  }

  // Calculate total waste
  const totalWastedSize = useMemo(() => {
    return duplicateGroups.reduce((total, group) => total + group.size * (group.paths.length - 1), 0)
  }, [duplicateGroups])

  useEffect(() => {
    onWastedSizeChange?.(totalWastedSize)
  }, [totalWastedSize, onWastedSizeChange])

  const selectedSize = useMemo(() => {
    let total = 0
    Array.from(selectedPaths).forEach(path => {
      total += pathSizeMap.get(path) || 0
    })
    return total
  }, [selectedPaths, pathSizeMap])

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full">
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
            <Copy size={24} />
          </div>
          <div>
            <h2 className="font-bold text-2xl text-white">Duplicate Finder</h2>
            <p className="text-sm text-neutral-400 mt-1">Files with identical contents verified by cryptographic hashing.</p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl font-extrabold text-white">
            {formatSize(totalWastedSize)} <span className="text-lg text-neutral-500 font-medium">wasted space</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center space-x-3">
          <Button
            onClick={handleSmartSelect}
            disabled={duplicateGroups.length === 0 || loading}
            variant="outline"
            className="bg-transparent border-white/10 hover:bg-white/5 text-white"
          >
            <Sparkles size={16} className="mr-2 text-primary" />
            Smart Select
          </Button>

          <Button
            onClick={runDuplicateScan}
            disabled={loading}
            variant="outline"
            className="bg-transparent border-white/10 hover:bg-white/5 text-white"
          >
            <RefreshCw size={16} className={`mr-2 text-neutral-400 ${loading ? 'animate-spin' : ''}`} />
            Re-check
          </Button>
        </div>

        <Button
          onClick={handleDelete}
          disabled={selectedPaths.size === 0}
          className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all duration-200"
        >
          <Trash2 size={16} className="mr-2" />
          Delete Selected ({formatSize(selectedSize)})
        </Button>
      </div>

      <div className="overflow-auto flex-1 p-2 custom-scrollbar">
        {!hasRun && !loading && (
          <div className="flex flex-col items-center justify-center h-48">
            <Copy size={40} className="text-neutral-600 mb-4" />
            <p className="text-white font-medium mb-4">Find Exact Duplicate Files</p>
            <Button onClick={runDuplicateScan} className="bg-primary hover:bg-primary/90 text-white">
              Scan for Duplicates
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-48 text-primary">
            <Loader2 size={40} className="animate-spin mb-4" />
            <p className="text-white font-medium">Computing cryptographic hashes...</p>
            <p className="text-sm text-neutral-500 mt-2">This ensures 100% accuracy before deletion.</p>
          </div>
        )}

        {!loading && hasRun && duplicateGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <CheckCircle2 size={48} className="mb-4 text-green-500/50" />
            <p className="text-lg">No duplicate files found!</p>
          </div>
        )}

        {!loading && duplicateGroups.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-12"></TableHead>
                <TableHead className="text-muted-foreground font-medium">Path</TableHead>
                <TableHead className="text-right text-muted-foreground font-medium w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {duplicateGroups.slice(0, 150).map((group) => {
                return group.paths.map((path, pathIdx) => (
                  <TableRow
                    key={path}
                    className={`border-white/5 transition-colors cursor-pointer select-none group-row ${pathIdx === group.paths.length - 1 ? 'border-b-[10px] border-b-black/40' : 'border-b-0'} hover:bg-white/5`}
                    onClick={(e) => toggleSelect(path, e)}
                  >
                    <TableCell className="w-12 text-center">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedPaths.has(path) ? 'bg-primary border-primary' : 'border-white/20 group-hover:border-white/40'}`}>
                        {selectedPaths.has(path) && <CheckCircle2 size={14} className="text-white" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-lg bg-black/40 text-primary group-row-hover:scale-110 transition-transform">
                          <FileIcon size={18} />
                        </div>
                        <div className="truncate">
                          <p className="font-medium text-white truncate" title={path.split('/').pop()}>{path.split('/').pop()}</p>
                          <p className="text-xs text-neutral-500 truncate" title={path}>{path}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {pathIdx === 0 && !selectedPaths.has(path) && (
                         <span className="px-2 py-1 rounded-md bg-green-900/40 text-green-400 text-xs border border-green-500/20 font-medium">
                           Original
                         </span>
                      )}
                      {(pathIdx > 0 || selectedPaths.has(path)) && (
                         <span className="px-2 py-1 rounded-md bg-white/5 text-neutral-400 text-xs border border-white/5">
                           Duplicate
                         </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

export const DuplicateViewMemo = React.memo(DuplicateView);
export { DuplicateViewMemo as DuplicateView };
