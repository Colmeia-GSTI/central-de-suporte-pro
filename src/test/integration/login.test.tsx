import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/helpers/render";
import { createSupabaseMock } from "@/test/mocks/supabase";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: null, pathname: "/login" }),
  };
});

const signInMock = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signIn: signInMock }),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const { client: supaClient } = createSupabaseMock({
  functions: {
    "resolve-username": ({ body }: { body?: { username?: string } } = {}) =>
      body?.username === "knownuser"
        ? { data: { email: "known@test.com" }, error: null }
        : { data: { error: "Usuário não encontrado" }, error: null },
  },
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supaClient,
}));

import Login from "@/pages/Login";

describe("Login flow", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signInMock.mockReset();
    toastMock.mockReset();
  });

  it("happy path: signs in with email and navigates home", async () => {
    signInMock.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(screen.getByLabelText(/email ou username/i), "user@test.com");
    await user.type(screen.getByLabelText(/senha/i), "password123");
    await user.click(screen.getByRole("button", { name: /entrar na colmeia/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("user@test.com", "password123");
      expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("input error: shows toast when username cannot be resolved", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(screen.getByLabelText(/email ou username/i), "ghost");
    await user.type(screen.getByLabelText(/senha/i), "password123");
    await user.click(screen.getByRole("button", { name: /entrar na colmeia/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Erro ao entrar",
          variant: "destructive",
        }),
      );
      expect(signInMock).not.toHaveBeenCalled();
    });
  });

  it("backend error: shows resend button when email is not confirmed", async () => {
    signInMock.mockResolvedValueOnce({
      error: { message: "Email not confirmed" },
    });
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.type(screen.getByLabelText(/email ou username/i), "noconfirm@test.com");
    await user.type(screen.getByLabelText(/senha/i), "password123");
    await user.click(screen.getByRole("button", { name: /entrar na colmeia/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /reenviar email de confirmação/i }),
      ).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
