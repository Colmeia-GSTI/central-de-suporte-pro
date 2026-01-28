import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PhoneOff, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NoContactSettings {
  interval_minutes: number;
  last_run_at: string | null;
}

export function NoContactCheckConfigForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["integration-settings", "no_contact_check"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("id, settings, is_active")
        .eq("integration_type", "no_contact_check")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const settings: NoContactSettings = (config?.settings as unknown as NoContactSettings) || {
    interval_minutes: 30,
    last_run_at: null,
  };

  const [isActive, setIsActive] = useState(config?.is_active ?? true);
  const [intervalMinutes, setIntervalMinutes] = useState(settings.interval_minutes?.toString() || "30");

  const updateMutation = useMutation({
    mutationFn: async (data: { is_active: boolean; settings: NoContactSettings }) => {
      // First check if record exists
      const { data: existing } = await supabase
        .from("integration_settings")
        .select("id")
        .eq("integration_type", "no_contact_check")
        .maybeSingle();

      const settingsJson = JSON.parse(JSON.stringify(data.settings));

      if (existing) {
        const { error } = await supabase
          .from("integration_settings")
          .update({
            is_active: data.is_active,
            settings: settingsJson,
            updated_at: new Date().toISOString(),
          })
          .eq("integration_type", "no_contact_check");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integration_settings")
          .insert([{
            integration_type: "no_contact_check",
            is_active: data.is_active,
            settings: settingsJson,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-settings", "no_contact_check"] });
      toast({
        title: "Configuração salva",
        description: "As configurações de verificação de 'Sem Contato' foram atualizadas.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-no-contact-tickets");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["integration-settings", "no_contact_check"] });
      toast({
        title: "Verificação executada",
        description: data?.message || "A verificação foi concluída com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro na verificação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      is_active: isActive,
      settings: {
        interval_minutes: parseInt(intervalMinutes),
        last_run_at: settings.last_run_at,
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <PhoneOff className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Verificação de Sem Contato</CardTitle>
              <CardDescription>
                Lembretes automáticos para técnicos sobre chamados sem contato
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config?.is_active ? (
              <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            ) : (
              <Badge variant="secondary">Inativo</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Ativar verificação automática</Label>
            <p className="text-sm text-muted-foreground">
              Enviar lembretes automáticos para técnicos
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Intervalo de verificação
          </Label>
          <Select value={intervalMinutes} onValueChange={setIntervalMinutes}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o intervalo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">A cada 15 minutos</SelectItem>
              <SelectItem value="30">A cada 30 minutos</SelectItem>
              <SelectItem value="45">A cada 45 minutos</SelectItem>
              <SelectItem value="60">A cada 1 hora</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Define a frequência com que o sistema verifica chamados no status "Sem Contato" e envia lembretes.
          </p>
        </div>

        {settings.last_run_at && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Última execução:</strong>{" "}
              {format(new Date(settings.last_run_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Executar Agora
          </Button>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-medium mb-2">Como funciona:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>Auto-resume:</strong> Reativa chamados pausados quando o tempo configurado expira</li>
            <li>• <strong>Lembrete 24h:</strong> Notifica o técnico sobre chamados sem contato há mais de 24 horas</li>
            <li>• <strong>Lembrete urgente 48h+:</strong> Notificação urgente para chamados sem contato há mais de 48 horas</li>
            <li>• <strong>Multi-canal:</strong> Notificações via Push, Email, WhatsApp e Telegram conforme preferências</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
