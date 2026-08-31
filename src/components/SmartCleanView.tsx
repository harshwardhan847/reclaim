import React from 'react';
import { type ScanNode } from './TreemapViewer'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'

interface SmartCleanViewProps {
  title: string
  description: string
  items: ScanNode[]
  onDelete: (items: { path: string; size: number }[]) => void
  icon: React.ReactNode
  isPro?: boolean
  onUpgrade?: () => void
}

function SmartCleanView({ title, description, items, onDelete, icon, isPro, onUpgrade }: SmartCleanViewProps) {
  // Format bytes to a readable string
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleDelete = () => {
    if (items.length === 0) return
    const toDelete = items.map(i => ({ path: i.path, size: i.size }))
    onDelete(toDelete)
  }

  const recoverableSize = useMemo(() => items.reduce((acc, item) => acc + item.size, 0), [items])

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full">
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
        <div className="flex items-center space-x-2 text-sm text-neutral-400">
          <span>{items.length} cleanup candidates {isPro ? 'ready to clean' : '· unlock Pro to inspect exact sizes and clean'}</span>
        </div>

        <Button 
          onClick={isPro ? handleDelete : onUpgrade}
          disabled={items.length === 0}
          className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all duration-200"
        >
          <Trash2 size={16} className="mr-2" />
          {isPro ? `Clean Recoverable Space (${formatSize(recoverableSize)})` : 'Buy License to Clean'}
        </Button>
      </div>
      
      <div className="flex-1 p-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-primary">{icon}</div>
          <p className="text-4xl font-extrabold text-white">{formatSize(recoverableSize)}</p>
          <p className="text-neutral-400 mt-2">could be recovered from {items.length} matching items</p>
          <p className="text-xs text-neutral-600 mt-4">{isPro ? 'Review the candidates, then clean them safely to Trash.' : 'Names are visible; individual sizes and cleanup are unlocked with Pro.'}</p>
          {items.length > 0 && (
            <div className="mx-auto mt-6 max-w-lg space-y-2 text-left">
              {items.slice(0, 4).map(item => <div key={item.path} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[.03] px-4 py-3"><div className="h-3 w-3 rounded-full bg-primary/40" /><span className="flex-1 truncate text-sm text-neutral-200">{item.name}</span><span className={`w-16 text-right text-xs text-neutral-400 ${isPro ? '' : 'blur-sm select-none'}`}>{formatSize(item.size)}</span>{!isPro && <span className="text-[10px] text-amber-400">PRO</span>}</div>)}
            </div>
          )}
        </div>
        
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <CheckCircle2 size={48} className="mb-4 text-green-500/50" />
            <p className="text-lg">No junk found in this category!</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const SmartCleanViewMemo = React.memo(SmartCleanView);
export { SmartCleanViewMemo as SmartCleanView };
