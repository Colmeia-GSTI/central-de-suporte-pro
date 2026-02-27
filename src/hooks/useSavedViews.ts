import { useState, useCallback } from "react";

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
  createdAt: string;
}

const STORAGE_KEY = "ticket_saved_views";

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>(loadViews);

  const saveView = useCallback((name: string, filters: Record<string, string>) => {
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name,
      filters,
      createdAt: new Date().toISOString(),
    };
    setViews((prev) => {
      const updated = [...prev, newView];
      persistViews(updated);
      return updated;
    });
    return newView;
  }, []);

  const deleteView = useCallback((id: string) => {
    setViews((prev) => {
      const updated = prev.filter((v) => v.id !== id);
      persistViews(updated);
      return updated;
    });
  }, []);

  return { views, saveView, deleteView };
}
