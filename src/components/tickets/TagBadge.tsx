import { cn } from "@/lib/utils";

interface TagBadgeProps {
  name: string;
  color?: string;
  onRemove?: () => void;
  className?: string;
}

export function TagBadge({ name, color = "#6b7280", onRemove, className }: TagBadgeProps) {
  // Convert hex to rgba for better contrast
  const bgColor = `${color}20`; // 20 = 12.5% opacity in hex
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        className
      )}
      style={{
        backgroundColor: bgColor,
        borderColor: color,
        color: color,
      }}
    >
      <span 
        className="w-1.5 h-1.5 rounded-full" 
        style={{ backgroundColor: color }}
      />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          aria-label={`Remover tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
