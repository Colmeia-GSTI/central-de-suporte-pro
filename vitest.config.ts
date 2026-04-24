import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/ticket-payload.ts",
        "src/pages/Login.tsx",
        "supabase/functions/generate-monthly-invoices/logic.ts",
        "supabase/functions/notify-due-invoices/logic.ts",
        "supabase/functions/resend-confirmation/logic.ts",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
