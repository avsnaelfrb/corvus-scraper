import { chromium } from "playwright";
import * as fs from "fs";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto("https://www.rumah123.com/jual/samarinda/rumah/", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const html = await page.content();
  fs.writeFileSync("src/rumah123-dump.html", html);
  console.log("HTML saved → src/rumah123-dump.html");
  console.log("Title:", await page.title());

  const selectors = [
    "article",
    '[class*="card"]',
    '[class*="listing"]',
    '[class*="property"]',
    '[class*="CardPrimary"]',
    '[class*="Card"]',
    "li[class]",
    '[class*="item"]',
  ];

  for (const sel of selectors) {
    const count = await page.$$(sel).then((els: unknown[]) => els.length);
    if (count > 0) console.log(`  ${sel}: ${count} elements`);
  }

  await browser.close();
})();
