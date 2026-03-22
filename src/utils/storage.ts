import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.resolve(__dirname, "../../data/output");

// Pastikan folder output ada
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Simpan ke JSON
export function saveJSON<T>(filename: string, data: T[]): void {
  ensureDir(OUTPUT_DIR);
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`[storage] JSON saved → ${filePath} (${data.length} records)`);
}

// Simpan ke CSV
export function saveCSV(filename: string, data: Record<string, unknown>[]): void {
  if (data.length === 0) {
    console.log("[storage] No data to save.");
    return;
  }

  ensureDir(OUTPUT_DIR);
  const filePath = path.join(OUTPUT_DIR, filename);

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h] ?? "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  fs.writeFileSync(filePath, csv, "utf8");
  console.log(`[storage] CSV saved → ${filePath} (${data.length} records)`);
}

// Append ke CSV yang sudah ada (untuk scraping bertahap)
export function appendCSV(filename: string, data: Record<string, unknown>[]): void {
  if (data.length === 0) return;

  ensureDir(OUTPUT_DIR);
  const filePath = path.join(OUTPUT_DIR, filename);
  const headers = Object.keys(data[0]);

  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h] ?? "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  // Tulis header kalau file belum ada
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, headers.join(",") + "\n", "utf8");
  }

  fs.appendFileSync(filePath, rows.join("\n") + "\n", "utf8");
  console.log(`[storage] Appended ${data.length} records → ${filePath}`);
}

// Generate filename dengan timestamp
export function timestampedFilename(prefix: string, ext: "csv" | "json"): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  return `${prefix}_${date}.${ext}`;
}