import { useState, useEffect, useRef } from 'react'
import { Search, File as FileIcon, Folder as FolderIcon, X, Trash2 } from 'lucide-react'
import { type ScanNode } from './TreemapViewer'

interface SearchOverlayProps {
  data: ScanNode | null
  isOpen: boolean
  onClose: () => void
  onDelete: (path: string) => void
}

export function SearchOverlay({ data, isOpen, onClose, onDelete }: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScanNode[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setQuery('')
    }
  }, [isOpen])

  // Flatten once when data changes
  const flatData = useRef<ScanNode[]>([])
  useEffect(() => {
    if (data) {
      const flat: ScanNode[] = []
      const traverse = (node: ScanNode) => {
        flat.push(node)
        if (node.children) node.children.forEach(traverse)
      }
      traverse(data)
      flatData.current = flat
    }
  }, [data])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const lowerQuery = query.toLowerCase()
    // Very fast string match, cap at 50 results to keep DOM fast
    const matches = flatData.current.filter(n => n.name.toLowerCase().includes(lowerQuery)).slice(0, 50)
    setResults(matches)
  }, [query])

  // Handle global Cmd+K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault() // prevent browser search
        if (!isOpen) {
          // You would typically lift this state to App.tsx to truly toggle it
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md cursor-pointer"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-black/80 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col glass max-h-[70vh] transform scale-100 transition-all">
        {/* Search Input Area */}
        <div className="flex items-center px-4 border-b border-white/10">
          <Search size={24} className="text-primary mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files and folders... (Cmd+K)"
            className="flex-1 bg-transparent border-none text-white text-xl py-5 focus:outline-none placeholder-neutral-500 font-medium"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {query.trim() && results.length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              No results found for "{query}"
            </div>
          )}
          
          {!query.trim() && (
            <div className="text-center py-12 text-neutral-600">
              Type to search your scanned files...
            </div>
          )}

          <div className="space-y-1">
            {results.map((node, i) => (
              <div 
                key={`${node.path}-${i}`} 
                className="flex items-center justify-between p-3 rounded-xl hover:bg-primary/20 hover:border-primary/30 border border-transparent group transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="p-2 bg-white/5 rounded-lg text-primary shrink-0">
                    {node.children ? <FolderIcon size={18} /> : <FileIcon size={18} />}
                  </div>
                  <div className="truncate min-w-0">
                    <p className="text-white font-medium truncate">{node.name}</p>
                    <p className="text-xs text-neutral-500 truncate" title={node.path}>{node.path}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4 shrink-0 pl-4">
                  <span className="text-neutral-400 font-medium text-sm">{formatSize(node.size)}</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(node.path)
                    }}
                    className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Move to Trash"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
