import React from 'react';
import type { ScanNode } from './TreemapViewer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileIcon, FolderIcon, HardDriveIcon, ChevronRight, CornerUpLeft, Loader2, LockKeyhole } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

function FileListView({ data, isPro = false, onUpgrade }: { data?: ScanNode | null; isPro?: boolean; onUpgrade?: () => void }) {
  const [history, setHistory] = useState<ScanNode[]>([])
  // Directories beyond the scan's summary depth/breadth cap arrive with no
  // `children` even though they're real directories -- fetched on demand as
  // the user navigates into them, instead of shipping the whole disk tree.
  const [childrenCache, setChildrenCache] = useState<Record<string, ScanNode[]>>({})
  const [contextNode, setContextNode] = useState<ScanNode | null>(null)

  // Current folder is the last item in history, or root data
  const currentFolder = history.length > 0 ? history[history.length - 1] : data
  // Prefer the freshly-fetched full child list over the tree's preloaded one:
  // the preloaded list may be capped (with a synthetic "N more items" row) if
  // this folder has more than the summary tree's per-directory cap.
  const loadedChildren = currentFolder ? (childrenCache[currentFolder.path] ?? currentFolder.children) : undefined
  const isLoading = !!currentFolder && currentFolder.isDir !== false && loadedChildren === undefined

  useEffect(() => {
    if (!currentFolder || currentFolder.isDir === false) return
    if (childrenCache[currentFolder.path]) return
    let cancelled = false
    invoke<ScanNode[]>('get_children', { path: currentFolder.path })
      .then(kids => {
        if (!cancelled) setChildrenCache(prev => ({ ...prev, [currentFolder.path]: kids }))
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [currentFolder, childrenCache])

  const currentFiles = useMemo(() => {
    if (!loadedChildren) return []
    return [...loadedChildren].sort((a, b) => b.size - a.size)
  }, [loadedChildren])

  const navigateUp = () => {
    setHistory(prev => prev.slice(0, prev.length - 1))
  }

  const navigateTo = (index: number) => {
    setHistory(prev => prev.slice(0, index))
  }

  const handleDoubleClick = (file: ScanNode) => {
    if (file.isDir) {
      setHistory(prev => [...prev, file])
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const reveal = async () => {
    if (!contextNode) return
    if (!isPro) { onUpgrade?.(); setContextNode(null); return }
    await invoke('reveal_in_finder', { path: contextNode.path }).catch(console.error)
    setContextNode(null)
  }

  return (
    <div className="relative glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full max-h-[600px]">
      
      {/* Breadcrumb Navigation */}
      <div className="p-3 border-b border-white/5 flex items-center bg-black/20 overflow-x-auto custom-scrollbar space-x-2">
        <button 
          onClick={() => setHistory([])}
          className="flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-white/10 transition-colors text-white whitespace-nowrap"
        >
          <HardDriveIcon className="text-primary" size={16} />
          <span className="font-semibold text-sm">Macintosh HD</span>
        </button>

        {history.map((node, i) => (
          <div key={node.path} className="flex items-center space-x-2 shrink-0">
            <ChevronRight size={14} className="text-neutral-600" />
            <button 
              onClick={() => navigateTo(i + 1)}
              className="px-2 py-1 rounded hover:bg-white/10 transition-colors text-sm text-neutral-300 font-medium whitespace-nowrap"
            >
              {node.name}
            </button>
          </div>
        ))}
      </div>
      
      {/* Toolbar / Actions */}
      <div className="px-4 py-2 bg-black/10 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center space-x-2">
          <button 
            onClick={navigateUp} 
            disabled={history.length === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-colors text-neutral-300"
            title="Go up"
          >
            <CornerUpLeft size={16} />
          </button>
          <span className="text-xs text-neutral-500">
            {currentFiles.length} items
          </span>
        </div>
      </div>
      
      {/* File List */}
      <div className="overflow-auto flex-1 p-2">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">Name</TableHead>
              <TableHead className="text-muted-foreground font-medium">Type</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentFiles.slice(0, 500).map((file) => (
              <TableRow 
                key={file.path}
                className="group border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none"
                onDoubleClick={() => handleDoubleClick(file)}
                onContextMenu={(e) => { e.preventDefault(); setContextNode(file) }}
              >
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-black/40 text-primary group-hover:scale-110 transition-transform">
                      {file.isDir ? <FolderIcon size={18} /> : <FileIcon size={18} />}
                    </div>
                    <div>
                      <p className="font-medium text-white truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                      <p className="text-xs text-neutral-600">Right-click for options</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-neutral-400">
                  <span className="px-2 py-1 rounded-md bg-white/5 text-xs border border-white/5">
                    {file.isDir ? 'Directory' : 'File'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium text-white">
                  {formatSize(file.size)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <Loader2 size={28} className="animate-spin mb-3 text-primary" />
            <p>Loading folder contents...</p>
          </div>
        )}

        {!isLoading && currentFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <p>No items inside</p>
          </div>
        )}
      </div>
      {contextNode && <div className="absolute inset-0 z-30" onClick={() => setContextNode(null)} onContextMenu={e => { e.preventDefault(); setContextNode(null) }}>
        <div className="absolute right-6 top-24 w-52 rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-2xl" onClick={e => e.stopPropagation()}>
          <p className="px-3 py-2 text-xs font-semibold text-neutral-400 truncate">{contextNode.name}</p>
          <button onClick={reveal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"><LockKeyhole size={15} className={!isPro ? 'text-amber-400' : 'text-emerald-400'} />{isPro ? 'Reveal in Finder' : 'Reveal in Finder · PRO'}</button>
        </div>
      </div>}
    </div>
  )
}

export const FileListViewMemo = React.memo(FileListView);
export { FileListViewMemo as FileListView };
