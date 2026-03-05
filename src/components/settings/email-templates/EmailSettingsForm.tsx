import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Trash2, Save, Loader2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const formSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
  footer_text: z.string().min(1, "Texto do rodapé é obrigatório"),
});

type FormData = z.infer<typeof formSchema>;

interface EmailSettings {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  footer_text: string;
}

export function EmailSettingsForm() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("id, logo_url, primary_color, secondary_color, footer_text, show_social_links, social_links")
        .limit(1)
        .single();
      
      if (error) throw error;
      return data as EmailSettings;
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      primary_color: "#f59e0b",
      secondary_color: "#1f2937",
      footer_text: "Este é um email automático. Em caso de dúvidas, entre em contato.",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        primary_color: settings.primary_color || "#f59e0b",
        secondary_color: settings.secondary_color || "#1f2937",
        footer_text: settings.footer_text || "",
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<EmailSettings>) => {
      if (!settings?.id) throw new Error("Settings not found");
      
      const { error } = await supabase
        .from("email_settings")
        .update(data)
        .eq("id", settings.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar configurações");
    },
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("email-assets")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("email-assets")
        .getPublicUrl(fileName);

      await updateMutation.mutateAsync({ logo_url: urlData.publicUrl });
      toast.success("Logo atualizada com sucesso!");
    } catch {
      toast.error("Erro ao fazer upload da logo");
    } finally {
      setUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!settings?.logo_url) return;

    try {
      // Extract filename from URL
      const urlParts = settings.logo_url.split("/");
      const fileName = urlParts[urlParts.length - 1];

      await supabase.storage.from("email-assets").remove([fileName]);
      await updateMutation.mutateAsync({ logo_url: null });
      toast.success("Logo removida com sucesso!");
    } catch {
      toast.error("Erro ao remover logo");
    }
  };

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações Globais</CardTitle>
        <CardDescription>
          Configure a identidade visual dos emails enviados pelo sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Logo Upload */}
            <div className="space-y-3">
              <FormLabel>Logo da Empresa</FormLabel>
              <div className="flex items-center gap-4">
                <div className="w-32 h-16 border rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
                  {settings?.logo_url ? (
                    <img
                      src={settings.logo_url}
                      alt="Logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem logo</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    asChild
                  >
                    <label className="cursor-pointer">
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={uploading}
                      />
                    </label>
                  </Button>
                  {settings?.logo_url && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLogoRemove}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Recomendado: PNG ou SVG com fundo transparente, máximo 2MB
              </p>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="primary_color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor Primária</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={field.value}
                          onChange={field.onChange}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input {...field} placeholder="#f59e0b" />
                      </div>
                    </FormControl>
                    <FormDescription>Cor do cabeçalho e destaques</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="secondary_color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor Secundária</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={field.value}
                          onChange={field.onChange}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input {...field} placeholder="#1f2937" />
                      </div>
                    </FormControl>
                    <FormDescription>Cor do rodapé</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Footer Text */}
            <FormField
              control={form.control}
              name="footer_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto do Rodapé</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Este é um email automático..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Aparece no final de todos os emails
                  </FormDescription>
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
              Salvar Configurações
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
