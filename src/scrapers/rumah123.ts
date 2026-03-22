import { chromium } from "playwright";
import { appendCSV, timestampedFilename } from "../utils/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PropertyListing {
  judul: string;
  tipe: string;
  harga: string;
  harga_raw: number;
  lokasi: string;
  kecamatan: string;
  luas_tanah: string;
  luas_bangunan: string;
  kamar_tidur: string;
  kamar_mandi: string;
  sumber: string;
  url: string;
  tanggal_scrape: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  baseUrl: "https://www.rumah123.com",
  targetCity: "samarinda",
  types: [
    { slug: "jual/rumah", label: "rumah-jual" },
    { slug: "sewa/rumah", label: "rumah-sewa" },
    { slug: "jual/apartemen", label: "apartemen-jual" },
    { slug: "sewa/kost", label: "kost-sewa" },
    { slug: "jual/ruko", label: "ruko-jual" },
  ],
  maxPages: 5, // 5 halaman per tipe = ~100 listing per tipe
  delayMs: 2000, // delay antar request supaya tidak kena rate limit
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHarga(raw: string): number {
  if (!raw) return 0;
  const clean = raw.toLowerCase().replace(/[^0-9.,kmbt]/g, "");
  if (raw.toLowerCase().includes("miliar") || raw.toLowerCase().includes("m")) {
    const num = parseFloat(clean.replace(",", "."));
    return Math.round(num * 1_000_000_000);
  }
  if (raw.toLowerCase().includes("juta")) {
    const num = parseFloat(clean.replace(",", "."));
    return Math.round(num * 1_000_000);
  }
  return parseInt(clean.replace(/\./g, ""), 10) || 0;
}

function extractKecamatan(lokasi: string): string {
  if (!lokasi) return "";
  const parts = lokasi.split(",").map((s) => s.trim());
  // Format biasanya: "Kelurahan, Kecamatan, Kota"
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

async function scrapePage(
  page: import("playwright").Page,
  url: string,
  tipe: string
): Promise<PropertyListing[]> {
  const results: PropertyListing[] = [];
  const today = new Date().toISOString().split("T")[0];

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(1500);

    // Tunggu listing cards muncul
    await page.waitForSelector('[data-testid="card-listing"]', { timeout: 10000 })
      .catch(() => console.log("[rumah123] No listings found on this page"));

    const listings = await page.$$eval(
      '[data-testid="card-listing"]',
      (cards, tipeLabel) => {
        return cards.map((card) => {
          const judul = card.querySelector("h2, h3, .title")?.textContent?.trim() ?? "";
          const harga = card.querySelector('[data-testid="card-price"], .price')?.textContent?.trim() ?? "";
          const lokasi = card.querySelector('[data-testid="card-location"], .location')?.textContent?.trim() ?? "";
          const luasTanah = card.querySelector('[aria-label*="Luas Tanah"], [data-testid*="land"]')?.textContent?.trim() ?? "";
          const luasBangunan = card.querySelector('[aria-label*="Luas Bangunan"], [data-testid*="building"]')?.textContent?.trim() ?? "";
          const kamarTidur = card.querySelector('[aria-label*="Kamar Tidur"], [data-testid*="bedroom"]')?.textContent?.trim() ?? "";
          const kamarMandi = card.querySelector('[aria-label*="Kamar Mandi"], [data-testid*="bathroom"]')?.textContent?.trim() ?? "";
          const linkEl = card.querySelector("a[href]");
          const url = linkEl ? (linkEl as any).href : "";

          return { judul, harga, lokasi, luasTanah, luasBangunan, kamarTidur, kamarMandi, url, tipe: tipeLabel };
        });
      },
      tipe
    );

    for (const item of listings) {
      if (!item.judul && !item.harga) continue;

      results.push({
        judul: item.judul,
        tipe: item.tipe,
        harga: item.harga,
        harga_raw: parseHarga(item.harga),
        lokasi: item.lokasi,
        kecamatan: extractKecamatan(item.lokasi),
        luas_tanah: item.luasTanah,
        luas_bangunan: item.luasBangunan,
        kamar_tidur: item.kamarTidur,
        kamar_mandi: item.kamarMandi,
        sumber: "rumah123",
        url: item.url,
        tanggal_scrape: today,
      });
    }
  } catch (err) {
    console.error(`[rumah123] Error scraping ${url}:`, err instanceof Error ? err.message : String(err));
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[rumah123] Starting scraper — Samarinda");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "id-ID",
  });

  const page = await context.newPage();
  const filename = timestampedFilename("properti_samarinda", "csv");
  let totalCaptured = 0;

  for (const type of CONFIG.types) {
    console.log(`\n[rumah123] Scraping: ${type.label}`);

    for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
      const url = `${CONFIG.baseUrl}/properti/${CONFIG.targetCity}/${type.slug}/?page=${pageNum}`;
      console.log(`  Page ${pageNum}: ${url}`);

      const listings = await scrapePage(page, url, type.label);

      if (listings.length === 0) {
        console.log(`  No more listings, stopping at page ${pageNum}`);
        break;
      }

      appendCSV(filename, listings as unknown as Record<string, unknown>[]);
      totalCaptured += listings.length;

      console.log(`  Captured ${listings.length} listings (total: ${totalCaptured})`);
      await delay(CONFIG.delayMs);
    }
  }

  await browser.close();
  console.log(`\n[rumah123] Done. Total: ${totalCaptured} listings → data/output/${filename}`);
}

main().catch((err) => {
  console.error("[rumah123] Fatal error:", err);
  process.exit(1);
});