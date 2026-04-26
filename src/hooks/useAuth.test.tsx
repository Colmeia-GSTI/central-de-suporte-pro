import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

// Mock user data
const mockUser = {
  id: "test-user-id",
  email: "test@example.com",
  aud: "authenticated",
  role: "authenticated",
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: { full_name: "Test User" },
};

const mockSession: Session = {
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: "bearer",
  user: mockUser as Session["user"],
};

const mockProfile = {
  id: "profile-id",
  user_id: "test-user-id",
  full_name: "Test User",
  email: "test@example.com",
  phone: null,
  avatar_url: null,
};

// Auth state change callback holder
let authStateCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;

const triggerAuthStateChange = (event: AuthChangeEvent, session: Session | null) => {
  if (authStateCallback) {
    authStateCallback(event, session);
  }
};

const resetAuthCallback = () => {
  authStateCallback = null;
};

// Mock functions
const mockGetSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockRefreshSession = vi.fn();
const mockFrom = vi.fn();

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInWithPassword: (params: unknown) => mockSignInWithPassword(params),
      signUp: (params: unknown) => mockSignUp(params),
      signOut: () => mockSignOut(),
      refreshSession: () => mockRefreshSession(),
      onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(),
            },
          },
        };
      },
    },
    from: (table: string) => mockFrom(table),
  },
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    authInit: vi.fn(),
    authLogin: vi.fn(),
    authLogout: vi.fn(),
    authError: vi.fn(),
  },
}));

// Import after mocks
import { AuthProvider, useAuth } from "./useAuth";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthCallback();
    
    // Default mock implementations
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("initialization", () => {
    it("should start with loading state", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should restore session on mount", async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ role: "technician" }], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockSession.user);
      expect(result.current.session).toEqual(mockSession);
    });

    it("should handle no active session", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
    });
  });

  describe("signIn", () => {
    it("should sign in successfully", async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockSession.user, session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const { error } = await result.current.signIn("test@example.com", "password123");

      expect(error).toBeNull();
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });

    it("should return error on sign in failure", async () => {
      const signInError = new Error("Invalid credentials");
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: signInError,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const { error } = await result.current.signIn("test@example.com", "wrong");

      expect(error).toEqual(signInError);
    });
  });

  describe("signUp", () => {
    it("should sign up successfully", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: mockSession.user, session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const { error } = await result.current.signUp("new@example.com", "password123", "New User");

      expect(error).toBeNull();
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@example.com",
          password: "password123",
          options: expect.objectContaining({
            data: { full_name: "New User" },
            emailRedirectTo: expect.any(String),
          }),
        }),
      );
    });
  });

  describe("signOut", () => {
    it("should sign out and clear state", async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe("role checks", () => {
    it("should correctly identify staff roles", async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ role: "technician" }], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.roles).toContain("technician");
      });

      expect(result.current.isStaff).toBe(true);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.hasRole("technician")).toBe(true);
      expect(result.current.hasRole("admin")).toBe(false);
    });

    it("should correctly identify admin role", async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ role: "admin" }], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.roles).toContain("admin");
      });

      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isStaff).toBe(true);
    });
  });

  describe("auth state changes", () => {
    it("should handle SIGNED_IN event", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ role: "technician" }], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();

      // Trigger SIGNED_IN event
      act(() => {
        triggerAuthStateChange("SIGNED_IN", mockSession);
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockSession.user);
      });
    });

    it("should handle SIGNED_OUT event", async () => {
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          };
        }
        if (table === "user_roles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ role: "technician" }], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockSession.user);
      });

      // Trigger SIGNED_OUT event
      act(() => {
        triggerAuthStateChange("SIGNED_OUT", null);
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.profile).toBeNull();
        expect(result.current.roles).toEqual([]);
      });
    });
  });
});
