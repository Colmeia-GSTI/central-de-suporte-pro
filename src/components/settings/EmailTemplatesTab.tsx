import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, FileText, AlertTriangle, Ticket, Receipt, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSettingsForm } from "./email-templates/EmailSettingsForm";
import { EmailTemplateEditor } from "./email-templates/EmailTemplateEditor";

interface EmailTemplate {
  id: string;
  template_type: string;
  name: string;
  subject_template: string;
  html_template: string;
  is_active: boolean;
}

const TEMPLATE_CATEGORIES = {
  tickets: {
    label: "Chamados",
    icon: Ticket,
    types: ["ticket_created", "ticket_updated", "ticket_commented", "ticket_resolved"],
  },
  invoices: {
    label: "Faturas",
    icon: Receipt,
    types: ["invoice_reminder", "invoice_payment", "invoice_collection_reminder", "invoice_collection_urgent", "invoice_collection_final"],
  },
  nfse: {
    label: "NFS-e",
    icon: FileText,
    types: ["nfse"],
  },
  certificates: {
    label: "Certificados",
    icon: ShieldAlert,
    types: ["certificate_expiry_warning", "certificate_expiry_critical", "certificate_expiry_expired"],
  },
  alerts: {
    label: "Alertas",
    icon: AlertTriangle,
    types: ["alert"],
  },
};

export function EmailTemplatesTab() {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("template_type");
      
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedTemplate) {
    return (
      <EmailTemplateEditor
        template={selectedTemplate}
        onBack={() => setSelectedTemplate(null)}
      />
    );
  }

  const getTemplatesByCategory = (categoryTypes: string[]) => {
    return templates?.filter((t) => categoryTypes.includes(t.template_type)) || [];
  };

  return (
    <Tabs defaultValue="settings" className="space-y-4">
      <TabsList>
        <TabsTrigger value="settings" className="gap-2">
          <Mail className="h-4 w-4" />
          Configurações
        </TabsTrigger>
        <TabsTrigger value="templates" className="gap-2">
          <FileText className="h-4 w-4" />
          Templates
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings">
        <EmailSettingsForm />
      </TabsContent>

      <TabsContent value="templates" className="space-y-6">
        {Object.entries(TEMPLATE_CATEGORIES).map(([key, category]) => {
          const categoryTemplates = getTemplatesByCategory(category.types);
          if (categoryTemplates.length === 0) return null;

          const Icon = category.icon;

          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5" />
                  {category.label}
                </CardTitle>
                <CardDescription>
                  {categoryTemplates.length} template(s) disponível(is)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {categoryTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {template.name}
                          </p>
                          <Badge
                            variant={template.is_active ? "default" : "secondary"}
                            className="shrink-0"
                          >
                            {template.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {template.subject_template}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTemplate(template)}
                      >
                        Editar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>
    </Tabs>
  );
}
