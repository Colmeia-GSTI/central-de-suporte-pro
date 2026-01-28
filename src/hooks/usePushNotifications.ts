import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// VAPID public key - this should match the private key in the edge function
// Generated using: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | "default";
  isLoading: boolean;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    permission: "default",
    isLoading: true,
  });

  // Check if push notifications are supported
  const checkSupport = useCallback(() => {
    const isSupported = 
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    
    return isSupported;
  }, []);

  // Check current subscription status
  const checkSubscription = useCallback(async () => {
    if (!checkSupport() || !user) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Verify subscription exists in database
        const { data } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .eq("endpoint", subscription.endpoint)
          .single();
        
        setState(prev => ({
          ...prev,
          isSupported: true,
          isSubscribed: !!data,
          permission: Notification.permission,
          isLoading: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isSupported: true,
          isSubscribed: false,
          permission: Notification.permission,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error("Error checking push subscription:", error);
      setState(prev => ({
        ...prev,
        isSupported: checkSupport(),
        isLoading: false,
      }));
    }
  }, [user, checkSupport]);

  // Register service worker and subscribe to push
  const subscribe = useCallback(async () => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para ativar notificações push.",
        variant: "destructive",
      });
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== "granted") {
        toast({
          title: "Permissão negada",
          description: "Você precisa permitir notificações para receber alertas.",
          variant: "destructive",
        });
        setState(prev => ({ ...prev, permission, isLoading: false }));
        return false;
      }

      // Register service worker for push
      const registration = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;

      // Subscribe to push manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const subscriptionJson = subscription.toJSON();

      // Save subscription to database
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert({
          user_id: user.id,
          endpoint: subscriptionJson.endpoint!,
          p256dh: subscriptionJson.keys?.p256dh || "",
          auth: subscriptionJson.keys?.auth || "",
        }, {
          onConflict: "user_id,endpoint",
        });

      if (error) throw error;

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        permission: "granted",
        isLoading: false,
      }));

      toast({
        title: "Notificações ativadas",
        description: "Você receberá alertas em tempo real neste dispositivo.",
      });

      return true;
    } catch (error) {
      console.error("Error subscribing to push:", error);
      toast({
        title: "Erro ao ativar notificações",
        description: "Não foi possível configurar as notificações push.",
        variant: "destructive",
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [user, toast]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from database
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", subscription.endpoint);

        // Unsubscribe from push manager
        await subscription.unsubscribe();
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
      }));

      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais alertas push neste dispositivo.",
      });

      return true;
    } catch (error) {
      console.error("Error unsubscribing from push:", error);
      toast({
        title: "Erro ao desativar notificações",
        description: "Não foi possível desativar as notificações push.",
        variant: "destructive",
      });
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [user, toast]);

  // Initialize on mount
  useEffect(() => {
    const isSupported = checkSupport();
    setState(prev => ({ ...prev, isSupported }));
    
    if (isSupported && user) {
      checkSubscription();
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user, checkSupport, checkSubscription]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    checkSubscription,
  };
}
