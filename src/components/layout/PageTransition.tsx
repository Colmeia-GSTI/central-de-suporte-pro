import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  return <div className="w-full h-full min-w-0">{children}</div>;
}

// Disabled route change loader to prevent flickering on remote connections
export function RouteChangeLoader() {
  return null;
}

// Disabled progress bar to prevent flickering on remote connections
export function RouteProgressBar() {
  return null;
}

// Disabled route change loader to prevent flickering on remote connections
export function RouteChangeLoader() {
  return null;
}

// Disabled progress bar to prevent flickering on remote connections
export function RouteProgressBar() {
  return null;
}