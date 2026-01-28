import { motion } from "framer-motion";

interface ColmeiaLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export function ColmeiaLogo({ size = "md", showText = true, className = "" }: ColmeiaLogoProps) {
  const sizes = {
    sm: { icon: 32, text: "text-lg" },
    md: { icon: 40, text: "text-xl" },
    lg: { icon: 56, text: "text-3xl" },
  };

  const { icon: iconSize, text: textSize } = sizes[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Hexagon Icon */}
      <motion.div
        className="relative"
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 56 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_12px_hsl(var(--glow-primary)/0.5)]"
        >
          {/* Outer hexagon */}
          <motion.path
            d="M28 2L52 15.5V42.5L28 56L4 42.5V15.5L28 2Z"
            fill="url(#honeygradient)"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />
          
          {/* Inner honeycomb pattern */}
          <path
            d="M28 14L40 21.5V36.5L28 44L16 36.5V21.5L28 14Z"
            fill="hsl(var(--background))"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            opacity="0.8"
          />
          
          {/* Center hexagon */}
          <motion.path
            d="M28 22L34 25.5V32.5L28 36L22 32.5V25.5L28 22Z"
            fill="hsl(var(--primary))"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          />
          
          <defs>
            <linearGradient id="honeygradient" x1="4" y1="2" x2="52" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="hsl(var(--primary))" />
              <stop offset="1" stopColor="hsl(var(--accent))" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Glow effect */}
        <div 
          className="absolute inset-0 rounded-full blur-xl opacity-30 -z-10"
          style={{
            background: 'radial-gradient(circle, hsl(var(--glow-primary) / 0.6), transparent 70%)',
          }}
        />
      </motion.div>

      {/* Text */}
      {showText && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col"
        >
          <span className={`font-bold ${textSize} text-gradient leading-none`}>
            Colmeia
          </span>
          {size !== "sm" && (
            <span className="text-xs text-muted-foreground tracking-wider uppercase">
              Central de Atendimento
            </span>
          )}
        </motion.div>
      )}
    </div>
  );
}
