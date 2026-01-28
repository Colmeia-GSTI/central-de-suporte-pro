import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Clock, 
  User, 
  Pencil, 
  CheckCircle, 
  MessageSquare, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  FileText,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface HistoryEntry {
  id: string;
  user_name: string | null;
  action: string;
  details?: string | null;
  created_at: string;
}

interface EntityHistoryTimelineProps {
  entries: HistoryEntry[];
  isLoading?: boolean;
  maxItems?: number;
  emptyMessage?: string;
}

function getActionIcon(action: string) {
  const lowerAction = action.toLowerCase();
  
  if (lowerAction.includes("criado") || lowerAction.includes("created")) {
    return <FileText className="h-3 w-3" />;
  }
  if (lowerAction.includes("status") || lowerAction.includes("alterado")) {
    return <RefreshCw className="h-3 w-3" />;
  }
  if (lowerAction.includes("comentário") || lowerAction.includes("comment")) {
    return <MessageSquare className="h-3 w-3" />;
  }
  if (lowerAction.includes("resolvido") || lowerAction.includes("resolved")) {
    return <CheckCircle className="h-3 w-3" />;
  }
  if (lowerAction.includes("edição") || lowerAction.includes("edit")) {
    return <Pencil className="h-3 w-3" />;
  }
  return <AlertCircle className="h-3 w-3" />;
}

function getActionColor(action: string) {
  const lowerAction = action.toLowerCase();
  
  if (lowerAction.includes("criado") || lowerAction.includes("created")) {
    return "text-blue-500 bg-blue-500/10";
  }
  if (lowerAction.includes("resolvido") || lowerAction.includes("resolved")) {
    return "text-green-500 bg-green-500/10";
  }
  if (lowerAction.includes("erro") || lowerAction.includes("error")) {
    return "text-red-500 bg-red-500/10";
  }
  return "text-muted-foreground bg-muted";
}

export function EntityHistoryTimeline({ 
  entries, 
  isLoading = false, 
  maxItems = 5,
  emptyMessage = "Nenhum histórico disponível"
}: EntityHistoryTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        {emptyMessage}
      </p>
    );
  }
  
  const visibleEntries = isExpanded ? entries : entries.slice(0, maxItems);
  const hasMore = entries.length > maxItems;
  
  return (
    <div className="space-y-1">
      {visibleEntries.map((entry, index) => (
        <div 
          key={entry.id} 
          className={cn(
            "flex gap-3 py-2 px-2 rounded-md transition-colors hover:bg-muted/50",
            index === 0 && "bg-muted/30"
          )}
        >
          {/* Icon */}
          <div className={cn(
            "flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center",
            getActionColor(entry.action)
          )}>
            {getActionIcon(entry.action)}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {entry.action}
            </p>
            {entry.details && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {entry.details}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {entry.user_name || "Sistema"}
              </span>
              <span>•</span>
              <span 
                className="flex items-center gap-1" 
                title={format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              >
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(entry.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            </div>
          </div>
        </div>
      ))}
      
      {/* Expand/Collapse Button */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Ver mais ({entries.length - maxItems} restantes)
            </>
          )}
        </Button>
      )}
    </div>
  );
}
