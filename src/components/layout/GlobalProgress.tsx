import { useIsFetching } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function GlobalProgress() {
  const isFetching = useIsFetching();

  if (!isFetching) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden">
      <div 
        className={cn(
          "h-full w-full",
          "bg-gradient-to-r from-primary via-accent to-glow-neon",
          "animate-progress-bar"
        )}
        style={{
          backgroundSize: '200% 100%',
        }}
      />
      {/* Glow effect */}
      <div 
        className="absolute inset-0 blur-sm"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--glow-primary) / 0.5), hsl(var(--glow-accent) / 0.5), hsl(var(--glow-neon) / 0.5))',
        }}
      />
    </div>
  );
}
