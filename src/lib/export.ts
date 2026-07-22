// Neutralize cells that spreadsheet apps would interpret as a formula
// (CSV/Excel formula injection). Prefix a leading apostrophe so the cell
// is treated as text. Only applied to strings — real numbers stay numeric.
function sanitizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// Convert a raw cell value to a string, applying the formula guard to strings.
function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? sanitizeFormula(value) : String(value);
}

// Escape a field for CSV (RFC 4180): wrap in quotes and double internal
// quotes when it contains the delimiter, a quote, or a line break.
function escapeCSV(value: unknown): string {
  const cell = toCell(value);
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

// Escape a field for TSV. Tabs/line breaks would break the row layout, so
// quote (and double internal quotes) when the field contains them.
function escapeTSV(value: unknown): string {
  const cell = toCell(value);
  return /[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

// CSV Export
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  const headers = columns.map((col) => escapeCSV(col.label)).join(",");
  const rows = data.map((row) =>
    columns.map((col) => escapeCSV(row[col.key])).join(",")
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
  const headers = columns.map((col) => escapeTSV(col.label)).join("\t");
  const rows = data.map((row) =>
    columns.map((col) => escapeTSV(row[col.key])).join("\t")
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
