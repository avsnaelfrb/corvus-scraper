import { chromium } from "playwright";
import { appendCSV, timestampedFilename } from "../utils/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PropertyListing {
    judul: string;
    tipe: string;
    kota: string;
    harga: string;
    harga_raw: number;
    lokasi: string;
    kecamatan: string;
    luas_tanah: string;
    luas_bangunan: string;
    kamar_tidur: string;
    kamar_mandi: string;
    sumber: string;
    carport: string;
    url: string;
    tanggal_scrape: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  baseUrl: "https://www.rumah123.com",
  // URL pattern: /{aksi}/{kota}/{tipe}/?page=N
  types: [
    // ── Samarinda ──────────────────────────────────────
    { slug: "jual/samarinda/rumah",      label: "rumah-jual",      kota: "samarinda" },
    { slug: "sewa/samarinda/rumah",      label: "rumah-sewa",      kota: "samarinda" },
    { slug: "jual/samarinda/apartemen",  label: "apartemen-jual",  kota: "samarinda" },
    { slug: "sewa/samarinda/kost",       label: "kost-sewa",       kota: "samarinda" },
    { slug: "jual/samarinda/ruko",       label: "ruko-jual",       kota: "samarinda" },
    { slug: "jual/samarinda/tanah",      label: "tanah-jual",      kota: "samarinda" },
    { slug: "jual/samarinda/villa",      label: "villa-jual",      kota: "samarinda" },
    { slug: "jual/samarinda/gudang",     label: "gudang-jual",     kota: "samarinda" },
    // ── Balikpapan ─────────────────────────────────────
    { slug: "jual/balikpapan/rumah",     label: "rumah-jual",      kota: "balikpapan" },
    { slug: "sewa/balikpapan/rumah",     label: "rumah-sewa",      kota: "balikpapan" },
    { slug: "jual/balikpapan/apartemen", label: "apartemen-jual",  kota: "balikpapan" },
    { slug: "jual/balikpapan/tanah",     label: "tanah-jual",      kota: "balikpapan" },
    { slug: "jual/balikpapan/ruko",      label: "ruko-jual",       kota: "balikpapan" },
    // ── Bontang ────────────────────────────────────────
    { slug: "jual/bontang/rumah",        label: "rumah-jual",      kota: "bontang" },
    { slug: "jual/bontang/tanah",        label: "tanah-jual",      kota: "bontang" },
    // ── Kutai Kartanegara ──────────────────────────────
    { slug: "jual/kutai-kartanegara/rumah",  label: "rumah-jual",  kota: "kutai-kartanegara" },
    { slug: "jual/kutai-kartanegara/tanah",  label: "tanah-jual",  kota: "kutai-kartanegara" },
  ],
  maxPages: 10,
  delayMs: 2500, // sedikit lebih lambat karena lebih banyak request
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHarga(raw: string): number {
  if (!raw) return 0;
  const lower = raw.toLowerCase();
  const clean = raw.replace(/[^0-9,.]/g, "").replace(",", ".");
  if (lower.includes("miliar")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (lower.includes("juta")) return Math.round(parseFloat(clean) * 1_000_000);
  return parseInt(clean.replace(/\./g, ""), 10) || 0;
}

function extractKecamatan(lokasi: string): string {
  if (!lokasi) return "";
  const parts = lokasi.split(",").map((s) => s.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

async function scrapePage(
  page: import("playwright").Page,
  url: string,
  tipe: string,
  kota: string
): Promise<PropertyListing[]> {
  const results: PropertyListing[] = [];
  const today = new Date().toISOString().split("T")[0];

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);

    // Scroll supaya lazy-load jalan
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, 500);
        await new Promise((r) => setTimeout(r, 400));
      }
      window.scrollTo(0, 0);
    });
    await delay(1000);

    // Tunggu card pertama — pakai data-test-id (bukan data-testid!)
    await page
      .waitForSelector('[data-test-id="srp-listing-card-0"]', { timeout: 10000 })
      .catch(() => console.log(`[rumah123] No cards found on: ${url}`));

    const listings = await page.$$eval(
      '[data-test-id^="srp-listing-card-"]',
      (cards, tipeLabel) => {
        return cards.map((card) => {
          // Judul
          const titleEl = card.querySelector("h2, h3");
          const judul = titleEl?.textContent?.trim() ?? "";

          // URL listing
          const linkEl = card.querySelector('a[href*="/properti/"]');
          const href = linkEl ? (linkEl as HTMLAnchorElement).href : "";

          // Harga
          const hargaEl =
            card.querySelector('[data-testid="ldp-text-price"]') ??
            card.querySelector('[data-name="price-info"] span') ??
            card.querySelector(".text-primary.font-bold");
          const harga = hargaEl?.textContent?.trim() ?? "";

          // Lokasi — pakai selector spesifik
          const lokasiEl = card.querySelector("p.text-left.font-medium");
          const lokasi = lokasiEl?.textContent?.trim() ?? "";

          // LT & LB
          let luasTanah = "";
          let luasBangunan = "";
          const flexSpans = card.querySelectorAll("span.flex");
          for (const span of Array.from(flexSpans)) {
            const label = span.querySelector("span.text-greyText")?.textContent?.trim() ?? "";
            const full = span.textContent?.trim() ?? "";
            if (label.startsWith("LT")) luasTanah = full.replace(/LT\s*:\s*/, "").trim();
            else if (label.startsWith("LB")) luasBangunan = full.replace(/LB\s*:\s*/, "").trim();
          }

          // KT, KM, Carport — dari SVG icon href
          let kamarTidur = "";
          let kamarMandi = "";
          let carport = "";
          const iconSpans = card.querySelectorAll("span.flex.items-center.gap-x-1");
          for (const span of Array.from(iconSpans)) {
            const svgUse = span.querySelector("use");
            const iconHref = svgUse?.getAttribute("xlink:href") ?? "";
            const val = span.textContent?.trim() ?? "";
            if (iconHref.includes("bedroom")) kamarTidur = val;
            else if (iconHref.includes("bathroom")) kamarMandi = val;
            else if (iconHref.includes("carport")) carport = val;
          }

          return {
            judul,
            harga,
            lokasi,
            luasTanah,
            luasBangunan,
            kamarTidur,
            kamarMandi,
            carport,
            url: href,
            tipe: tipeLabel,
          };
        });
      },
      tipe
    );

    for (const item of listings) {
      if (!item.judul && !item.harga) continue;
      results.push({
        judul: item.judul,
        tipe: item.tipe,
        kota: kota,
        harga: item.harga,
        harga_raw: parseHarga(item.harga),
        lokasi: item.lokasi,
        kecamatan: extractKecamatan(item.lokasi),
        luas_tanah: item.luasTanah,
        luas_bangunan: item.luasBangunan,
        kamar_tidur: item.kamarTidur,
        kamar_mandi: item.kamarMandi,
        sumber: "rumah123",
        carport: item.carport,
        url: item.url,
        tanggal_scrape: today,
      });
    }

    console.log(`  → ${results.length} listings captured`);
  } catch (err) {
    console.error(
      `[rumah123] Error scraping ${url}:`,
      err instanceof Error ? err.message : String(err)
    );
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[rumah123] Starting scraper — Kaltim Regional");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "id-ID",
    viewport: { width: 1280, height: 900 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  const filename = timestampedFilename("properti_kaltim", "csv");
  let totalCaptured = 0;

  for (const type of CONFIG.types) {
    console.log(`\n[rumah123] Scraping: ${type.kota} / ${type.label}`);

    for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
      const url = `${CONFIG.baseUrl}/${type.slug}/?page=${pageNum}`;
      console.log(`  Page ${pageNum}: ${url}`);

      const listings = await scrapePage(page, url, type.label, type.kota);

      if (listings.length === 0) {
        console.log(`  No listings found, stopping at page ${pageNum}`);
        break;
      }

      appendCSV(filename, listings as unknown as Record<string, unknown>[]);
      totalCaptured += listings.length;
      console.log(`  Total so far: ${totalCaptured}`);

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