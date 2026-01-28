# AI Development Rules - Colmeia App

This document outlines the tech stack, architectural patterns, and coding standards for the Colmeia application.

## 🛠 Tech Stack

- **Framework**: React 18+ with TypeScript for type-safe frontend development.
- **Build Tool**: Vite for fast development and optimized production builds.
- **Styling**: Tailwind CSS for utility-first styling and responsive design.
- **UI Components**: shadcn/ui (Radix UI primitives) for accessible, consistent, and customizable components.
- **Database & Auth**: Supabase (PostgreSQL, Auth, Storage, Edge Functions).
- **Icons**: Lucide React for consistent iconography.
- **State Management**: React Query (TanStack Query) for server state and standard React Hooks for local state.
- **Forms**: React Hook Form with Zod for schema validation.
- **Routing**: React Router (AppRouter pattern).
- **Notifications**: Sonner for toast notifications.

## 📏 Architecture & Coding Rules

### 1. Component Organization
- **Atomic Design**: Keep components small and focused. Create new files in `src/components/` for reusable UI logic.
- **Page Layouts**: All main views go into `src/pages/`.
- **shadcn/ui**: Always check `src/components/ui/` before building a new UI element. If a component is missing, install it via the shadcn CLI or mimic the existing pattern.

### 2. Styling Guidelines
- **Tailwind Only**: Avoid plain CSS or CSS-in-JS. Use Tailwind classes directly in JSX.
- **Responsiveness**: Always use mobile-first breakpoints (`sm:`, `md:`, `lg:`, `xl:`).
- **Consistency**: Use the theme variables (e.g., `primary`, `secondary`, `accent`, `destructive`) defined in `tailwind.config.ts`.

### 3. Data Fetching & Supabase
- **Edge Functions**: Business logic that requires secrets or third-party integrations (Asaas, Banco Inter, WhatsApp) must reside in `supabase/functions/`.
- **Database Access**: Use the generated types from `src/integrations/supabase/types.ts` for type safety.
- **Realtime**: Use the `useUnifiedRealtime` hook for handling Supabase subscriptions.

### 4. Logic & Hooks
- **Permissions**: Use `src/components/auth/PermissionGate.tsx` or the `usePermissions` hook to guard UI elements.
- **Validation**: Every form must have a Zod schema for both frontend validation and backend consistency.
- **Error Handling**: Do not wrap everything in `try/catch` unnecessarily. Allow errors to bubble up to the `ErrorBoundary` for consistent reporting.

### 5. Internationalization & Formatting
- **Currency**: Use the `src/lib/currency.ts` utility for BRL (Brazilian Real) formatting.
- **Dates**: Use `date-fns` for date manipulation and formatting.
- **Language**: The primary interface language is Brazilian Portuguese (pt-BR).

### 6. Integration Rules
- **WhatsApp/Messaging**: Use Evolution API patterns as defined in `src/components/settings/integrations/`.
- **Billing**: Financial logic follows Brazilian tax rules (NFSe, Boletos via Asaas/Inter). Refer to `src/lib/nfse-validation.ts` for specific rules.

## 🚫 What Not To Do
- **No Direct API Keys**: Never hardcode keys in the frontend. Use `.env` or Supabase secrets.
- **No Large Files**: If a component exceeds 150-200 lines, refactor it into smaller sub-components.
- **No Manual DOM Manipulation**: Always use React state and refs.