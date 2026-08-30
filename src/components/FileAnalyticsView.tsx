import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { type ScanNode } from './TreemapViewer'

// Map categories to vibrant colors fitting the red/black/dark theme
const CATEGORY_COLORS: Record<string, string> = {
  'Videos': '#dc2626',      // Red 600
  'Images': '#f87171',      // Red 400
  'Audio': '#b91c1c',       // Red 700
  'Documents': '#991b1b',   // Red 800
  'Developer': '#fca5a5',   // Red 300
  'Apps': '#7f1d1d',        // Red 900
  'Archives': '#450a0a',    // Red 950
  'Other': '#404040',       // Neutral 700
}

const EXTENSION_MAP: Record<string, string> = {
  // Videos
  'mp4': 'Videos', 'mkv': 'Videos', 'mov': 'Videos', 'avi': 'Videos', 'webm': 'Videos', 'flv': 'Videos',
  // Images
  'jpg': 'Images', 'jpeg': 'Images', 'png': 'Images', 'gif': 'Images', 'svg': 'Images', 'webp': 'Images', 'heic': 'Images',
  // Audio
  'mp3': 'Audio', 'wav': 'Audio', 'flac': 'Audio', 'm4a': 'Audio', 'ogg': 'Audio',
  // Documents
  'pdf': 'Documents', 'doc': 'Documents', 'docx': 'Documents', 'xls': 'Documents', 'xlsx': 'Documents', 'ppt': 'Documents', 'pptx': 'Documents', 'txt': 'Documents', 'pages': 'Documents', 'numbers': 'Documents', 'key': 'Documents', 'csv': 'Documents',
  // Developer
  'js': 'Developer', 'ts': 'Developer', 'jsx': 'Developer', 'tsx': 'Developer', 'rs': 'Developer', 'py': 'Developer', 'go': 'Developer', 'html': 'Developer', 'css': 'Developer', 'json': 'Developer', 'lock': 'Developer', 'md': 'Developer', 'java': 'Developer', 'c': 'Developer', 'cpp': 'Developer', 'h': 'Developer', 'yml': 'Developer', 'yaml': 'Developer', 'toml': 'Developer', 'sql': 'Developer', 'sqlite': 'Developer',
  // Apps
  'app': 'Apps', 'dmg': 'Apps', 'pkg': 'Apps', 'exe': 'Apps',
  // Archives
  'zip': 'Archives', 'rar': 'Archives', '7z': 'Archives', 'tar': 'Archives', 'gz': 'Archives', 'iso': 'Archives'
}

interface FileAnalyticsViewProps {
  data: ScanNode
}

export function FileAnalyticsView({ data }: FileAnalyticsViewProps) {
  const analyticsData = useMemo(() => {
    const categories: Record<string, number> = {
      'Videos': 0, 'Images': 0, 'Audio': 0, 'Documents': 0,
      'Developer': 0, 'Apps': 0, 'Archives': 0, 'Other': 0
    }

    // O(N) recursive traversal to sum sizes by file extension
    const traverse = (node: ScanNode) => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(traverse)
      } else {
        // It's a file
        const ext = node.name.split('.').pop()?.toLowerCase() || ''
        const category = EXTENSION_MAP[ext] || 'Other'
        categories[category] += node.size
      }
    }

    traverse(data)

    // Format for Recharts
    return Object.entries(categories)
      .filter(([_, size]) => size > 0)
      .map(([name, size]) => ({
        name,
        size
      }))
      .sort((a, b) => b.size - a.size) // Sort largest first
  }, [data])

  // Format bytes helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-xl">
          <p className="text-white font-medium">{payload[0].name}</p>
          <p className="text-primary font-bold">{formatSize(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }

  const totalSize = useMemo(() => {
    return analyticsData.reduce((acc, curr) => acc + curr.size, 0)
  }, [analyticsData])

  if (analyticsData.length === 0) return null

  return (
    <div className="flex h-full w-full items-center bg-black/20 rounded-xl border border-white/5 p-4 shadow-inner">
      <div className="h-full w-48 shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={analyticsData}
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="80%"
              paddingAngle={4}
              dataKey="size"
              stroke="none"
              cornerRadius={4}
            >
              {analyticsData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name]} />
              ))}
            </Pie>
            <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 overflow-y-auto max-h-full custom-scrollbar content-start">
        {analyticsData.map(item => {
          const percentage = totalSize > 0 ? ((item.size / totalSize) * 100).toFixed(1) : '0.0'
          return (
            <div key={item.name} className="flex items-center justify-between bg-black/40 border border-white/5 p-3 rounded-xl hover:bg-white/5 transition-colors group">
              <div className="flex items-center space-x-3 min-w-0">
                <div 
                  className="w-3 h-3 rounded-full shrink-0 transition-transform group-hover:scale-125" 
                  style={{ 
                    backgroundColor: CATEGORY_COLORS[item.name],
                    boxShadow: `0 0 12px ${CATEGORY_COLORS[item.name]}80`
                  }}
                />
                <div className="truncate min-w-0">
                  <p className="text-xs text-neutral-400 font-medium truncate leading-tight">{item.name}</p>
                  <p className="text-sm text-white font-bold truncate leading-tight mt-0.5">{formatSize(item.size)}</p>
                </div>
              </div>
              <div className="text-[10px] font-bold text-neutral-400 bg-white/5 px-2 py-1 rounded-md shrink-0 ml-2 border border-white/5 group-hover:text-white transition-colors">
                {percentage}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
