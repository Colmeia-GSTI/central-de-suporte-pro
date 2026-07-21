import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";

/**
 * Centraliza o padrão de load/save contra a tabela `integration_settings`
 * usado por todos os *ConfigForm de settings/integrations.
 *
 * Substitui ~40 LOC duplicadas por ConfigForm (loadSettings + handleSave +
 * estados loading/isActive).
 */
export function useIntegrationSettings<T extends Record<string, unknown>>(
  integrationType: string,
  defaultSettings: T,
  options?: {
    /** Transforma os settings logo após o load (ex.: gerar webhook_token se ausente). */
    onAfterLoad?: (loaded: T) => T;
    /** Transforma os settings imediatamente antes de salvar (ex.: garantir token). */
    beforeSave?: (current: T) => T;
  },
) {
  const [settings, setSettings] = useState<T>(defaultSettings);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", integrationType)
      .maybeSingle();

    if (data) {
      const merged = { ...defaultSettings, ...(data.settings as unknown as T) };
      setSettings(options?.onAfterLoad ? options.onAfterLoad(merged) : merged);
      setIsActive(data.is_active);
    } else if (options?.onAfterLoad) {
      // Sem registro: ainda aplica onAfterLoad sobre os defaults (ex.: gerar token inicial)
      setSettings(options.onAfterLoad({ ...defaultSettings }));
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationType]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      setLoading(true);
      try {
        const { data: existing } = await supabase
          .from("integration_settings")
          .select("id")
          .eq("integration_type", integrationType)
          .maybeSingle();

        const toSave = options?.beforeSave ? options.beforeSave(settings) : settings;
        // Reflete a transformação no estado para a UI ficar consistente
        if (options?.beforeSave) setSettings(toSave);

        const payload = {
          settings: toSave as unknown as Json,
          is_active: isActive,
        };

        const { error } = existing
          ? await supabase
              .from("integration_settings")
              .update(payload)
              .eq("integration_type", integrationType)
          : await supabase
              .from("integration_settings")
              .insert({ integration_type: integrationType, ...payload });

        if (error) throw error;
        if (!opts?.silent) toast.success("Configurações salvas com sucesso!");
        return true;
      } catch (error: unknown) {
        toast.error("Erro ao salvar: " + getErrorMessage(error));
        return false;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [integrationType, settings, isActive],
  );

  const patch = useCallback((partial: Partial<T>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  return { settings, patch, isActive, setIsActive, loading, loaded, save };
}
