import { useEffect, useCallback, useRef, useState } from "react";
import { UseFormReturn, FieldValues } from "react-hook-form";
import { logger } from "@/lib/logger";

interface UseFormPersistenceOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  key: string;
  storage?: "session" | "local";
  excludeFields?: (keyof T)[];
  debounceMs?: number;
  enabled?: boolean;
}

export function useFormPersistence<T extends FieldValues>({
  form,
  key,
  storage = "session",
  excludeFields = [],
  debounceMs = 500,
  enabled = true,
}: UseFormPersistenceOptions<T>) {
  const storageKey = `form_draft_${key}`;
  const store = storage === "local" ? localStorage : sessionStorage;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [wasRestored, setWasRestored] = useState(false);
  const initializedRef = useRef(false);

  // Restaurar dados ao montar
  useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;

    try {
      const saved = store.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Remover campos excluídos
        excludeFields.forEach((field) => delete parsed[String(field)]);
        
        // Verificar se há dados válidos para restaurar
        const hasValidData = Object.values(parsed).some(
          (v) => v !== null && v !== undefined && v !== ""
        );
        
        if (hasValidData) {
          form.reset(parsed, { keepDefaultValues: false });
          setWasRestored(true);
        }
      }
    } catch (e) {
      logger.warn("Failed to restore form data", "Form");
      store.removeItem(storageKey);
    }
  }, [enabled, storageKey]);

  // Salvar dados em cada mudança (com debounce)
  useEffect(() => {
    if (!enabled) return;

    const subscription = form.watch((values) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        try {
          const toSave = { ...values };
          excludeFields.forEach((field) => delete toSave[String(field)]);
          store.setItem(storageKey, JSON.stringify(toSave));
        } catch (e) {
          logger.warn("Failed to save form data", "Form");
        }
      }, debounceMs);
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [form, storageKey, excludeFields, debounceMs, store, enabled]);

  // Limpar dados após submit com sucesso
  const clearDraft = useCallback(() => {
    store.removeItem(storageKey);
    setWasRestored(false);
  }, [storageKey, store]);

  // Verificar se há rascunho salvo
  const hasDraft = useCallback(() => {
    return store.getItem(storageKey) !== null;
  }, [storageKey, store]);

  return { clearDraft, hasDraft, wasRestored };
}
