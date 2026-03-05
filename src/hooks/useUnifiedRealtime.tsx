import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, AlertTriangle, Bell, CheckCircle, MessageSquare } from "lucide-react";

/**
 * Unified Realtime Hook
 * Consolidates all realtime subscriptions into a single optimized connection
 * Reduces WebSocket connections by ~60%
 */

interface TicketPayload {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  client_id: string | null;
  assigned_to: string | null;
}

interface NotificationPayload {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
}

interface AlertPayload {
  id: string;
  title: string;
  message: string;
  level: string;
  device_id: string;
}

const priorityConfig = {
  critical: { 
    icon: AlertTriangle, 
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
    label: "Crítico"
  },
  high: { 
    icon: AlertTriangle, 
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    label: "Alta"
  },
  medium: { 
    icon: Ticket, 
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
    label: "Média"
  },
  low: { 
    icon: Ticket, 
    color: "text-muted-foreground",
    bgColor: "bg-muted/10",
    borderColor: "border-muted/30",
    label: "Baixa"
  },
};

const statusConfig = {
  open: { label: "Aberto", color: "text-primary" },
  in_progress: { label: "Em Andamento", color: "text-warning" },
  waiting: { label: "Aguardando", color: "text-muted-foreground" },
  resolved: { label: "Resolvido", color: "text-success" },
  closed: { label: "Fechado", color: "text-muted-foreground" },
};

