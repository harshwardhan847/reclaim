import { Button } from "./ui/button";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface ReclaimBannerProps {
  duplicateWaste: number;
  aiCacheSize: number;
  largeFilesSize: number;
  leftoverSize: number;
  onReclaimCategory: (category: string) => void;
}

export function ReclaimBanner({
  duplicateWaste,
  aiCacheSize,
  largeFilesSize,
  leftoverSize,
  onReclaimCategory
}: ReclaimBannerProps) {
  const totalReclaimable = duplicateWaste + aiCacheSize + largeFilesSize + leftoverSize;
  
  if (totalReclaimable === 0) {
    return null;
  }

  return (
    <div className="glass rounded-xl p-6 border border-white/20 relative overflow-hidden bg-gradient-to-r from-red-950/40 to-black/80 flex flex-col items-center text-center">
      <h2 className="text-3xl font-bold text-white mb-4">
        You can reclaim <span className="text-red-500">{formatBytes(totalReclaimable)}</span>
      </h2>
      
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {duplicateWaste > 0 && (
          <button 
            onClick={() => onReclaimCategory('duplicates')}
            className="px-4 py-2 rounded-full glass border border-white/10 hover:border-white/30 text-white/80 hover:text-white transition-all hover:scale-105 active:scale-95 text-sm flex items-center gap-2"
          >
            <span>🗑️</span> Duplicates ({formatBytes(duplicateWaste)})
          </button>
        )}
        
        {aiCacheSize > 0 && (
          <button 
            onClick={() => onReclaimCategory('ai_cache')}
            className="px-4 py-2 rounded-full glass border border-white/10 hover:border-white/30 text-white/80 hover:text-white transition-all hover:scale-105 active:scale-95 text-sm flex items-center gap-2"
          >
            <span>🤖</span> AI Cache ({formatBytes(aiCacheSize)})
          </button>
        )}
        
        {largeFilesSize > 0 && (
          <button 
            onClick={() => onReclaimCategory('large_files')}
            className="px-4 py-2 rounded-full glass border border-white/10 hover:border-white/30 text-white/80 hover:text-white transition-all hover:scale-105 active:scale-95 text-sm flex items-center gap-2"
          >
            <span>📦</span> Large Files ({formatBytes(largeFilesSize)})
          </button>
        )}
        
        {leftoverSize > 0 && (
          <button 
            onClick={() => onReclaimCategory('leftovers')}
            className="px-4 py-2 rounded-full glass border border-white/10 hover:border-white/30 text-white/80 hover:text-white transition-all hover:scale-105 active:scale-95 text-sm flex items-center gap-2"
          >
            <span>📱</span> App Leftovers ({formatBytes(leftoverSize)})
          </button>
        )}
      </div>

      <Button 
        onClick={() => onReclaimCategory('all')} 
        className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-2 h-auto text-lg w-full max-w-sm rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)]"
      >
        Reclaim All Safe Space
      </Button>
    </div>
  );
}
