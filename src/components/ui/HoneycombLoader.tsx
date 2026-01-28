import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HoneycombLoaderProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export function HoneycombLoader({ size = "md", text, className }: HoneycombLoaderProps) {
  const sizes = {
    sm: { hex: 16, gap: 2, container: 60 },
    md: { hex: 24, gap: 3, container: 90 },
    lg: { hex: 32, gap: 4, container: 120 },
  };

  const { hex, gap, container } = sizes[size];

  // Hexagon positions for honeycomb pattern (7 hexagons)
  const hexPositions = [
    { x: 0, y: 0 },           // Center
    { x: 1, y: -0.5 },        // Top right
    { x: 1, y: 0.5 },         // Bottom right
    { x: 0, y: 1 },           // Bottom
    { x: -1, y: 0.5 },        // Bottom left
    { x: -1, y: -0.5 },       // Top left
    { x: 0, y: -1 },          // Top
  ];

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div 
        className="relative"
        style={{ width: container, height: container }}
      >
        {hexPositions.map((pos, index) => {
          const offsetX = pos.x * (hex + gap) * 0.866;
          const offsetY = pos.y * (hex + gap);
          
          return (
            <motion.div
              key={index}
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: hex,
                height: hex,
                marginLeft: -hex / 2 + offsetX,
                marginTop: -hex / 2 + offsetY,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: [0, 1, 1, 0],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: index * 0.15,
                ease: "easeInOut",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-full h-full"
                style={{
                  filter: `drop-shadow(0 0 ${hex / 4}px hsl(var(--glow-primary) / 0.5))`,
                }}
              >
                <defs>
                  <linearGradient id={`honey-gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2L22 8.5V17.5L12 24L2 17.5V8.5L12 2Z"
                  fill={`url(#honey-gradient-${index})`}
                  stroke="hsl(var(--primary))"
                  strokeWidth="0.5"
                />
              </svg>
            </motion.div>
          );
        })}
        
        {/* Center glow */}
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl opacity-40"
          style={{
            width: hex * 2,
            height: hex * 2,
            background: 'radial-gradient(circle, hsl(var(--glow-primary)), transparent 70%)',
          }}
        />
      </div>
      
      {text && (
        <motion.p
          className="text-sm text-muted-foreground font-medium"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

// Full page loader variant
interface PageLoaderProps {
  text?: string;
}

export function PageLoader({ text = "Carregando..." }: PageLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      {/* Hexagon background pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="loader-hex" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)">
            <path d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5L28 0Z M28 100L56 83.5V50.5L28 34L0 50.5V83.5L28 100Z" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#loader-hex)" />
      </svg>
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10"
      >
        <HoneycombLoader size="lg" text={text} />
      </motion.div>
    </div>
  );
}

// Inline loader for buttons/cards
export function InlineLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <motion.svg
          key={i}
          viewBox="0 0 24 24"
          className="w-3 h-3"
          animate={{ 
            scale: [0.8, 1, 0.8],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        >
          <path
            d="M12 2L22 8.5V17.5L12 24L2 17.5V8.5L12 2Z"
            fill="currentColor"
          />
        </motion.svg>
      ))}
    </div>
  );
}

// Skeleton with honeycomb shimmer
export function HoneycombSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-muted", className)}>
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.1), transparent)',
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