export function useUnifiedRealtime() {
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const invalidationTimeoutRef = useRef<number | null>(null);
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  
  // Only staff needs global realtime subscriptions
  // Use stable check with fallback for when roles aren't loaded yet
  const isStaff = Array.isArray(roles) && roles.some(r => 
    ["admin", "manager", "technician", "financial"].includes(r)
  );

  // Play notification sound - only for critical events
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = "sine";
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch {
      // Audio notification not supported - silently ignore
    }
  }, []);

  // Batch invalidate queries with longer debounce to prevent cascade re-renders
  const invalidateQueries = useCallback((keys: string[][]) => {
    // Add keys to pending set
    keys.forEach(key => {
      pendingInvalidationsRef.current.add(JSON.stringify(key));
    });

    // Clear existing timeout
    if (invalidationTimeoutRef.current) {
      window.clearTimeout(invalidationTimeoutRef.current);
    }

    // Debounce with 500ms to batch multiple rapid updates
    invalidationTimeoutRef.current = window.setTimeout(() => {
      const keysToInvalidate = Array.from(pendingInvalidationsRef.current);
      pendingInvalidationsRef.current.clear();
      
      keysToInvalidate.forEach(keyStr => {
        const key = JSON.parse(keyStr);
        queryClient.invalidateQueries({ queryKey: key });
      });
    }, 500);
  }, [queryClient]);

  // Handle ticket events
  const handleTicketEvent = useCallback((payload: { eventType: string; new: TicketPayload; old: TicketPayload | null }) => {
    const ticket = payload.new;
    const oldTicket = payload.eventType === "UPDATE" ? payload.old : null;

    // Batch invalidate all ticket-related queries
    invalidateQueries([
      ["tickets"],
      ["dashboard-stats"],
      ["recent-tickets"],
      ["my-tickets"],
      ["technician-ticket-count"],
    ]);

    if (!user) return;

    if (payload.eventType === "INSERT" && ticket.assigned_to !== user.id) {
      const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.medium;
      const PriorityIcon = priority.icon;

      toast("🎫 Novo Chamado", {
        description: (
          <div className="flex flex-col gap-2 mt-1">
            <p className="text-sm font-medium truncate">#{ticket.ticket_number} - {ticket.title}</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${priority.bgColor} ${priority.color} border ${priority.borderColor}`}>
                <PriorityIcon className="inline h-3 w-3 mr-1" />
                {priority.label}
              </span>
            </div>
          </div>
        ),
        duration: 5000,
        action: {
          label: "Ver",
          onClick: () => window.location.href = "/tickets",
        },
      });

      if (ticket.priority === "critical" || ticket.priority === "high") {
        playNotificationSound();
      }
    } else if (payload.eventType === "UPDATE") {
      const wasAssignedToMe = oldTicket?.assigned_to !== user.id && ticket.assigned_to === user.id;
      
      if (wasAssignedToMe) {
        const priority = priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.medium;
        const PriorityIcon = priority.icon;
        
        toast("📋 Chamado Atribuído a Você", {
          description: (
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-sm font-medium truncate">
                #{ticket.ticket_number} - {ticket.title}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${priority.bgColor} ${priority.color} border ${priority.borderColor}`}>
                <PriorityIcon className="inline h-3 w-3 mr-1" />
                {priority.label}
              </span>
            </div>
          ),
          duration: 8000,
          action: {
            label: "Ver Chamado",
            onClick: () => window.location.href = `/tickets?id=${ticket.id}`,
          },
        });
        
        playNotificationSound();
      } else if (ticket.assigned_to === user.id && ticket.status !== oldTicket?.status) {
        const status = statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.open;
        toast("📝 Chamado Atualizado", {
          description: `#${ticket.ticket_number} - Status: ${status.label}`,
          duration: 5000,
        });
      }
    }
  }, [user, invalidateQueries, playNotificationSound]);

  // Handle notification events
  const handleNotificationEvent = useCallback((payload: { new: NotificationPayload }) => {
    if (!user) return;
    
    const notification = payload.new;
    
    invalidateQueries([["notifications", user.id]]);

    const getIcon = () => {
      switch (notification.type) {
        case "error":
        case "critical":
          return <AlertTriangle className="h-4 w-4 text-destructive" />;
        case "success":
          return <CheckCircle className="h-4 w-4 text-success" />;
        case "message":
          return <MessageSquare className="h-4 w-4 text-primary" />;
        default:
          return <Bell className="h-4 w-4 text-primary" />;
      }
    };

    toast(notification.title, {
      description: notification.message,
      icon: getIcon(),
      duration: 5000,
    });

    if (notification.type === "critical" || notification.type === "error") {
      playNotificationSound();
    }
  }, [user, invalidateQueries, playNotificationSound]);

  // Handle alert events
  const handleAlertEvent = useCallback((payload: { new: AlertPayload }) => {
    const alert = payload.new;
    
    invalidateQueries([
      ["monitoring-alerts"],
      ["alerts"],
      ["devices"],
    ]);

    const levelConfig = {
      critical: { icon: AlertTriangle, color: "text-destructive", label: "Crítico" },
      warning: { icon: AlertTriangle, color: "text-warning", label: "Aviso" },
      info: { icon: Bell, color: "text-primary", label: "Info" },
    };
    
    const config = levelConfig[alert.level as keyof typeof levelConfig] || levelConfig.info;
    const LevelIcon = config.icon;
    
    toast(`🚨 Alerta de Monitoramento`, {
      description: (
        <div className="flex flex-col gap-1 mt-1">
          <p className="text-sm font-medium">{alert.title}</p>
          <p className="text-xs text-muted-foreground">{alert.message}</p>
          <span className={`text-xs ${config.color}`}>
            <LevelIcon className="inline h-3 w-3 mr-1" />
            {config.label}
          </span>
        </div>
      ),
      duration: 8000,
      action: {
        label: "Ver",
        onClick: () => window.location.href = "/monitoring",
      },
    });
    
    if (alert.level === "critical") {
      playNotificationSound();
    }
  }, [invalidateQueries, playNotificationSound]);

  // Handle device events
  const handleDeviceEvent = useCallback(() => {
    invalidateQueries([["devices"]]);
  }, [invalidateQueries]);

  useEffect(() => {
    // Only subscribe for staff users to reduce overhead for clients
    if (!user || !isStaff) return;

    // Single multiplexed channel for essential realtime events only
    // Tickets: INSERT + UPDATE only (no DELETE tracking needed)
    // Notifications: INSERT only, filtered by user_id
    const channel = supabase
      .channel("unified-realtime")
      // Tickets - INSERT events (new tickets)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handleTicketEvent as (payload: any) => void
      )
      // Tickets - UPDATE events (status changes, assignments)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handleTicketEvent as (payload: any) => void
      )
      // Notifications - filtered by user (essential for UX)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handleNotificationEvent as (payload: any) => void
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (invalidationTimeoutRef.current) {
        window.clearTimeout(invalidationTimeoutRef.current);
      }
    };
  }, [user, isStaff, handleTicketEvent, handleNotificationEvent]);

  return null;
}