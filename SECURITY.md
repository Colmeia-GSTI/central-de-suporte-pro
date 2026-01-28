# Security Architecture

This document describes the security architecture and best practices for this application.

## Role-Based Access Control (RBAC)

### Roles
- **admin**: Full system access, can manage users and permissions
- **manager**: Operational management, team oversight, reports
- **technician**: Ticket handling, client support, inventory access
- **financial**: Financial module access, invoicing, NFS-e
- **client**: Client portal access, own tickets only
- **client_master**: Client portal with company-wide ticket visibility

### Permission Layers

1. **Frontend (UI Control)**
   - `PermissionGate` component hides/shows UI elements
   - `usePermissions` hook checks if user can perform actions
   - `useSecureAction` hook wraps mutations with permission validation
   - **IMPORTANT**: Frontend permissions are for UX only, never security!

2. **Backend (Data Protection)**
   - Row Level Security (RLS) policies on all tables
   - `has_role()` and `is_staff()` database functions
   - Edge Functions validate permissions before processing

3. **Permission Overrides**
   - Stored in `role_permission_overrides` table
   - Managed via Settings > Regras de Permissões
   - Overrides take precedence over default permissions

## Input Validation & Sanitization

### Frontend
- All forms use Zod schemas for validation
- `src/lib/security.ts` provides sanitization utilities:
  - `escapeHtml()` - XSS prevention
  - `sanitizeString()` - Remove dangerous patterns
  - `sanitizeEmail()`, `sanitizePhone()`, `sanitizeUrl()`
  - `validateCNPJ()`, `validateCPF()` - Brazilian document validation

### Backend (Edge Functions)
- All inputs are validated before processing
- Email, phone, and document formats are verified
- Maximum lengths are enforced
- Error messages never expose internal details

## Error Handling

### Safe Error Messages
- `src/lib/api-error-handler.ts` sanitizes all API errors
- Database errors are transformed to user-friendly messages
- Stack traces and SQL errors are never exposed
- Sensitive patterns are filtered from error messages

### Logging
- Production logs omit sensitive data
- API keys, passwords, tokens are never logged
- `maskSensitiveData()` utility for safe logging

## API Security

### Edge Functions
- All functions validate Authorization header
- Admin-only operations check role before executing
- Webhooks use HMAC-SHA256 signature verification
- Timeouts prevent hanging connections

### Secrets Management
- Private API keys stored in Supabase Secrets
- Certificate passwords are AES-256-GCM encrypted
- Never hardcode secrets in frontend code

## Data Protection

### Sensitive Data Views
- `software_licenses_safe` - Masks license keys for non-admins
- `nfse_history_safe` - Restricts fiscal data visibility

### RLS Policies
All tables have appropriate RLS policies:
- Staff-only tables require `is_staff(auth.uid())`
- User-specific data uses `auth.uid() = user_id`
- Client data is scoped by `client_id`

## Security Checklist for New Features

- [ ] Add Zod schema validation to forms
- [ ] Use `PermissionGate` for UI elements
- [ ] Add RLS policy for new tables
- [ ] Validate inputs in Edge Functions
- [ ] Use `sanitizeApiError()` for error handling
- [ ] Never log sensitive data
- [ ] Test with different user roles
