import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Ticket, Users, DollarSign, X, FileText, Calendar, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { Module, ModuleAction } from "@/lib/permissions";

interface QuickAction {
  icon: typeof Plus;
  label: string;
  path: string;
  color: string;
  delay: string;
  module: Module;
  action: ModuleAction;
}

const allActions: QuickAction[] = [
  { 
    icon: Ticket, 
    label: "Novo Chamado", 
    path: "/tickets/new",
    color: "from-blue-500 to-cyan-500",
    delay: "0ms",
    module: "tickets",
    action: "create",
  },
  { 
    icon: Users, 
    label: "Novo Cliente", 
    path: "/clients?action=new",
    color: "from-emerald-500 to-teal-500",
    delay: "50ms",
    module: "clients",
    action: "create",
  },
  { 
    icon: DollarSign, 
    label: "Nova Fatura", 
    path: "/billing?action=new",
    color: "from-amber-500 to-orange-500",
    delay: "100ms",
    module: "financial",
    action: "create",
  },
  { 
    icon: FileText, 
    label: "Novo Contrato", 
    path: "/contracts/new",
    color: "from-purple-500 to-violet-500",
    delay: "150ms",
    module: "contracts",
    action: "create",
  },
  { 
    icon: Calendar, 
    label: "Novo Evento", 
    path: "/calendar?action=new",
    color: "from-pink-500 to-rose-500",
    delay: "200ms",
    module: "calendar",
    action: "create",
  },
  { 
    icon: Package, 
    label: "Novo Ativo", 
    path: "/inventory?action=new",
    color: "from-indigo-500 to-blue-500",
    delay: "250ms",
    module: "inventory",
    action: "create",
  },
];

export function QuickActionsFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { can } = usePermissions();

  // Filter actions based on permissions
  const actions = allActions.filter(action => can(action.module, action.action));

  // Don't render FAB if no actions are available
  if (actions.length === 0) return null;

  const handleAction = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-3 pointer-events-none">
        {/* Backdrop for dark mode visibility */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm -z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}
        {/* Action buttons */}
        {actions.map((action) => (
          <Tooltip key={action.path}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className={cn(
                  "h-12 w-12 rounded-full shadow-lg transition-all duration-300 pointer-events-auto",
                  "bg-gradient-to-r hover:scale-110 active:scale-95",
                  "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                  action.color,
                  isOpen
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4 pointer-events-none"
                )}
                style={{
                  transitionDelay: isOpen ? action.delay : "0ms",
                }}
                onClick={() => handleAction(action.path)}
                aria-label={action.label}
                title={action.label}
              >
                <action.icon className="h-5 w-5 text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="glass-card">
              <p>{action.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Main FAB button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              className={cn(
                "h-14 w-14 rounded-full shadow-xl transition-all duration-300 pointer-events-auto",
                "btn-premium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                "active:scale-95",
                isOpen && "rotate-45"
              )}
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Fechar menu de ações rápidas" : "Abrir menu de ações rápidas"}
              aria-expanded={isOpen}
              aria-controls="fab-menu"
              title={isOpen ? "Fechar ações" : "Abrir ações rápidas"}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Plus className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="glass-card">
            <p>{isOpen ? "Fechar" : "Ações Rápidas"}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
