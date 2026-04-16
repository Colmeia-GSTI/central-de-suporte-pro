import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapAssetTypeToDeviceType } from "@/lib/doc-utils";

interface AssetData {
  id: string;
  client_id: string;
  name: string;
  asset_type: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  ip_address?: string | null;
  location?: string | null;
  notes?: string | null;
}

interface DocDeviceMatch {
  id: string;
  name: string | null;
  serial_number: string | null;
}

export function useDocDeviceSync() {
  const queryClient = useQueryClient();

  const invalidateAll = (clientId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["client-assets"] });
    queryClient.invalidateQueries({ queryKey: ["client-doc-devices"] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    if (clientId) {
      queryClient.invalidateQueries({ queryKey: ["client-assets", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client-doc-devices", clientId] });
    }
  };

  const findMatch = async (
    clientId: string,
    name: string,
    serialNumber?: string | null
  ): Promise<DocDeviceMatch | null> => {
    // Priority 1: exact serial_number
    if (serialNumber) {
      const { data } = await supabase
        .from("doc_devices")
        .select("id, name, serial_number")
        .eq("client_id", clientId)
        .eq("serial_number", serialNumber)
        .limit(1);
      if (data && data.length > 0) return data[0];
    }

    // Priority 2: exact name (case-insensitive)
    const { data } = await supabase
      .from("doc_devices")
      .select("id, name, serial_number")
      .eq("client_id", clientId)
      .ilike("name", name)
      .limit(1);

    return data && data.length > 0 ? data[0] : null;
  };

  const linkMutation = useMutation({
    mutationFn: async ({ assetId, docDeviceId }: { assetId: string; docDeviceId: string }) => {
      const { error } = await supabase
        .from("assets")
        .update({ doc_device_id: docDeviceId } as Record<string, unknown>)
        .eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const promoteMutation = useMutation({
    mutationFn: async (asset: AssetData) => {
      const brandModel = [asset.brand, asset.model].filter(Boolean).join(" ") || null;

      const { data, error } = await supabase
        .from("doc_devices")
        .insert({
          client_id: asset.client_id,
          name: asset.name,
          device_type: mapAssetTypeToDeviceType(asset.asset_type),
          brand_model: brandModel,
          serial_number: asset.serial_number || null,
          ip_local: asset.ip_address || null,
          physical_location: asset.location || null,
          notes: asset.notes || null,
          data_source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Link asset to the new doc_device
      const { error: linkError } = await supabase
        .from("assets")
        .update({ doc_device_id: data.id } as Record<string, unknown>)
        .eq("id", asset.id);
      if (linkError) throw linkError;

      return data.id as string;
    },
    onSuccess: (_, asset) => invalidateAll(asset.client_id),
  });

  const syncMutation = useMutation({
    mutationFn: async ({
      docDeviceId,
      fields,
    }: {
      docDeviceId: string;
      fields: {
        name?: string;
        brand?: string | null;
        model?: string | null;
        serial_number?: string | null;
        ip_address?: string | null;
        location?: string | null;
        notes?: string | null;
      };
    }) => {
      const update: Record<string, unknown> = {};
      if (fields.name !== undefined) update.name = fields.name;
      if (fields.serial_number !== undefined) update.serial_number = fields.serial_number;
      if (fields.ip_address !== undefined) update.ip_local = fields.ip_address;
      if (fields.location !== undefined) update.physical_location = fields.location;
      if (fields.notes !== undefined) update.notes = fields.notes;
      if (fields.brand !== undefined || fields.model !== undefined) {
        update.brand_model = [fields.brand, fields.model].filter(Boolean).join(" ") || null;
      }

      if (Object.keys(update).length === 0) return;

      const { error } = await supabase
        .from("doc_devices")
        .update(update)
        .eq("id", docDeviceId);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  return {
    findMatch,
    linkAsset: linkMutation.mutateAsync,
    promoteToDoc: promoteMutation.mutateAsync,
    syncFieldsToDoc: syncMutation.mutateAsync,
    isLinking: linkMutation.isPending,
    isPromoting: promoteMutation.isPending,
    isSyncing: syncMutation.isPending,
  };
}
