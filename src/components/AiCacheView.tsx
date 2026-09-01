import { usePro } from '@/hooks/usePro';
import { type ScanNode } from './TreemapViewer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FolderIcon, CheckCircle2, Trash2, ChevronDown, ChevronRight, Bot, LockKeyhole } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import React, { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'

interface AiCacheViewProps {
  items: ScanNode[]
  onDelete: (items: { path: string; size: number }[]) => void
  onUpgrade?: () => void
}

type AgentGroup = {
  name: string
  items: ScanNode[]
  totalSize: number
}

function AiCacheView({ items, onDelete, onUpgrade }: AiCacheViewProps) {
  const { isPro } = usePro();
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, item: ScanNode} | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Format bytes to a readable string
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Group items by agent
  const groups = useMemo(() => {
    const map = new Map<string, ScanNode[]>()
    
    items.forEach(item => {
      const lower = item.path.toLowerCase()
      let agent = 'Other AI Tools'
      
      if (lower.includes('huggingface') || lower.includes('hub/models')) agent = 'HuggingFace'
      else if (lower.includes('.cache/lm-studio')) agent = 'LM Studio'
      else if (lower.includes('ollama')) agent = 'Ollama'
      else if (lower.includes('diffusion') || lower.includes('comfyui')) agent = 'Stable Diffusion'
      else if (lower.includes('/cursor/')) agent = 'Cursor IDE'
      else if (lower.includes('copilot')) agent = 'GitHub Copilot'
      else if (lower.includes('.gemini') || lower.includes('antigravity') || lower.includes('google-cloud-sdk')) agent = 'Google / Antigravity'
      else if (lower.includes('claude') || lower.includes('anthropic')) agent = 'Claude / Anthropic'
      else if (lower.includes('chatgpt') || lower.includes('openai') || lower.includes('com.openai')) agent = 'ChatGPT / OpenAI'
      else if (lower.includes('codeium')) agent = 'Codeium'
      else if (lower.includes('tabnine')) agent = 'Tabnine'
      else if (lower.includes('continue')) agent = 'Continue'
      else if (lower.includes('cody') || lower.includes('sourcegraph')) agent = 'Sourcegraph Cody'
      else if (lower.includes('windsurf')) agent = 'Windsurf'
      else if (lower.includes('aider')) agent = 'Aider'
      else if (lower.includes('pytorch') || lower.includes('torch')) agent = 'PyTorch'
      else if (lower.includes('tensorflow') || lower.includes('.keras')) agent = 'TensorFlow'
      else if (lower.includes('conda') || lower.includes('miniconda') || lower.includes('anaconda')) agent = 'Conda'
      else if (lower.includes('pip') && lower.includes('cache')) agent = 'pip Cache'
      else if (lower.includes('jupyter') || lower.includes('.ipynb_checkpoints')) agent = 'Jupyter'
      
      const existing = map.get(agent) || []
      existing.push(item)
      map.set(agent, existing)
    })

    const result: AgentGroup[] = []
    map.forEach((agentItems, name) => {
      result.push({
        name,
        items: agentItems.sort((a, b) => b.size - a.size),
        totalSize: agentItems.reduce((acc, curr) => acc + curr.size, 0)
      })
    })

    return result.sort((a, b) => b.totalSize - a.totalSize)
  }, [items])

  const totalRecoverable = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items])

  const toggleSelectGroup = (group: AgentGroup, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const allSelected = group.items.every(i => selected.has(i.path))
    const newSelected = new Set(selected)
    
    if (allSelected) {
      // Deselect all
      group.items.forEach(i => newSelected.delete(i.path))
    } else {
      // Select all
      group.items.forEach(i => newSelected.add(i.path))
    }
    
    setSelected(newSelected)
  }

  const toggleExpand = (groupName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupName)) newExpanded.delete(groupName)
    else newExpanded.add(groupName)
    setExpandedGroups(newExpanded)
  }

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(i => i.path)))
    }
  }

  const handleDelete = () => {
    if (selected.size === 0) return
    const toDelete = items.filter(i => selected.has(i.path)).map(i => ({ path: i.path, size: i.size }))
    onDelete(toDelete)
    setSelected(new Set())
  }

  const selectedSize = useMemo(() => {
    return items
      .filter(i => selected.has(i.path))
      .reduce((acc, curr) => acc + curr.size, 0)
  }, [selected, items])

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="font-bold text-2xl text-white">AI Cache & Logs</h2>
            <p className="text-sm text-neutral-400 mt-1">Stale cache files from AI tools and models, grouped by agent.</p>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-3xl font-extrabold text-white">
            {formatSize(totalRecoverable)} <span className="text-lg text-neutral-500 font-medium">recoverable</span>
          </div>
        </div>
      </div>
      
      {/* Toolbar */}
      <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5">
        <button
          onClick={isPro ? toggleAll : onUpgrade}
          className="flex items-center space-x-2 text-sm text-neutral-300 hover:text-white transition-colors"
        >
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.size === items.length && items.length > 0 ? 'bg-primary border-primary' : 'border-white/20'}`}>
            {selected.size === items.length && items.length > 0 && <CheckCircle2 size={14} className="text-white" />}
          </div>
          <span>{isPro ? 'Select All' : 'Inspect cleanup · PRO'}</span>
        </button>

        <Button
          onClick={isPro ? handleDelete : onUpgrade}
          disabled={isPro && selected.size === 0}
          className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-900/20"
        >
          <Trash2 size={16} className="mr-2" />
          {isPro ? `Delete Selected (${formatSize(selectedSize)})` : 'Buy License to Clean'}
        </Button>
      </div>
      
      {/* File List */}
      <div className="overflow-auto flex-1 min-h-0 p-2 custom-scrollbar">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <CheckCircle2 size={48} className="mb-4 text-green-500/50" />
            <p className="text-lg">No AI junk found!</p>
          </div>
        )}

        {groups.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-muted-foreground font-medium">Tool category</TableHead>
                <TableHead className="text-muted-foreground font-medium">Type</TableHead>
                <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const isExpanded = expandedGroups.has(group.name)
                const allSelected = group.items.every(i => selected.has(i.path))
                const someSelected = !allSelected && group.items.some(i => selected.has(i.path))
                
                return (
                  <React.Fragment key={group.name}>
                    {/* Folder Group Row */}
                    <TableRow 
                      className="group/row border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none bg-black/20"
                      onClick={(e) => isPro ? toggleExpand(group.name, e) : onUpgrade?.()}
                    >
                      <TableCell className="w-12 text-center" onClick={(e) => isPro ? toggleSelectGroup(group, e) : onUpgrade?.()}>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${allSelected ? 'bg-primary border-primary' : someSelected ? 'bg-primary/50 border-primary' : 'border-white/20 group-hover/row:border-white/40'}`}>
                          {isPro && (allSelected || someSelected) && <CheckCircle2 size={14} className="text-white" />}
                        </div>
                      </TableCell>
                      <TableCell className="w-8 text-neutral-500">
                        {isPro ? (isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />) : <LockKeyhole size={15} className="text-amber-300" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="p-2 rounded-lg bg-black/40 text-blue-400 group-hover/row:scale-110 transition-transform">
                            <FolderIcon size={18} className="fill-blue-400/20" />
                          </div>
                          <div>
                            <p className="font-bold text-white max-w-sm">{group.name}</p>
                            <p className="text-xs text-neutral-500 max-w-sm">{group.items.length} files</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-neutral-400">
                        <span className="px-2 py-1 rounded-md bg-white/5 text-xs border border-white/5 font-medium">
                          Agent
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-white text-lg">
                        <span className={!isPro ? 'blur-sm select-none' : ''}>{formatSize(group.totalSize)}</span>
                      </TableCell>
                    </TableRow>

                    {/* Children Rows (capped per group so a huge model cache can't render thousands of DOM rows) */}
                    {isExpanded && group.items.slice(0, 200).map((item) => (
                      <TableRow
                        key={item.path}
                        className="border-white/5 bg-black/10 hover:bg-white/5 transition-colors"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isPro) { onUpgrade?.(); return }
                          setContextMenu({ x: e.clientX, y: e.clientY, item });
                        }}
                      >
                        <TableCell className="w-12 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-primary"
                            checked={selected.has(item.path)}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newSelected = new Set(selected)
                              if (newSelected.has(item.path)) newSelected.delete(item.path)
                              else newSelected.add(item.path)
                              setSelected(newSelected)
                            }}
                          />
                        </TableCell>
                        <TableCell className="w-8"></TableCell>
                        <TableCell className="font-medium text-neutral-200 pl-4 max-w-0">
                          <div className="flex flex-col truncate pr-4">
                            <span className="truncate" title={item.name}>{item.name}</span>
                            <span className="text-xs text-neutral-500 truncate" title={item.path}>{item.path}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-neutral-400">
                          <span className="text-xs">File</span>
                        </TableCell>
                        <TableCell className="text-right text-neutral-400 whitespace-nowrap">
                          {formatSize(item.size)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {isExpanded && group.items.length > 200 && (
                      <TableRow className="border-white/5 bg-black/10">
                        <TableCell colSpan={5} className="text-center text-xs text-neutral-500 py-2">
                          + {group.items.length - 200} more files hidden
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
        {contextMenu && (
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null) }}>
            <div className="absolute bg-neutral-900 border border-white/10 rounded-xl shadow-2xl py-1 w-52 overflow-hidden backdrop-blur-xl" style={{ top: Math.min(contextMenu.y, window.innerHeight - 100), left: Math.min(contextMenu.x, window.innerWidth - 220) }} onClick={e => e.stopPropagation()}>
              <p className="px-3 py-2 text-xs font-semibold text-neutral-400 truncate">{contextMenu.item.name}</p>
              <button onClick={async () => {
                setContextMenu(null);
                if (!isPro) { onUpgrade?.(); return }
                await invoke('reveal_in_finder', { path: contextMenu.item.path }).catch(console.error);
              }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10">
                {isPro ? 'Reveal in Finder' : <><LockKeyhole size={13} className="text-amber-300" /> Reveal in Finder · PRO</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const AiCacheViewMemo = React.memo(AiCacheView);
export { AiCacheViewMemo as AiCacheView };
