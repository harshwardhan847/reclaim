import { type ScanNode } from './TreemapViewer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileIcon, FolderIcon, CheckCircle2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface SmartCleanViewProps {
  title: string
  description: string
  items: ScanNode[]
  onDelete: (paths: string[]) => void
  icon: React.ReactNode
}

export function SmartCleanView({ title, description, items, onDelete, icon }: SmartCleanViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Format bytes to a readable string
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newSelected = new Set(selected)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelected(newSelected)
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
    onDelete(Array.from(selected))
    setSelected(new Set())
  }

  const selectedSize = items
    .filter(i => selected.has(i.path))
    .reduce((acc, curr) => acc + curr.size, 0)

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
            {items.length} <span className="text-lg text-neutral-500 font-medium">items found</span>
          </div>
        </div>
      </div>
      
      {/* Toolbar */}
      <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5">
        <button 
          onClick={toggleAll}
          className="flex items-center space-x-2 text-sm text-neutral-300 hover:text-white transition-colors"
        >
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.size === items.length && items.length > 0 ? 'bg-primary border-primary' : 'border-white/20'}`}>
            {selected.size === items.length && items.length > 0 && <CheckCircle2 size={14} className="text-white" />}
          </div>
          <span>Select All</span>
        </button>

        <Button 
          onClick={handleDelete}
          disabled={selected.size === 0}
          className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all duration-200"
        >
          <Trash2 size={16} className="mr-2" />
          Delete Selected ({formatSize(selectedSize)})
        </Button>
      </div>
      
      {/* File List */}
      <div className="overflow-auto flex-1 p-2">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="w-12"></TableHead>
              <TableHead className="text-muted-foreground font-medium">Name</TableHead>
              <TableHead className="text-muted-foreground font-medium">Type</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice(0, 300).map((file) => (
              <TableRow 
                key={file.path}
                className="group border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none"
                onClick={(e) => toggleSelect(file.path, e)}
              >
                <TableCell className="w-12 text-center">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.has(file.path) ? 'bg-primary border-primary' : 'border-white/20 group-hover:border-white/40'}`}>
                    {selected.has(file.path) && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-black/40 text-primary group-hover:scale-110 transition-transform">
                      {file.children ? <FolderIcon size={18} /> : <FileIcon size={18} />}
                    </div>
                    <div>
                      <p className="font-medium text-white truncate max-w-sm" title={file.name}>{file.name}</p>
                      <p className="text-xs text-neutral-500 truncate max-w-sm" title={file.path}>{file.path}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-neutral-400">
                  <span className="px-2 py-1 rounded-md bg-white/5 text-xs border border-white/5">
                    {file.children ? 'Directory' : 'File'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium text-white text-lg">
                  {formatSize(file.size)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
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
