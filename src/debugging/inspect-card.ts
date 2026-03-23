import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "id-ID",
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  await page.goto("https://www.rumah123.com/jual/samarinda/rumah/?page=1", {
    waitUntil: "domcontentloaded", timeout: 30000,
  });

  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      window.scrollBy(0, 500);
      await new Promise(r => setTimeout(r, 400));
    }
  });
  await page.waitForTimeout(2000);

  // Dump semua teks + attributes dari card ke-3 (skip featured)
  const result = await page.$eval('[data-test-id="srp-listing-card-3"]', (card) => {
    // Semua elemen dengan teks pendek (kemungkinan spec)
    const all = card.querySelectorAll("*");
    const items: string[] = [];
    for (const el of Array.from(all)) {
      const t = el.textContent?.trim() ?? "";
      if (t.length > 0 && t.length < 30 && el.children.length === 0) {
        const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(" ");
        items.push(`[${el.tagName}${attrs ? " " + attrs : ""}] ${t}`);
      }
    }
    return items;
  });

  console.log("=== Card-3 leaf elements ===");
  result.forEach(r => console.log(r));

  await browser.close();
})();
