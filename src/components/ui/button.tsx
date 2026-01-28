import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:shadow-inner",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/25 active:shadow-inner",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent active:bg-accent/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline active:opacity-70",
        premium: "btn-premium rounded-lg active:scale-[0.98]",
        glow: "bg-primary text-primary-foreground hover:shadow-glow-lg active:shadow-glow",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ripple?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ripple = true, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (ripple && buttonRef.current) {
        const button = buttonRef.current;
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rippleEl = document.createElement("span");
        rippleEl.className = "ripple-effect";
        rippleEl.style.left = `${x}px`;
        rippleEl.style.top = `${y}px`;

        button.appendChild(rippleEl);

        setTimeout(() => {
          rippleEl.remove();
        }, 600);
      }

      onClick?.(e);
    };

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          ripple && "relative overflow-hidden"
        )}
        ref={(node) => {
          // Handle both refs
          (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        onClick={handleClick}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
