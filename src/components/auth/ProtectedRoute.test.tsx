import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

// Mock useAuth hook
const mockUseAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Helper component to test navigation
const TestRoutes = ({
  allowedRoles,
  requireStaff,
}: {
  allowedRoles?: ("admin" | "manager" | "technician" | "financial" | "client" | "client_master")[];
  requireStaff?: boolean;
}) => (
  <MemoryRouter initialEntries={["/protected"]}>
    <Routes>
      <Route path="/login" element={<div>Login Page</div>} />
      <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
      <Route
        path="/protected"
        element={
          <ProtectedRoute allowedRoles={allowedRoles} requireStaff={requireStaff}>
            <div>Protected Content</div>
          </ProtectedRoute>
        }
      />
    </Routes>
  </MemoryRouter>
);

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("should show loading spinner while checking auth", () => {
      mockUseAuth.mockReturnValue({
        user: null,
        roles: [],
        rolesLoaded: false,
        isLoading: true,
        isStaff: false,
      });

      const { container } = render(<TestRoutes />);

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeTruthy();
    });

    it("should show loading spinner while roles are loading", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "test-user" },
        roles: [],
        rolesLoaded: false,
        isLoading: false,
        isStaff: false,
      });

      const { container } = render(<TestRoutes />);

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeTruthy();
    });
  });

  describe("unauthenticated users", () => {
    it("should redirect to login when user is not authenticated", () => {
      mockUseAuth.mockReturnValue({
        user: null,
        roles: [],
        rolesLoaded: true,
        isLoading: false,
        isStaff: false,
      });

      render(<TestRoutes />);

      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
  });

  describe("authenticated users without roles", () => {
    it("should show protected content for authenticated user without role restrictions", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["client"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: false,
      });

      render(<TestRoutes />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe("requireStaff", () => {
    it("should allow staff users when requireStaff is true", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["technician"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes requireStaff />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    it("should redirect non-staff users when requireStaff is true", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["client"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: false,
      });

      render(<TestRoutes requireStaff />);

      expect(screen.getByText("Unauthorized Page")).toBeInTheDocument();
    });
  });

  describe("allowedRoles", () => {
    it("should allow users with matching roles", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["admin"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes allowedRoles={["admin", "manager"]} />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    it("should redirect users without matching roles", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["technician"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes allowedRoles={["admin", "manager"]} />);

      expect(screen.getByText("Unauthorized Page")).toBeInTheDocument();
    });

    it("should allow users with any of the allowed roles", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["manager", "technician"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes allowedRoles={["admin", "manager"]} />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe("combined checks", () => {
    it("should allow staff with matching roles", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["admin"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes requireStaff allowedRoles={["admin"]} />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    it("should redirect non-staff even with matching roles when requireStaff is true", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "test@example.com" },
        roles: ["client_master"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: false,
      });

      render(<TestRoutes requireStaff allowedRoles={["client_master"]} />);

      expect(screen.getByText("Unauthorized Page")).toBeInTheDocument();
    });
  });

  describe("client roles", () => {
    it("should allow client access to client-only routes", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "client@example.com" },
        roles: ["client"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: false,
      });

      render(<TestRoutes allowedRoles={["client", "client_master"]} />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    it("should allow client_master access to client routes", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "master@example.com" },
        roles: ["client_master"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: false,
      });

      render(<TestRoutes allowedRoles={["client", "client_master"]} />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  describe("financial role", () => {
    it("should allow financial users to financial routes", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "finance@example.com" },
        roles: ["financial"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes allowedRoles={["admin", "financial"]} />);

      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });

    it("should block technicians from financial routes", () => {
      mockUseAuth.mockReturnValue({
        user: { id: "user-1", email: "tech@example.com" },
        roles: ["technician"],
        rolesLoaded: true,
        isLoading: false,
        isStaff: true,
      });

      render(<TestRoutes allowedRoles={["admin", "financial"]} />);

      expect(screen.getByText("Unauthorized Page")).toBeInTheDocument();
    });
  });
});
