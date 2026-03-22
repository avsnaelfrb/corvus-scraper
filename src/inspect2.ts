import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto("https://www.rumah123.com/jual/samarinda/rumah/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(6000);

  // Cari semua link yang mengarah ke listing properti spesifik
  const listingLinks = await page.$$eval("a[href]", (els: any[]) =>
    els
      .filter((el: any) => /\/properti\/.*\/hos/.test(el.href))
      .slice(0, 5)
      .map((el: any) => ({
        href: el.href,
        text: el.innerText?.trim().substring(0, 200),
        parentClass: el.parentElement?.className?.substring(0, 100),
      }))
  );

  console.log(`Found ${listingLinks.length} listing links`);
  for (const l of listingLinks) {
    console.log("HREF:", l.href);
    console.log("TEXT:", l.text);
    console.log("PARENT:", l.parentClass);
    console.log("---");
  }

  await browser.close();
})();