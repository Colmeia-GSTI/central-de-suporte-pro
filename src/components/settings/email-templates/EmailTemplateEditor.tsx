import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailPreview } from "./EmailPreview";
import { TemplateVariablesHelp } from "./TemplateVariablesHelp";
import { useDebounce } from "@/hooks/useDebounce";

const formSchema = z.object({
  subject_template: z.string().min(1, "Assunto é obrigatório"),
  html_template: z.string().min(1, "Conteúdo HTML é obrigatório"),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface EmailTemplate {
  id: string;
  template_type: string;
  name: string;
  subject_template: string;
  html_template: string;
  is_active: boolean;
}

interface EmailSettings {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
}

interface EmailTemplateEditorProps {
  template: EmailTemplate;
  onBack: () => void;
}

export function EmailTemplateEditor({ template, onBack }: EmailTemplateEditorProps) {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(true);

  const { data: settings } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .limit(1)
        .single();
      
      if (error) throw error;
      return data as EmailSettings;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject_template: template.subject_template,
      html_template: template.html_template,
      is_active: template.is_active,
    },
  });

  const watchedSubject = form.watch("subject_template");
  const watchedHtml = form.watch("html_template");
  const debouncedSubject = useDebounce(watchedSubject, 300);
  const debouncedHtml = useDebounce(watchedHtml, 300);

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase
        .from("email_templates")
        .update({
          subject_template: data.subject_template,
          html_template: data.html_template,
          is_active: data.is_active,
        })
        .eq("id", template.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template salvo com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar template");
    },
  });

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{template.name}</h3>
          <p className="text-sm text-muted-foreground">
            Tipo: {template.template_type}
          </p>
        </div>
        <TemplateVariablesHelp templateType={template.template_type} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Ocultar Preview
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Mostrar Preview
            </>
          )}
        </Button>
      </div>

      <div className={`grid gap-6 ${showPreview ? "lg:grid-cols-2" : ""}`}>
        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editor</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Template Ativo</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Desativar usa o template padrão do sistema
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject_template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assunto do Email</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Assunto do email..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="html_template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conteúdo HTML</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="<h2>Título</h2><p>Conteúdo...</p>"
                          rows={16}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Template
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Preview */}
        {showPreview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <EmailPreview
                subject={debouncedSubject}
                htmlContent={debouncedHtml}
                logoUrl={settings?.logo_url}
                primaryColor={settings?.primary_color || "#f59e0b"}
                secondaryColor={settings?.secondary_color || "#1f2937"}
                footerText={settings?.footer_text || ""}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
