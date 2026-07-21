import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  return <div className="w-full h-full min-w-0">{children}</div>;
}
