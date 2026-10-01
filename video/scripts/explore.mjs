// Research pass: log in, crawl the main screens, save screenshot + visible text for each.
// Usage: SPLITUP_EMAIL=... SPLITUP_PASSWORD=... node scripts/explore.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://splitup.thimitech.com';
const OUT = 'research';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'en-US' });
const page = await ctx.newPage();

async function snap(name) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  writeFileSync(`${OUT}/${name}.txt`, `${page.url()}\n\n${await page.innerText('body')}`);
  console.log('saved', name, page.url());
}

await page.goto(BASE);
await snap('00-login');
await page.fill('input[type=email]', process.env.SPLITUP_EMAIL);
await page.fill('input[type=password]', process.env.SPLITUP_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);
await snap('01-home');

for (const r of ['groups', 'friends', 'activity', 'account']) {
  await page.goto(`${BASE}/${r}`);
  await snap(`02-${r}`);
}

// Drill into up to 4 groups and 4 friends.
for (const kind of ['groups', 'friends']) {
  await page.goto(`${BASE}/${kind}`);
  await page.waitForTimeout(1500);
  const hrefs = [...new Set(await page.$$eval(`a[href^="/${kind}/"]`, (as) => as.map((a) => a.getAttribute('href'))))].slice(0, 4);
  for (const [i, h] of hrefs.entries()) {
    await page.goto(BASE + h);
    await snap(`03-${kind}-${i}`);
  }
}
await ctx.storageState({ path: `${OUT}/state.json` });
await browser.close();
