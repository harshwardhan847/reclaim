import { useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemCount: number;
  totalSize: number;
  title?: string;
  description?: React.ReactNode;
  isDeleting?: boolean;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  itemCount,
  totalSize,
  title = "Confirm Deletion",
  description,
  isDeleting = false
}: ConfirmDeleteModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || isDeleting) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') onConfirm();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm, isDeleting]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={() => !isDeleting && onClose()}
      />
      
      {/* Modal */}
      <div className="relative glass border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
            <AlertTriangle className="w-8 h-8" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
          
          <div className="text-neutral-400 mb-8 text-sm leading-relaxed">
            {description ? description : (
              <>
                You are about to permanently delete <strong className="text-white font-semibold">{itemCount} items</strong>. 
                This will free up <strong className="text-white font-semibold">{formatBytes(totalSize)}</strong> of space. 
                <br/><br/>This action cannot be undone.
              </>
            )}
          </div>
          
          <div className="flex gap-4 w-full">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 h-12 border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white rounded-xl transition-all"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-900/30 transition-all font-semibold"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
