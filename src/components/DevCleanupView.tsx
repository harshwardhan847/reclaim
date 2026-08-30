import React from 'react';
import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Package, Code, Hammer, HardDrive, RefreshCw, Trash2, ChevronDown, ChevronRight, Loader2, Archive, Folder } from "lucide-react";
import { Button } from "./ui/button";

type DevDirectory = {
  path: string;
  name: string;
  size: number;
  category: string;
};

interface DevCleanupViewProps {
  onDelete: (paths: string[]) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase();
  if (cat.includes("node")) return <Package className="w-5 h-5" />;
  if (cat.includes("python")) return <Code className="w-5 h-5" />;
  if (cat.includes("rust") || cat.includes("build")) return <Hammer className="w-5 h-5" />;
  if (cat.includes("cache")) return <Archive className="w-5 h-5" />;
  return <Folder className="w-5 h-5" />;
};

function DevCleanupView({ onDelete }: DevCleanupViewProps) {
  const [directories, setDirectories] = useState<DevDirectory[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const handleScan = async () => {
    setLoading(true);
    try {
      const result = await invoke<DevDirectory[]>('find_dev_directories', { path: '/Users' });
      setDirectories(result || []);
      setScanned(true);
    } catch (error) {
      console.error("Failed to scan directories", error);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const groups: Record<string, DevDirectory[]> = {};
    directories.forEach(dir => {
      if (!groups[dir.category]) groups[dir.category] = [];
      groups[dir.category].push(dir);
    });
    return groups;
  }, [directories]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) newExpanded.delete(category);
    else newExpanded.add(category);
    setExpandedCategories(newExpanded);
  };

  const toggleSelectCategory = (dirs: DevDirectory[]) => {
    const newSelected = new Set(selectedPaths);
    const allSelected = dirs.every(d => newSelected.has(d.path));
    
    if (allSelected) {
      dirs.forEach(d => newSelected.delete(d.path));
    } else {
      dirs.forEach(d => newSelected.add(d.path));
    }
    setSelectedPaths(newSelected);
  };

  const toggleSelectPath = (path: string) => {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) newSelected.delete(path);
    else newSelected.add(path);
    setSelectedPaths(newSelected);
  };

  const selectAll = () => {
    if (selectedPaths.size === directories.length && directories.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(directories.map(d => d.path)));
    }
  };

  const totalSelectedSize = useMemo(() => {
    return directories
      .filter(d => selectedPaths.has(d.path))
      .reduce((sum, d) => sum + d.size, 0);
  }, [directories, selectedPaths]);

  const handleDelete = () => {
    onDelete(Array.from(selectedPaths));
    setSelectedPaths(new Set());
    setDirectories(directories.filter(d => !selectedPaths.has(d.path)));
  };

  if (!scanned && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass rounded-lg border border-white/10">
        <HardDrive className="w-16 h-16 mb-4 text-white/50" />
        <h2 className="text-xl font-bold mb-2 text-white">Developer Cleanup</h2>
        <p className="text-white/70 mb-6 text-center max-w-md">
          Find and remove heavy developer directories like node_modules, target folders, and Python caches.
        </p>
        <Button onClick={handleScan} className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <HardDrive className="w-4 h-4" />
          Scan /Users Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between glass p-4 rounded-lg border border-white/10">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll} className="border-white/20 text-white hover:bg-white/10">
            {selectedPaths.size === directories.length && directories.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleScan} disabled={loading} className="border-white/20 text-white hover:bg-white/10 gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rescan
          </Button>
        </div>
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={handleDelete}
          disabled={selectedPaths.size === 0}
          className="gap-2 bg-red-600 hover:bg-red-700 text-white"
        >
          <Trash2 className="w-4 h-4" />
          Clean Selected ({formatBytes(totalSelectedSize)})
        </Button>
      </div>

      {loading && directories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 glass rounded-lg border border-white/10">
          <Loader2 className="w-12 h-12 animate-spin text-red-500 mb-4" />
          <p className="text-white/70">Scanning for developer directories...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {Object.entries(grouped).map(([category, dirs]) => {
            const categorySize = dirs.reduce((sum, d) => sum + d.size, 0);
            const isExpanded = expandedCategories.has(category);
            const allSelected = dirs.length > 0 && dirs.every(d => selectedPaths.has(d.path));
            const someSelected = dirs.some(d => selectedPaths.has(d.path));
            
            return (
              <div key={category} className="glass rounded-lg border border-white/10 overflow-hidden">
                <div className="flex items-center p-3 hover:bg-white/5 transition-colors">
                  <button onClick={() => toggleCategory(category)} className="p-1 mr-2 text-white/70 hover:text-white">
                    {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                  <input 
                    type="checkbox" 
                    checked={allSelected}
                    ref={input => {
                      if (input) input.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={() => toggleSelectCategory(dirs)}
                    className="mr-4 w-4 h-4 rounded bg-black/50 border-white/20"
                  />
                  <div className="flex items-center gap-3 flex-1 text-white cursor-pointer" onClick={() => toggleCategory(category)}>
                    {getCategoryIcon(category)}
                    <span className="font-semibold">{category}</span>
                    <span className="text-white/50 text-sm ml-auto">{dirs.length} items • {formatBytes(categorySize)}</span>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="bg-black/20 p-2 border-t border-white/5">
                    {dirs.slice(0, 200).map(dir => (
                      <div key={dir.path} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded">
                        <input 
                          type="checkbox"
                          checked={selectedPaths.has(dir.path)}
                          onChange={() => toggleSelectPath(dir.path)}
                          className="w-4 h-4 rounded bg-black/50 border-white/20 ml-8"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{dir.name}</p>
                          <p className="text-white/40 text-xs truncate">{dir.path}</p>
                        </div>
                        <span className="text-white/60 text-sm whitespace-nowrap">{formatBytes(dir.size)}</span>
                      </div>
                    ))}
                    {dirs.length > 200 && (
                      <p className="text-white/40 text-xs text-center py-2">+ {dirs.length - 200} more items hidden</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const DevCleanupViewMemo = React.memo(DevCleanupView);
export { DevCleanupViewMemo as DevCleanupView };
