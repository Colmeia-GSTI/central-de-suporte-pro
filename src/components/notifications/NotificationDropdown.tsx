import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, CheckCheck, Ticket, AlertTriangle, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

function getNotificationRoute(relatedType: string | null, relatedId: string | null): string | null {
  if (!relatedType || !relatedId) return null;
  switch (relatedType) {
    case "ticket":
      return `/tickets?open=${relatedId}`;
    case "invoice":
      return `/billing?tab=invoices&invoice=${relatedId}`;
    case "contract":
      return `/contracts?contract=${relatedId}`;
    case "monitoring_alert":
      return `/monitoring?alert=${relatedId}`;
    case "nfse":
      return `/billing?tab=nfse&nfse=${relatedId}`;
    default:
      return null;
  }
}

const getNotificationIcon = (type: string, relatedType: string | null) => {
  if (relatedType === "ticket") return Ticket;
  if (type === "error" || type === "critical") return AlertTriangle;
  if (type === "message") return MessageSquare;
  return Bell;
};

export function NotificationDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: { id: string; is_read: boolean; related_type: string | null; related_id: string | null }) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    const route = getNotificationRoute(notification.related_type, notification.related_id);
    if (route) {
      navigate(route);
    }
  };
  const getTypeColor = (type: string) => {
    switch (type) {
      case "error":
      case "critical":
        return "text-destructive";
      case "warning":
        return "text-yellow-500";
      case "success":
        return "text-green-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative group">
          <Bell className="h-5 w-5 transition-colors group-hover:text-primary" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1 -right-1"
              >
                <Badge
                  variant="destructive"
                  className="h-5 min-w-5 flex items-center justify-center p-0 text-xs animate-pulse"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 backdrop-blur-xl bg-card/95 border-border/50">
        <DropdownMenuLabel className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold">Notificações</span>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs hover:bg-primary/10 hover:text-primary"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/50" />
        <ScrollArea className="h-[350px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Bell className="h-12 w-12 mb-3 opacity-20" />
              <p className="font-medium">Nenhuma notificação</p>
              <p className="text-xs mt-1">Você está em dia!</p>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: { staggerChildren: 0.05 }
                }
              }}
            >
              {notifications.map((notification, index) => {
                const NotificationIcon = getNotificationIcon(notification.type, notification.related_type);
                return (
                  <motion.div
                    key={notification.id}
                    variants={{
                      hidden: { opacity: 0, x: -20 },
                      visible: { opacity: 1, x: 0 }
                    }}
                  >
                    <DropdownMenuItem
                      className={cn(
                        "flex items-start gap-3 p-3 cursor-pointer transition-all border-b border-border/30 last:border-0",
                        !notification.is_read && "bg-primary/5 hover:bg-primary/10",
                        notification.is_read && "hover:bg-muted/50"
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className={cn(
                        "p-2 rounded-lg flex-shrink-0",
                        notification.type === "error" || notification.type === "critical" 
                          ? "bg-destructive/10 text-destructive"
                          : notification.type === "success"
                          ? "bg-success/10 text-success"
                          : "bg-primary/10 text-primary"
                      )}>
                        <NotificationIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "font-medium text-sm truncate",
                            getTypeColor(notification.type)
                          )}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <motion.div 
                              className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1"
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
