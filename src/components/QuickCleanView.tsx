import { usePro } from '@/hooks/usePro';
import React, { useMemo, useState, startTransition } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Sparkles, Trash2, Copy, Bot, Code, Loader2 } from 'lucide-react';
import { getSafetyInfo } from '@/lib/safety';
import { SafetyBadge } from '@/components/SafetyBadge';

// Only categories that are safe to delete by their very nature -- no human
// judgment call required -- belong here. See App.tsx for why Large Files
// and App Leftovers are deliberately excluded from this combined list.
export interface CombinedCleanupItem {
  path: string;
  name: string;
  size: number;
  category: 'Duplicates' | 'AI Cache' | 'Dev Cleanup';
  /** For Dev Cleanup items: the specific kind (e.g. "Rust Targets"), used in the safety tooltip. */
  devCategory?: string;
}

const CATEGORY_ICON: Record<CombinedCleanupItem['category'], React.ReactNode> = {
  'Duplicates': <Copy size={14} />,
  'AI Cache': <Bot size={14} />,
  'Dev Cleanup': <Code size={14} />,
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const ROW_CAP = 500;

export function QuickCleanView({
  items,
  loading,
  onDelete,
  onUpgrade,
}: {
  items: CombinedCleanupItem[];
  loading: boolean;
  onDelete: (items: { path: string; size: number }[]) => void;
  onUpgrade?: () => void;
}) {
  const { isPro } = usePro();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => [...items].sort((a, b) => b.size - a.size), [items]);
  const visible = useMemo(() => sorted.slice(0, ROW_CAP), [sorted]);
  const totalSize = useMemo(() => items.reduce((sum, i) => sum + i.size, 0), [items]);
  const selectedSize = useMemo(
    () => items.filter(i => selected.has(i.path)).reduce((sum, i) => sum + i.size, 0),
    [items, selected]
  );

  const toggleOne = (path: string) => {
    startTransition(() => {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    });
  };

  const toggleAll = () => {
    startTransition(() => {
      setSelected(prev => (prev.size === visible.length ? new Set() : new Set(visible.map(i => i.path))));
    });
  };

  const handleCleanSelected = () => {
    const toDelete = items.filter(i => selected.has(i.path)).map(i => ({ path: i.path, size: i.size }));
    onDelete(toDelete);
    setSelected(new Set());
  };

  const handleCleanEverything = () => {
    onDelete(items.map(i => ({ path: i.path, size: i.size })));
    setSelected(new Set());
  };

  return (
    <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col h-full min-h-0">
      <div className="p-6 border-b border-white/5 flex flex-wrap items-center justify-between gap-4 bg-black/20">
        <div>
          <h2 className="font-bold text-2xl text-white">Quick Clean</h2>
          <p className="text-sm text-neutral-400 mt-1">Duplicate copies, tool caches, and build artifacts -- safe to remove, nothing to review first.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2 justify-end">
            {loading && <Loader2 size={22} className="animate-spin text-primary" />}
            {formatSize(totalSize)} <span className="text-lg text-neutral-500 font-medium">recoverable</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-3 bg-black/40 flex flex-wrap items-center justify-between gap-3 border-b border-white/5">
        <button
          onClick={isPro ? toggleAll : onUpgrade}
          className="flex items-center space-x-2 text-sm text-neutral-300 hover:text-white transition-colors"
        >
          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.size === visible.length && visible.length > 0 ? 'bg-primary border-primary' : 'border-white/20'}`}>
            {selected.size === visible.length && visible.length > 0 && <CheckCircle2 size={14} className="text-white" />}
          </div>
          <span>{isPro ? 'Select All' : 'Inspect cleanup · PRO'}</span>
        </button>

        <div className="flex items-center gap-2">
          {isPro && selected.size === 0 && items.length > 0 && (
            <Button
              onClick={handleCleanEverything}
              className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-900/20 gap-2"
            >
              <Sparkles size={16} />
              Clean Everything Safely ({formatSize(totalSize)})
            </Button>
          )}
          {isPro && selected.size > 0 && (
            <Button
              onClick={handleCleanSelected}
              className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-900/20 gap-2"
            >
              <Trash2 size={16} />
              Delete Selected ({formatSize(selectedSize)})
            </Button>
          )}
          {!isPro && (
            <Button onClick={onUpgrade} className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-900/20">
              Buy License to Clean
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-auto flex-1 min-h-0 p-2 custom-scrollbar">
        {items.length === 0 && loading && (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {items.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
            <CheckCircle2 size={48} className="mb-4 text-green-500/50" />
            <p className="text-lg">Nothing safe to clean up right now!</p>
          </div>
        )}

        {items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-12"></TableHead>
                <TableHead className="text-muted-foreground font-medium">Item</TableHead>
                <TableHead className="hidden text-muted-foreground font-medium sm:table-cell">Category</TableHead>
                <TableHead className="text-right text-muted-foreground font-medium">Size</TableHead>
                <TableHead className="text-right text-muted-foreground font-medium">Safety</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(item => {
                const safety = getSafetyInfo(item.category, { path: item.path, name: item.name, devCategory: item.devCategory });
                return (
                  <TableRow
                    key={item.path}
                    className="border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none"
                    onClick={() => isPro ? toggleOne(item.path) : onUpgrade?.()}
                  >
                    <TableCell className="w-12 text-center">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selected.has(item.path) ? 'bg-primary border-primary' : 'border-white/20'}`}>
                        {selected.has(item.path) && <CheckCircle2 size={14} className="text-white" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate max-w-40 sm:max-w-md">{item.name}</p>
                        <p className={`text-xs text-neutral-500 truncate max-w-40 sm:max-w-md ${!isPro ? 'blur-sm select-none' : ''}`}>{item.path}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-neutral-400 sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 text-xs border border-white/5 font-medium whitespace-nowrap">
                        {CATEGORY_ICON[item.category]}
                        {item.category}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-medium text-white whitespace-nowrap ${!isPro ? 'blur-sm select-none' : ''}`}>
                      {formatSize(item.size)}
                    </TableCell>
                    <TableCell className="text-right">
                      <SafetyBadge info={safety} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {items.length > ROW_CAP && (
          <p className="text-white/40 text-xs text-center py-3">
            + {items.length - ROW_CAP} more items hidden (still included in Clean Everything and the total above)
          </p>
        )}
      </div>
    </div>
  );
}
