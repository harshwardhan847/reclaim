import type { ScanNode } from './TreemapViewer'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileIcon, FolderIcon, HardDriveIcon, CheckCircle2, ChevronRight, CornerUpLeft } from 'lucide-react'
import { useState, useMemo } from 'react'

export function FileListView({ data }: { data?: ScanNode | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<ScanNode[]>([])

  // Current folder is the last item in history, or root data
  const currentFolder = history.length > 0 ? history[history.length - 1] : data
  const currentFiles = useMemo(() => {
    if (!currentFolder || !currentFolder.children) return []
    return [...currentFolder.children].sort((a, b) => b.size - a.size)
  }, [currentFolder])

  const navigateUp = () => {
    setHistory(prev => prev.slice(0, prev.length - 1))
  }

  const navigateTo = (index: number) => {
    setHistory(prev => prev.slice(0, index))
  }

  const handleDoubleClick = (file: ScanNode) => {
    if (file.children) {
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

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selected)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelected(newSelected)
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full max-h-[600px]">
      
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
              <TableHead className="w-12"></TableHead>
              <TableHead className="text-muted-foreground font-medium">Name</TableHead>
              <TableHead className="text-muted-foreground font-medium">Type</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentFiles.map((file) => (
              <TableRow 
                key={file.path}
                className="group border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none"
                onClick={(e) => toggleSelect(file.path, e)}
                onDoubleClick={() => handleDoubleClick(file)}
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
                      <p className="font-medium text-white truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                      <p className="text-xs text-neutral-500 truncate max-w-[200px] sm:max-w-xs">{file.path}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-neutral-400">
                  <span className="px-2 py-1 rounded-md bg-white/5 text-xs border border-white/5">
                    {file.children ? 'Directory' : 'File'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium text-white">
                  {formatSize(file.size)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {currentFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <p>No items inside</p>
          </div>
        )}
      </div>
    </div>
  )
}
