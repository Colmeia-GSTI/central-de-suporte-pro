import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useTechnicianTicketCount } from "@/hooks/useTechnicianTicketCount";
import { Module, AppRole } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Ticket,
  Users,
  FileText,
  Monitor,
  Package,
  Trophy,
  Calendar,
  Tv,
  BookOpen,
  Settings,
  LogOut,
  BarChart3,
  Hexagon,
  Receipt,
  LucideIcon,
  AlertTriangle,
  ShieldCheck,
  Briefcase,
  Wrench,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MenuItemType {
  title: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
  tooltip?: string;
}

// PRINCIPAL - Acesso geral
const mainMenuItems: MenuItemType[] = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/", tooltip: "Visão geral do sistema" },
  { title: "Chamados", icon: Ticket, path: "/tickets", tooltip: "Gestão de tickets de suporte" },
  { title: "Clientes", icon: Users, path: "/clients", tooltip: "Cadastro e gestão de clientes" },
];

// OPERAÇÕES - Fluxo de trabalho técnico
const operationsMenuItems: MenuItemType[] = [
  { title: "Contratos", icon: FileText, path: "/contracts", tooltip: "Contratos de serviço" },
  { title: "Monitoramento", icon: Monitor, path: "/monitoring", tooltip: "Alertas e status de dispositivos" },
  { title: "Inventário", icon: Package, path: "/inventory", tooltip: "Ativos, licenças e manutenções" },
  { title: "Agenda", icon: Calendar, path: "/calendar", tooltip: "Eventos e agendamentos" },
  { title: "Base de Conhecimento", icon: BookOpen, path: "/knowledge", tooltip: "Artigos e documentação" },
];

// FINANCEIRO - Gestão financeira
const financialMenuItems: MenuItemType[] = [
  { title: "Faturamento", icon: Receipt, path: "/billing", tooltip: "Faturas, boletos e NFS-e" },
  { title: "Serviços", icon: Wrench, path: "/billing?tab=services", tooltip: "Catálogo de serviços e preços" },
  { title: "Inadimplência", icon: AlertTriangle, path: "/billing/delinquency", tooltip: "Relatório de inadimplência" },
  { title: "Relatórios", icon: BarChart3, path: "/reports", tooltip: "Relatórios e análises" },
];

// EQUIPE - Ferramentas de equipe
const teamMenuItems: MenuItemType[] = [
  { title: "Gamificação", icon: Trophy, path: "/gamification", tooltip: "Ranking e conquistas da equipe" },
  { title: "Dashboard TV", icon: Tv, path: "/tv-dashboard", tooltip: "Dashboard para monitores" },
];

// ADMINISTRAÇÃO - Configurações do sistema
const adminMenuItems: MenuItemType[] = [
  { title: "Certificados", icon: ShieldCheck, path: "/settings/certificates", tooltip: "Gestão de certificados digitais" },
  { title: "Configurações", icon: Settings, path: "/settings", tooltip: "Configurações do sistema" },
];

// Map paths to permission modules
const pathToModule: Record<string, Module> = {
  "/": "dashboard",
  "/tickets": "tickets",
  "/clients": "clients",
  "/contracts": "contracts",
  "/monitoring": "monitoring",
  "/inventory": "inventory",
  "/calendar": "calendar",
  "/gamification": "gamification",
  "/knowledge": "knowledge",
  "/billing": "financial",
  "/billing?tab=services": "services",
  "/billing/delinquency": "financial",
  "/reports": "reports",
  "/settings": "settings",
  "/settings/certificates": "financial",
};

// Special routes that don't have a permission module
const specialRoutes: Record<string, AppRole[]> = {
  "/tv-dashboard": ["admin", "manager"],
};

