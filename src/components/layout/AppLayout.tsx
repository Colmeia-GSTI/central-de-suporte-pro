import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { SessionExpiryIndicator } from "./SessionExpiryIndicator";
import { BackgroundPattern } from "./BackgroundPattern";
import { GlobalProgress } from "./GlobalProgress";

import { Search, Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

type Theme = "light" | "dark" | "system";

export function AppLayout({ children, title }: AppLayoutProps) {
  const [theme, setTheme] = useState<Theme>("system");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // Realtime subscriptions now handled globally by useUnifiedRealtime

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme("system");
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (newTheme === "system") {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(systemDark ? "dark" : "light");
    } else {
      root.classList.add(newTheme);
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "dark":
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Determine if searching for ticket number or client
      const isTicketNumber = /^#?\d+$/.test(searchQuery.trim());
      if (isTicketNumber) {
        navigate(`/tickets?search=${encodeURIComponent(searchQuery.trim())}`);
      } else {
        navigate(`/clients?search=${encodeURIComponent(searchQuery.trim())}`);
      }
      setSearchQuery("");
    }
  };

  return (
    <SidebarProvider>
      <GlobalProgress />
      <BackgroundPattern />
      
      <div className="min-h-[100dvh] flex w-full relative">
        <AppSidebar />
        
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Premium Header */}
          <header className={cn(
            "h-14 md:h-16 glass-header sticky top-0 z-40",
            "flex items-center justify-between px-3 md:px-4 gap-2 md:gap-4"
          )}>
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover-glow rounded-lg" />
              {title && (
                <h1 className="font-semibold text-lg animate-fade-in">
                  {title}
                </h1>
              )}
            </div>
            
            {/* Search with glass effect */}
            <form onSubmit={handleSearch} className="hidden sm:block flex-1 max-w-md">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  type="search"
                  placeholder="Buscar chamados (#123), clientes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  title="Digite o número do chamado com # ou nome do cliente"
                  className={cn(
                    "pl-9 bg-muted/30 border-border/50 text-base",
                    "focus:bg-muted/50 focus:border-primary/50",
                    "transition-all duration-300",
                    "placeholder:text-muted-foreground/60"
                  )}
                />
              </div>
            </form>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <SessionExpiryIndicator />
              
              {/* Theme Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="hover-glow rounded-lg"
                  >
                    {getThemeIcon()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-card">
                  <DropdownMenuItem 
                    onClick={() => handleThemeChange("light")}
                    className={cn(theme === "light" && "bg-muted")}
                  >
                    <Sun className="h-4 w-4 mr-2" />
                    Claro
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleThemeChange("dark")}
                    className={cn(theme === "dark" && "bg-muted")}
                  >
                    <Moon className="h-4 w-4 mr-2" />
                    Escuro
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleThemeChange("system")}
                    className={cn(theme === "system" && "bg-muted")}
                  >
                    <Monitor className="h-4 w-4 mr-2" />
                    Sistema
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <NotificationDropdown />
            </div>
          </header>
          
          {/* Main content */}
          <div className="flex-1 p-3 md:p-6 overflow-auto overflow-x-hidden">
            {children}
          </div>
        </main>
        
        {/* Quick Actions FAB */}
        {!location.pathname.startsWith("/settings") && <QuickActionsFAB />}
      </div>
    </SidebarProvider>
  );
}
