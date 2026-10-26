/**
 * ZoikoShield Platform Universal Export & Download Utility
 * Provides reliable, format-aware browser downloads for JSON, CSV, ZIP and binary reports.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

export function downloadJsonFile(data: unknown, filename: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

export function downloadCsvFile(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  filename: string
): void {
  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsv).join(","));
  const csvContent = [headerLine, ...dataLines].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export async function downloadFromApi(
  endpoint: string,
  fallbackFilename: string,
  tenantId?: string
): Promise<{ success: boolean; filename: string }> {
  try {
    const headers: Record<string, string> = {};
    if (tenantId) headers["x-tenant-id"] = tenantId;

    if (typeof document !== "undefined") {
      const match = document.cookie.match(/zoiko_shield_access_token=([^;]+)/);
      if (match) headers["Authorization"] = `Bearer ${match[1]}`;
    }

    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      throw new Error(`Export download failed with HTTP ${res.status}`);
    }

    let filename = fallbackFilename;
    const disposition = res.headers.get("content-disposition");
    if (disposition && disposition.includes("filename=")) {
      const filenameMatch = disposition.match(/filename=["']?([^"';]+)["']?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    const blob = await res.blob();
    downloadBlob(blob, filename);
    return { success: true, filename };
  } catch (err) {
    console.error("[ExportDownload] Failed:", err);
    throw err;
  }
}
