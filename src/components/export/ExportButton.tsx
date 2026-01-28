import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToCSV, exportToExcel, exportToJSON } from "@/lib/export";

interface ExportButtonProps<T extends Record<string, any>> {
  data: T[];
  filename: string;
  columns: { key: keyof T; label: string }[];
  disabled?: boolean;
}

export function ExportButton<T extends Record<string, any>>({
  data,
  filename,
  columns,
  disabled,
}: ExportButtonProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || data.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => exportToCSV(data, filename, columns)}>
          Exportar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToExcel(data, filename, columns)}>
          Exportar Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToJSON(data, filename)}>
          Exportar JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
