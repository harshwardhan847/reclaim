import { usePro } from '@/hooks/usePro';
import React from 'react';
import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3-hierarchy'
import { scaleOrdinal } from 'd3-scale'
import { schemeCategory10 } from 'd3-scale-chromatic'
import { LockKeyhole } from 'lucide-react'

export interface ScanNode {
  path: string
  name: string
  size: number
  isDir?: boolean
  isAggregate?: boolean
  children?: ScanNode[]
}

function TreemapViewer({
  data,
  onStageItem,
  onDelete,
  onUpgrade,
}: {
  data: ScanNode | null,
  onStageItem?: (node: ScanNode) => void,
  onDelete?: (items: { path: string; size: number }[]) => void,
  onUpgrade?: () => void,
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { isPro } = usePro();
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Dragging state
  const dragState = useRef<{
    isDragging: boolean,
    start: {x: number, y: number},
    node: d3.HierarchyRectangularNode<ScanNode> | null
  }>({ isDragging: false, start: {x: 0, y: 0}, node: null })

  const rafRef = useRef<number>(0)
  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        for (const entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          })
        }
      })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Keep a reference to the latest layout for click detection
  const layoutNodes = useRef<d3.HierarchyRectangularNode<ScanNode>[]>([]);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Render Canvas
  useEffect(() => {
    if (!canvasRef.current || !data || dimensions.width === 0 || dimensions.height === 0) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const { width, height } = dimensions
    
    canvasRef.current.width = width * dpr
    canvasRef.current.height = height * dpr
    canvasRef.current.style.width = `${width}px`
    canvasRef.current.style.height = `${height}px`
    
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Compute layout
    const root = d3.hierarchy(data)
      .sum(d => d.size)
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const treemapLayout = d3.treemap<ScanNode>()
      .size([width, height])
      .paddingOuter(4)
      .paddingTop(20)
      .paddingInner(1)
      .round(true);

    treemapLayout(root);
    layoutNodes.current = root.descendants() as d3.HierarchyRectangularNode<ScanNode>[];

    // Rainbow color scale
    const colorScale = scaleOrdinal(schemeCategory10);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';

    // Draw rectangles (Optimized)
    layoutNodes.current.forEach(node => {
      if (node.depth === 0) return;
      
      // Removed artificial depth restriction to show full folder depth
      
      const x = node.x0;
      const y = node.y0;
      const w = node.x1 - node.x0;
      const h = node.y1 - node.y0;

      // Aggressive culling: Skip very small rectangles to keep it performant
      if (w < 5 || h < 5) return;

      // Unique color based on node's own path instead of parent's
      ctx.fillStyle = colorScale(node.data.path);
      
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Draw text if enough space
      if (!node.children || (w > 50 && h > 30)) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = '10px system-ui';
        ctx.textBaseline = 'top';
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillText(node.data.name, x + 4, y + 4);
        
        if (h > 40) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          const sizeGB = (node.data.size / 1e9).toFixed(2);
          ctx.fillText(`${sizeGB} GB`, x + 4, y + 18);
        }
        ctx.restore();
      }
    });

  }, [data, dimensions]);

  // Interaction handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find deepest node at (x,y)
    let clickedNode: any = null;
    let maxDepth = -1;
    layoutNodes.current.forEach(n => {
      if (x >= n.x0 && x <= n.x1 && y >= n.y0 && y <= n.y1 && n.depth > maxDepth) {
        clickedNode = n;
        maxDepth = n.depth;
      }
    });

    if (clickedNode) {
      dragState.current = {
        isDragging: false,
        start: { x: e.clientX, y: e.clientY },
        node: clickedNode
      };
    }
  };

  // Global window listeners for reliable drag and drop outside canvas
  useEffect(() => {
    const handleWindowMove = (e: PointerEvent) => {
      if (dragState.current.isDragging && tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${e.clientX + 15}px, ${e.clientY + 15}px)`;
      }
    };
    
    const handleWindowUp = (e: PointerEvent) => {
      const { isDragging, node } = dragState.current;
      if (isDragging && node) {
        // Temporarily hide the tooltip so elementFromPoint doesn't hit it
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const isOverTrash = dropTarget?.closest('#radar-trash') !== null;
        
        if (isOverTrash && onStageItem) {
          onStageItem(node.data);
        }
        
        dragState.current = { isDragging: false, start: {x: 0, y: 0}, node: null };
      }
    };

    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
    };
  }, [onStageItem]);

  const pointerRafRef = useRef<number>(0)
  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerRafRef.current) cancelAnimationFrame(pointerRafRef.current)
    pointerRafRef.current = requestAnimationFrame(() => {
      // Hover tooltip logic (only if not dragging, global listener handles drag)
      if (!dragState.current.isDragging) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          let hoveredNode = null as d3.HierarchyRectangularNode<ScanNode> | null;
          let maxDepth = -1;
          layoutNodes.current.forEach(n => {
            if (x >= n.x0 && x <= n.x1 && y >= n.y0 && y <= n.y1 && n.depth > maxDepth) {
              hoveredNode = n;
              maxDepth = n.depth;
            }
          });

          if (tooltipRef.current) {
            if (hoveredNode && hoveredNode.depth > 0) {
              const sizeGB = (hoveredNode.data.size / 1e9).toFixed(2);
              const sizeMB = (hoveredNode.data.size / 1e6).toFixed(2);
              const sizeStr = hoveredNode.data.size > 1e9 ? `${sizeGB} GB` : `${sizeMB} MB`;
              
              tooltipRef.current.style.display = 'block';
              tooltipRef.current.style.transform = `translate(${e.clientX + 15}px, ${e.clientY + 15}px)`;
              tooltipRef.current.innerHTML = `<div class="bg-black/90 text-white px-3 py-2 rounded-lg border border-white/10 backdrop-blur-md shadow-xl text-sm max-w-sm break-all">
                <p class="font-bold text-white mb-1">${hoveredNode.data.name}</p>
                <p class="text-xs text-neutral-400 mb-1 leading-tight">${hoveredNode.data.path}</p>
                <p class="text-primary font-semibold">${sizeStr}</p>
              </div>`;
            } else {
              tooltipRef.current.style.display = 'none';
            }
          }
        }
      }

      // Drag start logic
      if (!dragState.current.node) return;
      const dx = Math.abs(e.clientX - dragState.current.start.x);
      const dy = Math.abs(e.clientY - dragState.current.start.y);
      
      if (!dragState.current.isDragging && (dx > 5 || dy > 5)) {
        dragState.current.isDragging = true;
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'flex';
          tooltipRef.current.innerHTML = `<span class="bg-red-500/20 text-red-100 px-3 py-1.5 rounded-lg border border-red-500/50 backdrop-blur-md shadow-2xl flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><line x1="9" x2="15" y1="13" y2="13"/></svg>
            Dragging: ${dragState.current.node.data.name}
          </span>`;
        }
      }
    })
  };

  const handlePointerUp = () => {
    const { isDragging, node } = dragState.current;
    if (!node) return;

    if (!isDragging) {
      dragState.current = { isDragging: false, start: {x: 0, y: 0}, node: null };
    }
  };

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: ScanNode } | null>(null);

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let clickedNode: any = null;
    let maxDepth = -1;
    layoutNodes.current.forEach(n => {
      if (x >= n.x0 && x <= n.x1 && y >= n.y0 && y <= n.y1 && n.depth > maxDepth) {
        clickedNode = n;
        maxDepth = n.depth;
      }
    });

    if (clickedNode) {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      setContextMenu({ x, y, node: clickedNode.data });
    }
  };

  const handlePointerLeave = () => {
    // Only clear hover visuals if not dragging
    if (!dragState.current.isDragging) {
      dragState.current = { isDragging: false, start: {x: 0, y: 0}, node: null };
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    }
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col space-y-2 relative">
      <div className="flex justify-end items-center w-full pb-1">
        <div className="text-xs font-semibold text-neutral-400 flex items-center gap-2 opacity-75">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Right-click any block for options, or drag to the trash cart
        </div>
      </div>

      {/* Hover/Drag Tooltip Portal */}
      <div 
        ref={tooltipRef} 
        className="fixed top-0 left-0 pointer-events-none z-[100] hidden transition-opacity"
      />

      {/* Canvas Container */}
      <div 
        ref={containerRef} 
        className="flex-1 w-full relative rounded-xl overflow-hidden glass border border-white/5 shadow-2xl cursor-default"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
      >
        <canvas 
          ref={canvasRef} 
          className="w-full h-full object-cover"
        />
        {/* React-based Context Menu Overlay */}
        {contextMenu && (
          <div 
            className="absolute inset-0 z-50 pointer-events-auto" onPointerMove={(e) => e.stopPropagation()} 
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          >
            <div
              className="absolute bg-neutral-900 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.8)] rounded-xl py-1 w-48 text-sm animate-in fade-in zoom-in-95 duration-100"
              style={{
                top: Math.max(0, Math.min(contextMenu.y, dimensions.height - 160)),
                left: Math.max(0, Math.min(contextMenu.x, dimensions.width - 200)),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 border-b border-white/5 mb-1 bg-black/20">
                 <span className="text-xs font-semibold text-neutral-400 truncate block w-full" title={contextMenu.node.name}>
                   {contextMenu.node.name}
                 </span>
              </div>
              <button 
                className="w-full text-left px-4 py-2 hover:bg-primary/20 hover:text-white transition-colors"
                onClick={async () => {
                  setContextMenu(null);
                  if (!isPro) { onUpgrade?.(); return }
                  const { invoke } = await import('@tauri-apps/api/core');
                  try {
                    await invoke('reveal_in_finder', { path: contextMenu.node.path });
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                {isPro ? 'Reveal in Finder' : <span className="inline-flex items-center gap-1.5"><LockKeyhole size={13} className="text-amber-300" /> Reveal in Finder · PRO</span>}
              </button>
              <button className="w-full text-left px-4 py-2 hover:bg-primary/20 hover:text-white transition-colors" onClick={() => { const node = contextMenu.node; setContextMenu(null); if (!isPro) { onUpgrade?.(); return } onStageItem?.(node) }}>{isPro ? 'Add to Cleanup List' : <span className="inline-flex items-center gap-1.5"><LockKeyhole size={13} className="text-amber-300" /> Add to Cleanup List · PRO</span>}</button>
              <button className="w-full text-left px-4 py-2 text-red-300 hover:bg-red-500/20" onClick={() => { const node = contextMenu.node; setContextMenu(null); if (!isPro) { onUpgrade?.(); return } onDelete?.([{ path: node.path, size: node.size }]) }}>{isPro ? 'Move to Trash' : <span className="inline-flex items-center gap-1.5"><LockKeyhole size={13} className="text-amber-300" /> Move to Trash · PRO</span>}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const TreemapViewerMemo = React.memo(TreemapViewer);
export { TreemapViewerMemo as TreemapViewer };
