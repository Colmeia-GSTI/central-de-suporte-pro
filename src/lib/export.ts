// CSV Export
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  const headers = columns.map((col) => col.label).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        // Escape quotes and wrap in quotes if contains comma
        if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? "";
      })
      .join(",")
  );

  const csvContent = [headers, ...rows].join("\n");
  downloadFile(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
}

// Excel-like Export (using TSV for better Excel compatibility)
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  const headers = columns.map((col) => col.label).join("\t");
  const rows = data.map((row) =>
    columns.map((col) => row[col.key] ?? "").join("\t")
  );

  const tsvContent = [headers, ...rows].join("\n");
  downloadFile(tsvContent, `${filename}.xls`, "application/vnd.ms-excel");
}

// JSON Export
export function exportToJSON<T>(data: T[], filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, `${filename}.json`, "application/json");
}

// Helper function to download file
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["\ufeff" + content], { type: mimeType });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