export function AppSidebar() {
  const location = useLocation();
  const { profile, signOut, roles } = useAuth();
  const { can } = usePermissions();
  const { data: ticketCount } = useTechnicianTicketCount();
  const { isMobile, setOpenMobile } = useSidebar();

  // Filter menu items based on permissions
  const filterMenuItems = (items: MenuItemType[]): MenuItemType[] => {
    return items.filter(item => {
      // Check special routes first
      if (specialRoutes[item.path]) {
        return roles.some(role => specialRoutes[item.path].includes(role as AppRole));
      }

      // Check permission module (supports paths with query strings)
      const module = pathToModule[item.path];
      if (!module) {
        // Fallback: check base path without query string
        const basePath = item.path.split("?")[0];
        const baseModule = pathToModule[basePath];
        if (baseModule) return can(baseModule, "view");
        return true;
      }
      return can(module, "view");
    });
  };

  const filteredMainItems = filterMenuItems(mainMenuItems);
  const filteredOperationsItems = filterMenuItems(operationsMenuItems);
  const filteredFinancialItems = filterMenuItems(financialMenuItems);
  const filteredTeamItems = filterMenuItems(teamMenuItems);
  const filteredAdminItems = filterMenuItems(adminMenuItems);

  const MenuItem = ({ item }: { item: MenuItemType }) => {
    // Check if path includes query string
    const itemPathBase = item.path.split("?")[0];
    const itemQuery = item.path.includes("?") ? item.path.split("?")[1] : null;
    const isActive = itemQuery
      ? location.pathname === itemPathBase && location.search.includes(itemQuery)
      : location.pathname === item.path;
    const showTicketBadge = item.path === "/tickets" && ticketCount && ticketCount > 0;
    
    const handleClick = () => {
      // Close mobile sidebar when clicking a menu item
      if (isMobile) {
        setOpenMobile(false);
      }
    };
    
    const menuContent = (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive} className="relative group">
          <Link 
            to={item.path}
            onClick={handleClick}
            className={cn(
              "flex items-center gap-3 transition-all duration-300",
              "hover:bg-sidebar-accent/50",
              isActive && "bg-sidebar-accent"
            )}
          >
            {isActive && <span className="active-indicator animate-scale-in" />}
            <item.icon className={cn(
              "h-4 w-4 transition-all duration-300",
              "group-hover:text-sidebar-primary",
              isActive && "text-sidebar-primary"
            )} />
            <span className={cn("transition-colors duration-300 flex-1", isActive && "font-medium")}>
              {item.title}
            </span>
            {item.badge && (
              <Badge variant="outline" className="ml-auto text-[10px] h-5">
                {item.badge}
              </Badge>
            )}
            {showTicketBadge && (
              <Badge 
                variant="secondary" 
                className="ml-auto bg-primary text-primary-foreground text-xs h-5 min-w-5 flex items-center justify-center"
              >
                {ticketCount > 99 ? "99+" : ticketCount}
              </Badge>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

    // Wrap with tooltip if tooltip text exists
    if (item.tooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {menuContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <p>{item.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return menuContent;
  };

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getRoleBadge = () => {
    if (roles.includes("admin")) return "Admin";
    if (roles.includes("manager")) return "Gerente";
    if (roles.includes("technician")) return "Técnico";
    if (roles.includes("financial")) return "Financeiro";
    if (roles.includes("client_master")) return "Cliente Master";
    if (roles.includes("client")) return "Cliente";
    return "Usuário";
  };

  const getRoleColor = () => {
    if (roles.includes("admin")) return "from-amber-500 to-yellow-400";
    if (roles.includes("manager")) return "from-yellow-500 to-amber-400";
    if (roles.includes("technician")) return "from-amber-600 to-orange-400";
    if (roles.includes("financial")) return "from-yellow-600 to-amber-500";
    return "from-gray-500 to-slate-500";
  };

  return (
    <Sidebar className="border-r border-sidebar-border glass-sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            "bg-gradient-to-br from-primary to-accent",
            "shadow-lg shadow-primary/25"
          )}>
            <Hexagon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gradient">Colmeia</h1>
            <p className="text-xs text-sidebar-foreground/50">Central de Atendimento</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-premium">
        {filteredMainItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] font-semibold tracking-wider">Principal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{filteredMainItems.map((item) => <MenuItem key={item.path} item={item} />)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredOperationsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] font-semibold tracking-wider">Operações</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{filteredOperationsItems.map((item) => <MenuItem key={item.path} item={item} />)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredFinancialItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] font-semibold tracking-wider">Financeiro</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{filteredFinancialItems.map((item) => <MenuItem key={item.path} item={item} />)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredTeamItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] font-semibold tracking-wider">Equipe</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{filteredTeamItems.map((item) => <MenuItem key={item.path} item={item} />)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] font-semibold tracking-wider">Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{filteredAdminItems.map((item) => <MenuItem key={item.path} item={item} />)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {profile && (
          <Link to="/profile" className={cn("flex items-center gap-3 mb-3 p-2 rounded-xl transition-all duration-300 hover:bg-sidebar-accent group")}>
            <div className="relative">
              <div className={cn("absolute -inset-0.5 rounded-full opacity-75 blur-sm bg-gradient-to-r", getRoleColor())} />
              <Avatar className="h-10 w-10 relative border-2 border-sidebar-background">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs font-semibold">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate group-hover:text-sidebar-primary transition-colors">{profile.full_name}</p>
              <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 h-4 mt-0.5 bg-gradient-to-r text-white border-0", getRoleColor())}>
                {getRoleBadge()}
              </Badge>
            </div>
          </Link>
        )}
        
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-300">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
