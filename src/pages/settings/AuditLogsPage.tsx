import { AppLayout } from "@/components/layout/AppLayout";
import { AuditLogsList } from "@/components/audit/AuditLogsList";
import { ShieldCheck } from "lucide-react";

export default function AuditLogsPage() {
  return (
    <AppLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Trilha de alterações em tabelas sensíveis. Campos com chaves sensíveis (senhas, tokens, segredos) são automaticamente redatados.
          </p>
        </header>
        <AuditLogsList />
      </div>
    </AppLayout>
  );
}
