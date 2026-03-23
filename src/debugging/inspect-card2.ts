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

  const result = await page.$eval('[data-test-id="srp-listing-card-3"]', (card) => {
    // Cari span yang isinya "LT:" lalu ambil parent dan semua sibling-nya
    const spans = card.querySelectorAll("span");
    for (const span of Array.from(spans)) {
      if (span.textContent?.trim() === "LT:") {
        const parent = span.parentElement;
        const grandParent = parent?.parentElement;
        return {
          parentHTML: parent?.outerHTML?.substring(0, 500),
          grandParentHTML: grandParent?.outerHTML?.substring(0, 1000),
        };
      }
    }
    return null;
  });

  console.log("=== LT parent ===");
  console.log(result?.parentHTML);
  console.log("\n=== LT grandparent ===");
  console.log(result?.grandParentHTML);

  await browser.close();
})();
