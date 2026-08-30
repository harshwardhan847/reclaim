import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileIcon, FolderIcon, HardDriveIcon } from "lucide-react"

const MOCK_FILES = [
  { id: 1, name: "Node Modules (project-a)", type: "folder", size: "1.2 GB", category: "Dev Artifacts", date: "2023-10-01" },
  { id: 2, name: "cache.db", type: "file", size: "850 MB", category: "AI Tools", date: "2023-10-15" },
  { id: 3, name: "Docker.raw", type: "file", size: "64 GB", category: "System", date: "2023-09-20" },
  { id: 4, name: "Downloads", type: "folder", size: "4.5 GB", category: "Other", date: "2023-10-25" },
  { id: 5, name: "Xcode DerivedData", type: "folder", size: "12 GB", category: "Dev Artifacts", date: "2023-10-28" },
]

export function FileListView() {
  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full max-h-[600px]">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <HardDriveIcon className="text-primary" size={20} />
          Macintosh HD
        </h2>
        <div className="text-sm text-muted-foreground">
          Showing 5 large items
        </div>
      </div>
      
      <div className="overflow-auto flex-1 p-2">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">Name</TableHead>
              <TableHead className="text-muted-foreground font-medium">Category</TableHead>
              <TableHead className="text-muted-foreground font-medium">Date Modified</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_FILES.map((file) => (
              <TableRow key={file.id} className="border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                <TableCell className="font-medium flex items-center gap-3 py-4">
                  {file.type === 'folder' 
                    ? <FolderIcon size={18} className="text-blue-400 group-hover:text-blue-300 transition-colors" /> 
                    : <FileIcon size={18} className="text-neutral-400 group-hover:text-neutral-300 transition-colors" />
                  }
                  {file.name}
                </TableCell>
                <TableCell>
                  <span className="px-2.5 py-1 rounded-full bg-white/5 text-xs text-neutral-300 border border-white/5">
                    {file.category}
                  </span>
                </TableCell>
                <TableCell className="text-neutral-400">{file.date}</TableCell>
                <TableCell className="text-right text-primary font-medium tracking-wide">
                  {file.size}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
