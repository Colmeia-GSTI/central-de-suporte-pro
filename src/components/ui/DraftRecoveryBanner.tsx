import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DraftRecoveryBannerProps {
  onClear: () => void;
}

export function DraftRecoveryBanner({ onClear }: DraftRecoveryBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md mb-4 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4" />
        <span>Rascunho recuperado automaticamente</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-6 px-2 text-amber-700 hover:text-amber-900 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
      >
        <X className="h-3 w-3 mr-1" />
        Limpar
      </Button>
    </div>
  );
}
