import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80 hover:scale-105 active:scale-95",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:scale-105 active:scale-95",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 hover:scale-105 active:scale-95",
        outline: "text-foreground hover:bg-muted active:scale-95",
        success: "border-transparent bg-success text-success-foreground hover:bg-success/80 hover:scale-105 active:scale-95",
        warning: "border-transparent bg-warning text-warning-foreground hover:bg-warning/80 hover:scale-105 active:scale-95",
        info: "border-transparent bg-info text-info-foreground hover:bg-info/80 hover:scale-105 active:scale-95",
        premium: "badge-premium text-primary hover:scale-105 active:scale-95",
        glow: "border-primary/30 bg-primary/10 text-primary shadow-[0_0_10px_hsl(var(--glow-primary)/0.3)] hover:shadow-[0_0_15px_hsl(var(--glow-primary)/0.5)] hover:scale-105 active:scale-95",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
