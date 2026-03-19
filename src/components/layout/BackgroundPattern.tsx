import { memo } from "react";

// Memoized to prevent re-renders — this is a purely static decoration
export const BackgroundPattern = memo(function BackgroundPattern() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Main background */}
      <div className="absolute inset-0 bg-background" />
      
      {/* Hexagon pattern - static, no animation */}
      <svg 
        className="absolute inset-0 w-full h-full opacity-[0.03] dark:opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern 
            id="hexagons" 
            width="56" 
            height="100" 
            patternUnits="userSpaceOnUse"
            patternTransform="scale(1.5)"
          >
            <path 
              d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5L28 0Z
                 M28 100L56 83.5V50.5L28 34L0 50.5V83.5L28 100Z"
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexagons)" />
      </svg>
      
      {/* Static honey orbs */}
      <div 
        className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 dark:opacity-15 blur-3xl"
        style={{
          background: 'radial-gradient(circle, hsl(var(--glow-primary) / 0.5) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute top-3/4 -right-32 w-80 h-80 rounded-full opacity-20 dark:opacity-15 blur-3xl"
        style={{
          background: 'radial-gradient(circle, hsl(var(--glow-accent) / 0.5) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10 dark:opacity-5 blur-3xl"
        style={{
          background: 'radial-gradient(circle, hsl(var(--glow-neon) / 0.4) 0%, transparent 70%)',
        }}
      />
      
      {/* Carbon fiber texture overlay for dark mode */}
      <div 
        className="absolute inset-0 opacity-0 dark:opacity-30"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              hsl(var(--background)) 2px,
              hsl(var(--background)) 4px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              hsl(var(--background)) 2px,
              hsl(var(--background)) 4px
            )
          `,
          backgroundSize: '4px 4px',
        }}
      />
      
      {/* Subtle gradient overlay */}
      <div 
        className="absolute inset-0 opacity-30 dark:opacity-50"
        style={{
          background: 'radial-gradient(ellipse at top, transparent 0%, hsl(var(--background)) 70%)',
        }}
      />
      
      {/* Bottom fade */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{
          background: 'linear-gradient(to top, hsl(var(--background)), transparent)',
        }}
      />
    </div>
  );
});
