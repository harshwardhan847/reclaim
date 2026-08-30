import { useEffect, useRef } from 'react'

interface ScanNode {
  path: string
  name: string
  size: number
  children?: ScanNode[]
}

export function TreemapViewer({ data }: { data: ScanNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !data) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    // Simple placeholder drawing for now
    const width = canvasRef.current.width
    const height = canvasRef.current.height

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(220, 38, 38, 0.1)'
    ctx.fillRect(0, 0, width, height)
    
    ctx.fillStyle = '#dc2626'
    ctx.font = '20px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Treemap Visualization', width / 2, height / 2)
    ctx.font = '14px system-ui'
    ctx.fillStyle = '#999'
    ctx.fillText(`Total size: ${(data.size / 1e9).toFixed(2)} GB`, width / 2, height / 2 + 30)

  }, [data])

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden glass border border-white/5">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={500} 
        className="w-full h-full object-cover"
      />
    </div>
  )
}
