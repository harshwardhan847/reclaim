import { usePro } from '@/hooks/usePro';
import React from 'react';
import { type ScanNode } from './TreemapViewer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle2, Trash2, FileIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

interface SmartCleanViewProps {
  title: string
  description: string
  items: ScanNode[]
  onDelete: (items: { path: string; size: number }[]) => void
  icon: React.ReactNode
  onUpgrade?: () => void
}

const ROW_CAP = 500

function SmartCleanView({ title, description, items, onDelete, icon, onUpgrade }: SmartCleanViewProps) {
  const { isPro } = usePro();
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const sortedItems = useMemo(() => [...items].sort((a, b) => b.size - a.size), [items])
  const visibleItems = useMemo(() => sortedItems.slice(0, ROW_CAP), [sortedItems])

  const recoverableSize = useMemo(() => items.reduce((acc, item) => acc + item.size, 0), [items])

  const selectedSize = useMemo(() => {
    return items.filter(i => selected.has(i.path)).reduce((acc, i) => acc + i.size, 0)
  }, [selected, items])

  const toggleAll = () => {
    if (selected.size === visibleItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visibleItems.map(i => i.path)))
    }
  }

  const toggleOne = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
  }

  const handleDeleteSelected = () => {
    if (selected.size === 0) return
    const toDelete = items.filter(i => selected.has(i.path)).map(i => ({ path: i.path, size: i.size }))
    onDelete(toDelete)
    setSelected(new Set())
  }

  const handleDeleteAll = () => {
    if (items.length === 0) return
    const toDelete = items.map(i => ({ path: i.path, size: i.size }))
    onDelete(toDelete)
    setSelected(new Set())
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
            {icon}
          </div>
          <div>
            <h2 className="font-bold text-2xl text-white">{title}</h2>
            <p className="text-sm text-neutral-400 mt-1">{description}</p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl font-extrabold text-white">
            {formatSize(recoverableSize)} <span className="text-lg text-neutral-500 font-medium">recoverable</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5">
        <button
          onClick={isPro ? toggleAll : onUpgrade}
          className="flex items-center space-x-2 text-sm text-neutral-300 hover:text-white transition-colors"
        >
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.size === visibleItems.length && visibleItems.length > 0 ? 'bg-primary border-primary' : 'border-white/20'}`}>
            {selected.size === visibleItems.length && visibleItems.length > 0 && <CheckCircle2 size={14} className="text-white" />}
          </div>
          <span>{isPro ? 'Select All' : 'Inspect cleanup · PRO'}</span>
        </button>

        <div className="flex items-center gap-2">
          {isPro && selected.size > 0 && (
            <Button
              onClick={handleDeleteSelected}
              variant="outline"
              className="h-9 px-4 bg-transparent border-white/10 hover:bg-white/5 text-white text-sm font-bold"
            >
              <Trash2 size={16} className="mr-2" />
              Delete Selected ({formatSize(selectedSize)})
            </Button>
          )}
          <Button
            onClick={isPro ? handleDeleteAll : onUpgrade}
            disabled={isPro && items.length === 0}
            className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-900/20"
          >
            <Trash2 size={16} className="mr-2" />
            {isPro ? `Clean All (${formatSize(recoverableSize)})` : 'Buy License to Clean'}
          </Button>
        </div>
      </div>

      {/* File List */}
      <div className="overflow-auto flex-1 min-h-0 p-2 custom-scrollbar">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <CheckCircle2 size={48} className="mb-4 text-green-500/50" />
            <p className="text-lg">No junk found in this category!</p>
          </div>
        )}

        {items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-12"></TableHead>
                <TableHead className="text-muted-foreground font-medium">Name</TableHead>
                <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map(item => (
                <TableRow
                  key={item.path}
                  className="border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none"
                  onClick={(e) => isPro ? toggleOne(item.path, e) : onUpgrade?.()}
                >
                  <TableCell className="w-12 text-center">
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.has(item.path) ? 'bg-primary border-primary' : 'border-white/20'}`}>
                      {selected.has(item.path) && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-black/40 text-primary shrink-0">
                        <FileIcon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate max-w-md">{item.name}</p>
                        <p className={`text-xs text-neutral-500 truncate max-w-md ${!isPro ? 'blur-sm select-none' : ''}`}>{item.path}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-medium text-white whitespace-nowrap ${!isPro ? 'blur-sm select-none' : ''}`}>
                    {formatSize(item.size)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {items.length > ROW_CAP && (
          <p className="text-white/40 text-xs text-center py-3">
            + {items.length - ROW_CAP} more items hidden (still included in Clean All and the total above)
          </p>
        )}
      </div>
    </div>
  )
}

export const SmartCleanViewMemo = React.memo(SmartCleanView);
export { SmartCleanViewMemo as SmartCleanView };
