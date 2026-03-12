import { useMemo } from "react";
import { Router, Monitor, Radio } from "lucide-react";

interface Device {
  id: string;
  name: string;
  mac_address: string | null;
  device_type: string | null;
  is_online: boolean;
  ip_address: string | null;
  model: string | null;
}

interface TopologyLink {
  device_mac: string;
  device_name: string | null;
  neighbor_mac: string;
  neighbor_name: string | null;
  connection_type: string;
}

interface NetworkTopologyMapProps {
  devices: Device[];
  topology: TopologyLink[];
}

interface NodePosition {
  x: number;
  y: number;
  device: Device;
}

export function NetworkTopologyMap({ devices, topology }: NetworkTopologyMapProps) {
  const { nodes, links } = useMemo(() => {
    // Build device map by MAC
    const deviceByMac = new Map<string, Device>();
    for (const d of devices) {
      if (d.mac_address) {
        deviceByMac.set(d.mac_address.toLowerCase(), d);
      }
    }

    // Classify devices by type for hierarchical layout
    const gateways = devices.filter((d) => d.device_type === "gateway");
    const switches = devices.filter((d) => d.device_type === "switch");
    const aps = devices.filter((d) => d.device_type === "access_point");
    const others = devices.filter((d) => !["gateway", "switch", "access_point"].includes(d.device_type || ""));

    // Layout: horizontal layers
    const WIDTH = 800;
    const LAYER_HEIGHT = 120;
    const PADDING_X = 80;

    function layoutLayer(items: Device[], yPos: number): NodePosition[] {
      if (items.length === 0) return [];
      const spacing = Math.min((WIDTH - PADDING_X * 2) / Math.max(items.length, 1), 180);
      const startX = (WIDTH - spacing * (items.length - 1)) / 2;
      return items.map((d, i) => ({
        x: startX + i * spacing,
        y: yPos,
        device: d,
      }));
    }

    const allNodes: NodePosition[] = [
      ...layoutLayer(gateways, 60),
      ...layoutLayer(switches, 60 + LAYER_HEIGHT),
      ...layoutLayer(aps, 60 + LAYER_HEIGHT * 2),
      ...layoutLayer(others, 60 + LAYER_HEIGHT * 3),
    ];

    const nodeMap = new Map<string, NodePosition>();
    for (const n of allNodes) {
      if (n.device.mac_address) {
        nodeMap.set(n.device.mac_address.toLowerCase(), n);
      }
    }

    // Build links
    const builtLinks: { from: NodePosition; to: NodePosition; type: string }[] = [];
    for (const link of topology) {
      const from = nodeMap.get(link.device_mac.toLowerCase());
      const to = nodeMap.get(link.neighbor_mac.toLowerCase());
      if (from && to) {
        builtLinks.push({ from, to, type: link.connection_type });
      }
    }

    return { nodes: allNodes, links: builtLinks };
  }, [devices, topology]);

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Sem dados de topologia disponíveis</p>;
  }

  const maxY = Math.max(...nodes.map((n) => n.y)) + 80;
  const svgHeight = Math.max(maxY, 200);

  function getNodeColor(device: Device): string {
    return device.is_online ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
  }

  function getNodeIcon(type: string | null) {
    switch (type) {
      case "gateway": return "🌐";
      case "switch": return "🔀";
      case "access_point": return "📡";
      default: return "💻";
    }
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 800 ${svgHeight}`}
        className="w-full min-w-[600px]"
        style={{ maxHeight: 500 }}
      >
        {/* Links */}
        {links.map((link, i) => (
          <line
            key={`link-${i}`}
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
            stroke="hsl(var(--border))"
            strokeWidth={2}
            strokeDasharray={link.type === "wireless" ? "6,3" : undefined}
          />
        ))}

        {/* Nodes */}
        {nodes.map((node) => (
          <g key={node.device.id} transform={`translate(${node.x}, ${node.y})`}>
            {/* Circle */}
            <circle
              r={20}
              fill={getNodeColor(node.device)}
              opacity={0.15}
              stroke={getNodeColor(node.device)}
              strokeWidth={2}
            />
            {/* Icon */}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
            >
              {getNodeIcon(node.device.device_type)}
            </text>
            {/* Label */}
            <text
              y={32}
              textAnchor="middle"
              fontSize={10}
              fill="hsl(var(--foreground))"
              fontWeight={500}
            >
              {node.device.name.length > 18 ? node.device.name.substring(0, 16) + "…" : node.device.name}
            </text>
            {/* IP */}
            {node.device.ip_address && (
              <text
                y={44}
                textAnchor="middle"
                fontSize={9}
                fill="hsl(var(--muted-foreground))"
              >
                {node.device.ip_address}
              </text>
            )}
            {/* Status dot */}
            <circle
              cx={14}
              cy={-14}
              r={5}
              fill={node.device.is_online ? "hsl(142, 71%, 45%)" : "hsl(var(--destructive))"}
            />
          </g>
        ))}

        {/* Layer labels */}
        <text x={20} y={60} fontSize={11} fill="hsl(var(--muted-foreground))" fontWeight={600}>Gateway</text>
        <text x={20} y={180} fontSize={11} fill="hsl(var(--muted-foreground))" fontWeight={600}>Switches</text>
        <text x={20} y={300} fontSize={11} fill="hsl(var(--muted-foreground))" fontWeight={600}>APs</text>
      </svg>
    </div>
  );
}
