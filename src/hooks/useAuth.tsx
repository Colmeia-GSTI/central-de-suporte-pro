import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Refresh token 5 minutes before expiration
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Session storage key to track if user was already logged in this browser session
const AUTH_ACTIVE_KEY = "colmeia_auth_active";

type AppRole = "admin" | "manager" | "technician" | "financial" | "client" | "client_master";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  whatsapp_number: string | null;
  telegram_chat_id: string | null;
  notify_email: boolean | null;
  notify_whatsapp: boolean | null;
  notify_telegram: boolean | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  rolesLoaded: boolean;
  isLoading: boolean;
  isRevalidating: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastFetchRef = useRef<number>(0);
  // Track if user was already logged in to differentiate genuine login from tab revalidation
  const wasLoggedInRef = useRef(false);

  // Schedule automatic token refresh before expiration
  const scheduleTokenRefresh = useCallback((expiresAt: number) => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    const expiresAtMs = expiresAt * 1000;
    const now = Date.now();
    const timeUntilRefresh = expiresAtMs - now - TOKEN_REFRESH_MARGIN_MS;

    if (timeUntilRefresh <= 0) {
      // Token already expired or about to expire, refresh now
      logger.debug("Token expired or about to expire, refreshing now", "Auth");
      supabase.auth.refreshSession().catch((error) => {
        logger.authError(error);
      });
      return;
    }

    logger.debug(`Scheduling token refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`, "Auth");

    refreshTimeoutRef.current = window.setTimeout(() => {
      logger.debug("Auto-refreshing token before expiration", "Auth");
      supabase.auth.refreshSession().catch((error) => {
        logger.authError(error);
      });
    }, timeUntilRefresh);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    // Skip if fetched recently (dedup guard)
    if (Date.now() - lastFetchRef.current < 5000) {
      logger.debug("Skipping fetch - data loaded recently", "Auth");
      return;
    }
    lastFetchRef.current = Date.now();
    try {
      logger.debug("Fetching user data", "Auth", { userId });
      
      // Fetch profile and roles in parallel - explicit columns for egress optimization
      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, user_id, full_name, email, phone, avatar_url, whatsapp_number, telegram_chat_id, notify_email, notify_whatsapp, notify_telegram")
          .eq("user_id", userId)
          .single(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
      ]);

      if (profileResult.data) {
        setProfile(profileResult.data as Profile);
        logger.debug("Profile loaded", "Auth", { profile: profileResult.data });
      }

      if (rolesResult.error) {
        logger.warn("Error fetching roles", "Auth", { error: rolesResult.error.message });
        setRoles([]);
      } else if (rolesResult.data) {
        const userRoles = rolesResult.data.map((r) => r.role as AppRole);
        setRoles(userRoles);
        logger.debug("Roles loaded", "Auth", { roles: userRoles });
      }
      
      // Mark roles as loaded even if empty (user might not have roles)
      setRolesLoaded(true);
    } catch (error) {
      logger.error("Error fetching user data", "Auth", { error: String(error) });
      logger.authError(error as Error);
      // Still mark as loaded to prevent infinite loading
      setRolesLoaded(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setRolesLoaded(false);

    // Safety net: never keep the UI stuck in a loading screen forever.
    const safetyTimeout = window.setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
        setRolesLoaded(true);
        logger.warn("Safety timeout triggered - forcing loading to complete", "Auth");
      }
    }, 5000);

    const init = async () => {
      logger.debug("Auth init started", "Auth");
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          logger.authError(error);
        }

        const nextSession = data.session;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        logger.authInit(nextSession?.user?.id);

        if (nextSession?.user) {
          // Schedule token refresh before expiration
          if (nextSession.expires_at) {
            scheduleTokenRefresh(nextSession.expires_at);
          }
          // Fetch user data and wait for it
          await fetchUserData(nextSession.user.id);
        } else {
          // No user, mark roles as loaded
          setRolesLoaded(true);
        }
      } catch (error) {
        logger.authError(error as Error);
        setRolesLoaded(true);
      } finally {
        if (isMounted) setIsLoading(false);
        window.clearTimeout(safetyTimeout);
      }
    };

    void init();

    // Listen for auth changes - NEVER use async callback directly!
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      logger.debug(`Auth state change: ${event}`, "Auth", { userId: nextSession?.user?.id });

      // Only synchronous state updates here
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);

      // Handle token refresh scheduling and user data fetch
      if (nextSession?.user) {
        // Check if this is a genuine sign-in or just a tab revalidation
        const wasActiveSession = sessionStorage.getItem(AUTH_ACTIVE_KEY) === "true";
        const isGenuineSignIn = event === "SIGNED_IN" && !wasLoggedInRef.current && !wasActiveSession;
        
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (isGenuineSignIn) {
            // Genuine login - reset roles for fresh fetch
            logger.authLogin(nextSession.user.id);
            setRolesLoaded(false);
          } else {
            // Tab revalidation or token refresh - preserve UI state
            logger.debug("Session revalidation (not genuine sign-in)", "Auth");
            setIsRevalidating(true);
          }
          
          // Schedule next token refresh
          if (nextSession.expires_at) {
            scheduleTokenRefresh(nextSession.expires_at);
          }
        }
        
        // Mark as logged in for future events
        wasLoggedInRef.current = true;
        sessionStorage.setItem(AUTH_ACTIVE_KEY, "true");
        
        // Defer Supabase calls with setTimeout to prevent deadlock
        setTimeout(() => {
          fetchUserData(nextSession.user.id).finally(() => {
            setIsRevalidating(false);
          });
        }, 0);
      } else {
        if (event === "SIGNED_OUT") {
          logger.authLogout();
        }
        // Clear session tracking on logout
        wasLoggedInRef.current = false;
        sessionStorage.removeItem(AUTH_ACTIVE_KEY);
        
        // Clear refresh timeout on logout
        if (refreshTimeoutRef.current) {
          window.clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }
        setProfile(null);
        setRoles([]);
        setRolesLoaded(true);
      }
    });

    return () => {
      isMounted = false;
      window.clearTimeout(safetyTimeout);
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      subscription.unsubscribe();
    };
  }, [fetchUserData, scheduleTokenRefresh]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Clear refresh timeout before signing out
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    // Clear session tracking
    wasLoggedInRef.current = false;
    sessionStorage.removeItem(AUTH_ACTIVE_KEY);
    
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setRolesLoaded(false);
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  const isStaff = roles.some((r) =>
    ["admin", "manager", "technician", "financial"].includes(r)
  );

  const isAdmin = roles.includes("admin");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        rolesLoaded,
        isLoading,
        isRevalidating,
        isStaff,
        isAdmin,
        signIn,
        signUp,
        signOut,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
