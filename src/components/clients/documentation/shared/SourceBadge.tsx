import { Badge } from "@/components/ui/badge";

interface SourceBadgeProps {
  source: string | null;
}

/**
 * Unified badge for displaying data source origin (TRMM, UniFi, Manual, etc.)
 * Used across DocTableWorkstations, DocTableNetworkDevices, and ClientAssetsList.
 */
export function SourceBadge({ source }: SourceBadgeProps) {
  const s = (source || "Manual").toLowerCase();

  if (s === "trmm") {
    return <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px]">TRMM</Badge>;
  }
  if (s === "unifi") {
    return <Badge variant="outline" className="text-blue-600 border-blue-300 text-[10px]">UniFi</Badge>;
  }
  if (s === "checkmk") {
    return <Badge variant="outline" className="text-purple-600 border-purple-300 text-[10px]">CheckMK</Badge>;
  }
  if (s.includes("trmm") && s.includes("manual")) {
    return <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]">TRMM+Manual</Badge>;
  }
  if (s.includes("unifi") && s.includes("manual")) {
    return <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]">UniFi+Manual</Badge>;
  }

  return <Badge variant="outline" className="text-muted-foreground text-[10px]">Manual</Badge>;
}
