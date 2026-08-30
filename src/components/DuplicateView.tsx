import { useState, useEffect, useMemo } from 'react'
import { type ScanNode } from './TreemapViewer'
import { invoke } from '@tauri-apps/api/core'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileIcon, CheckCircle2, Trash2, Copy, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DuplicateViewProps {
  scanResult: ScanNode | null
  onDelete: (paths: string[]) => void
}

export function DuplicateView({ scanResult, onDelete }: DuplicateViewProps) {
  const [loading, setLoading] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<string[][]>([])
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
    setDuplicateGroups([])
    setSelectedPaths(new Set())

    // 1. Flatten tree and group by exact size (React-side)
    const sizeMap = new Map<number, string[]>()
    const flat: ScanNode[] = []
    
    const traverse = (node: ScanNode) => {
      // Only files, not directories, and ignore very small files (< 1MB) to save time
      if (!node.children && node.size > 1024 * 1024) {
        flat.push(node)
        const existing = sizeMap.get(node.size) || []
        existing.push(node.path)
        sizeMap.set(node.size, existing)
      }
      if (node.children) node.children.forEach(traverse)
    }
    traverse(scanResult)

    // 2. Extract potential duplicate groups (same size)
    const potentialGroups = Array.from(sizeMap.values()).filter(paths => paths.length > 1)

    if (potentialGroups.length === 0) {
      setDuplicateGroups([])
      setLoading(false)
      return
    }

    // 3. Call Rust to hash the actual files in these groups
    try {
      const trueDuplicates: string[][] = await invoke('find_true_duplicates', { sizeGroups: potentialGroups })
      
      const pathSizeMap = new Map<string, number>()
      flat.forEach(n => pathSizeMap.set(n.path, n.size))

      trueDuplicates.sort((a, b) => {
        const sizeA = pathSizeMap.get(a[0]) || 0
        const sizeB = pathSizeMap.get(b[0]) || 0
        return sizeB - sizeA // largest first
      })

      setDuplicateGroups(trueDuplicates)
    } catch (err) {
      console.error("Error finding duplicates:", err)
    } finally {
      setLoading(false)
    }
  }

  // Auto-run when scanResult changes (new disk scan or cache load)
  useEffect(() => {
    runDuplicateScan()
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
      for (let i = 1; i < group.length; i++) {
        newSelected.add(group[i])
      }
    })
    setSelectedPaths(newSelected)
  }

  const handleDelete = () => {
    if (selectedPaths.size === 0) return
    onDelete(Array.from(selectedPaths))
    setSelectedPaths(new Set())
  }

  // Calculate total waste
  const totalWastedSize = useMemo(() => {
    if (!scanResult) return 0
    let total = 0
    
    const flat: ScanNode[] = []
    const traverse = (node: ScanNode) => {
      flat.push(node)
      if (node.children) node.children.forEach(traverse)
    }
    traverse(scanResult)

    const pathSizeMap = new Map<string, number>()
    flat.forEach(n => pathSizeMap.set(n.path, n.size))

    duplicateGroups.forEach(group => {
      const size = pathSizeMap.get(group[0]) || 0
      total += size * (group.length - 1)
    })
    
    return total
  }, [duplicateGroups, scanResult])

  const selectedSize = useMemo(() => {
    if (!scanResult) return 0
    let total = 0
    
    const flat: ScanNode[] = []
    const traverse = (node: ScanNode) => {
      flat.push(node)
      if (node.children) node.children.forEach(traverse)
    }
    traverse(scanResult)

    const pathSizeMap = new Map<string, number>()
    flat.forEach(n => pathSizeMap.set(n.path, n.size))

    Array.from(selectedPaths).forEach(path => {
      total += pathSizeMap.get(path) || 0
    })
    return total
  }, [selectedPaths, scanResult])

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
        {loading && (
          <div className="flex flex-col items-center justify-center h-48 text-primary">
            <Loader2 size={40} className="animate-spin mb-4" />
            <p className="text-white font-medium">Computing cryptographic hashes...</p>
            <p className="text-sm text-neutral-500 mt-2">This ensures 100% accuracy before deletion.</p>
          </div>
        )}

        {!loading && duplicateGroups.length === 0 && (
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
                return group.map((path, pathIdx) => (
                  <TableRow 
                    key={path}
                    className={`border-white/5 transition-colors cursor-pointer select-none group-row ${pathIdx === group.length - 1 ? 'border-b-[10px] border-b-black/40' : 'border-b-0'} hover:bg-white/5`}
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
