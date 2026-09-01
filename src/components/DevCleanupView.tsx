import { usePro } from '@/hooks/usePro';
import React from 'react';
import { useState, useMemo, useEffect, useCallback, startTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Package, Code, Hammer, HardDrive, RefreshCw, Trash2, ChevronDown, ChevronRight, Loader2, Archive, Folder, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";

type DevDirectory = {
  path: string;
  name: string;
  size: number;
  category: string;
};

interface DevCleanupViewProps {
  onDelete: (items: { path: string; size: number }[]) => void;
  onUpgrade?: () => void;
  onSizeChange?: (size: number) => void;
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

// Memoized leaf row: only re-renders when ITS OWN checked state (or the
// underlying dir) actually changes, not on every selection change anywhere
// else in the list. This is what keeps "select all" on a large scan from
// having to re-render hundreds of unrelated rows synchronously.
const DevDirRow = React.memo(function DevDirRow({
  dir,
  checked,
  isPro,
  onToggle,
}: {
  dir: DevDirectory;
  checked: boolean;
  isPro: boolean;
  onToggle: (path: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2 hover:bg-white/5 rounded">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(dir.path)}
        className="w-4 h-4 rounded bg-black/50 border-white/20 ml-8"
      />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm truncate">{dir.name}</p>
        <p className={`text-white/40 text-xs truncate ${!isPro ? 'blur-sm select-none' : ''}`} title={isPro ? dir.path : undefined}>
          {dir.path}
        </p>
      </div>
      <span className={`text-white/60 text-sm whitespace-nowrap ${!isPro ? 'blur-sm select-none' : ''}`}>{formatBytes(dir.size)}</span>
    </div>
  );
});

const CategoryGroup = React.memo(function CategoryGroup({
  category,
  dirs,
  isExpanded,
  allSelected,
  someSelected,
  isPro,
  isPathSelected,
  onToggleExpand,
  onToggleCategory,
  onToggleRow,
}: {
  category: string;
  dirs: DevDirectory[];
  isExpanded: boolean;
  allSelected: boolean;
  someSelected: boolean;
  isPro: boolean;
  isPathSelected: (path: string) => boolean;
  onToggleExpand: (category: string) => void;
  onToggleCategory: (dirs: DevDirectory[]) => void;
  onToggleRow: (path: string) => void;
}) {
  const categorySize = useMemo(() => dirs.reduce((sum, d) => sum + d.size, 0), [dirs]);

  return (
    <div className="glass rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center p-3 hover:bg-white/5 transition-colors">
        <button onClick={() => onToggleExpand(category)} className="p-1 mr-2 text-white/70 hover:text-white">
          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
        <input
          type="checkbox"
          checked={allSelected}
          ref={input => {
            if (input) input.indeterminate = !allSelected && someSelected;
          }}
          onChange={() => onToggleCategory(dirs)}
          className="mr-4 w-4 h-4 rounded bg-black/50 border-white/20"
        />
        <div className="flex items-center gap-3 flex-1 text-white cursor-pointer" onClick={() => onToggleExpand(category)}>
          {getCategoryIcon(category)}
          <span className="font-semibold">{category}</span>
          <span className="text-white/50 text-sm ml-auto">{dirs.length} items • <span className={!isPro ? 'blur-sm select-none' : ''}>{formatBytes(categorySize)}</span></span>
        </div>
      </div>

      {isExpanded && (
        <div className="bg-black/20 p-2 border-t border-white/5">
          {dirs.slice(0, 200).map(dir => (
            <DevDirRow key={dir.path} dir={dir} checked={isPathSelected(dir.path)} isPro={isPro} onToggle={onToggleRow} />
          ))}
          {dirs.length > 200 && (
            <p className="text-white/40 text-xs text-center py-2">+ {dirs.length - 200} more items hidden</p>
          )}
        </div>
      )}
    </div>
  );
});

function DevCleanupView({ onDelete, onUpgrade, onSizeChange }: DevCleanupViewProps) {
  const [directories, setDirectories] = useState<DevDirectory[]>([]);
  const { isPro } = usePro();
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const handleScan = async () => {
    setLoading(true);
    setScanError(null);
    try {
      const result = await invoke<DevDirectory[]>('find_dev_directories', { path: '/Users' });
      setDirectories(result || []);
      setScanned(true);
    } catch (error) {
      console.error("Failed to scan directories", error);
      setScanError(String(error));
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

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // Wrapped in startTransition so the checkbox click itself never blocks --
  // React can keep the UI responsive while it works through re-rendering
  // whatever selection changed, instead of freezing the click on a big list.
  const toggleSelectCategory = useCallback((dirs: DevDirectory[]) => {
    if (!isPro) { onUpgrade?.(); return; }
    startTransition(() => {
      setSelectedPaths(prev => {
        const next = new Set(prev);
        const allSelected = dirs.every(d => next.has(d.path));
        if (allSelected) dirs.forEach(d => next.delete(d.path));
        else dirs.forEach(d => next.add(d.path));
        return next;
      });
    });
  }, [isPro, onUpgrade]);

  const toggleSelectPath = useCallback((path: string) => {
    if (!isPro) { onUpgrade?.(); return; }
    startTransition(() => {
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    });
  }, [isPro, onUpgrade]);

  const selectAll = useCallback(() => {
    if (!isPro) { onUpgrade?.(); return; }
    startTransition(() => {
      setSelectedPaths(prev => {
        if (prev.size === directories.length && directories.length > 0) return new Set();
        return new Set(directories.map(d => d.path));
      });
    });
  }, [isPro, onUpgrade, directories]);

  const isPathSelected = useCallback((path: string) => selectedPaths.has(path), [selectedPaths]);

  const totalSelectedSize = useMemo(() => {
    return directories
      .filter(d => selectedPaths.has(d.path))
      .reduce((sum, d) => sum + d.size, 0);
  }, [directories, selectedPaths]);

  const totalRecoverableSize = useMemo(() => directories.reduce((sum, dir) => sum + dir.size, 0), [directories]);

  useEffect(() => {
    onSizeChange?.(totalRecoverableSize);
  }, [totalRecoverableSize, onSizeChange]);

  const handleDelete = () => {
    // Don't remove items from local state here -- `onDelete` only opens a
    // confirmation modal (see App.tsx), the actual move-to-trash happens
    // only if the user confirms. Removing them eagerly meant a cancelled
    // confirmation left this list silently out of sync with disk.
    const toDelete = directories.filter(d => selectedPaths.has(d.path)).map(d => ({ path: d.path, size: d.size }));
    onDelete(toDelete);
    setSelectedPaths(new Set());
  };

  if (!scanned && !loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass rounded-lg border border-white/10">
        <HardDrive className="w-16 h-16 mb-4 text-white/50" />
        <h2 className="text-xl font-bold mb-2 text-white">Developer Cleanup</h2>
        <p className="text-white/70 mb-6 text-center max-w-md">
          Find and remove heavy developer directories like node_modules, target folders, and Python caches.
        </p>
        {scanError && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg max-w-md text-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Scan failed: {scanError}. This can happen if Reclaim doesn't have permission to read {'/Users'} — check Full Disk Access in System Settings, then try again.</span>
          </div>
        )}
        <Button onClick={handleScan} className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <HardDrive className="w-4 h-4" />
          {scanError ? 'Retry Scan' : 'Scan /Users Directory'}
        </Button>
      </div>
    );
  }

  return (
      <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between glass p-4 rounded-lg border border-white/10">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={isPro ? selectAll : onUpgrade} className="border-white/20 text-white hover:bg-white/10">
            {isPro ? (selectedPaths.size === directories.length && directories.length > 0 ? "Deselect All" : "Select All") : 'Select cleanup · PRO'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleScan} disabled={loading} className="border-white/20 text-white hover:bg-white/10 gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Rescan
          </Button>
        </div>
        <div className="text-right mr-4"><p className="text-lg font-bold text-white">{formatBytes(totalRecoverableSize)}</p><p className="text-xs text-white/45">recoverable</p></div>
        <Button
          variant="destructive"
          size="sm"
          onClick={isPro ? handleDelete : onUpgrade}
          disabled={isPro && selectedPaths.size === 0}
          className="gap-2 bg-red-600 hover:bg-red-700 text-white"
        >
          <Trash2 className="w-4 h-4" />
          {isPro ? `Clean Selected (${formatBytes(totalSelectedSize)})` : 'Buy License to Clean'}
        </Button>
      </div>

      {scanError && (
        <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Scan failed: {scanError}. Try Rescan above.</span>
        </div>
      )}

      {loading && directories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 glass rounded-lg border border-white/10">
          <Loader2 className="w-12 h-12 animate-spin text-red-500 mb-4" />
          <p className="text-white/70">Scanning for developer directories...</p>
        </div>
      ) : !loading && directories.length === 0 && !scanError ? (
        <div className="flex flex-col items-center justify-center py-20 glass rounded-lg border border-white/10 text-white/50">
          <CheckCircle2 size={48} className="mb-4 text-green-500/50" />
          <p className="text-lg">No heavy developer directories found!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {Object.entries(grouped).map(([category, dirs]) => {
            const isExpanded = expandedCategories.has(category);
            const allSelected = dirs.length > 0 && dirs.every(d => selectedPaths.has(d.path));
            const someSelected = dirs.some(d => selectedPaths.has(d.path));

            return (
              <CategoryGroup
                key={category}
                category={category}
                dirs={dirs}
                isExpanded={isExpanded}
                allSelected={allSelected}
                someSelected={someSelected}
                isPro={isPro}
                isPathSelected={isPathSelected}
                onToggleExpand={toggleCategory}
                onToggleCategory={toggleSelectCategory}
                onToggleRow={toggleSelectPath}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export const DevCleanupViewMemo = React.memo(DevCleanupView);
export { DevCleanupViewMemo as DevCleanupView };
