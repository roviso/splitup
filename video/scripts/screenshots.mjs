// Capture real product screens for the launch video. Read-only: forms are filled but never submitted.
// Usage: SPLITUP_EMAIL=... SPLITUP_PASSWORD=... node scripts/screenshots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://splitup.thimitech.com';
const OUT = 'public/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, colorScheme: 'light', locale: 'en-US' });
const page = await ctx.newPage();
const settle = async () => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500); };
const shot = async (name, opts = {}) => { await settle(); await page.screenshot({ path: `${OUT}/${name}.png`, ...opts }); console.log('shot', name); };
const tall = (h) => page.setViewportSize({ width: 430, height: h });
const dialogShot = async (name) => { await page.evaluate(() => document.activeElement?.blur()); await settle(); await page.locator('dialog[open]').screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const closeDialog = () => page.keyboard.press('Escape');

// Login screen (logged out), then log in.
await page.goto(BASE);
await shot('login');
await page.fill('input[type=email]', process.env.SPLITUP_EMAIL);
await page.fill('input[type=password]', process.env.SPLITUP_PASSWORD);
await page.click('button[type=submit]');
await page.waitForSelector('text=Total balance', { timeout: 20000 });

await shot('home');
await page.goto(`${BASE}/friends`);
await shot('friends');
await page.goto(`${BASE}/activity`);
await shot('activity');

// Group: expenses + balances.
await page.goto(`${BASE}/groups`);
await settle();
await page.locator('a[href^="/groups/"]').first().click();
await shot('group');
const groupUrl = page.url();
await page.getByText('Balances', { exact: true }).click();
await shot('group-balances');

// Add expense: equal split.
await page.goto(groupUrl);
await settle();
await tall(1500);
await page.getByRole('button', { name: /Add expense/ }).first().click();
await page.getByPlaceholder(/What was it/).fill('Momo night at Bhojan Griha');
await page.getByLabel('Amount').fill('2400');
await dialogShot('expense-equal');

// Itemized bill with service charge + VAT.
await page.locator('dialog[open] [title="Itemized bill"]').click();
await tall(2600);
await page.waitForTimeout(500);
const items = [['Buff momo (2 plates)', '640'], ['Chicken chowmein', '420'], ['Lemon soda × 4', '360']];
for (const [i, [n, p]] of items.entries()) {
  if (i > 0) await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByPlaceholder(/Item, e.g/).nth(i).fill(n);
  await page.getByPlaceholder('रु 0').nth(i).fill(p);
}
// Momo + soda: everyone. Chowmein: only you and the next person had it.
const chips = (i) => page.locator('dialog[open] .space-y-2.rounded-3xl').nth(i).locator('button.rounded-full');
await chips(0).nth(0).click();
await chips(1).nth(1).click();
await chips(1).nth(2).click();
await chips(2).nth(0).click();
await dialogShot('expense-itemized');
await closeDialog();

// Settle up picker + form.
await tall(1300);
await page.goto(groupUrl);
await settle();
await page.getByRole('button', { name: /Settle up/ }).first().click();
await dialogShot('settle-pick');
await page.locator('dialog[open] button').filter({ hasText: /रु/ }).first().click();
await dialogShot('settle-form');
await closeDialog();

// Friend code / QR.
await tall(932);
await page.goto(`${BASE}/friends`);
await settle();
await page.getByText('Your friend code').click().catch(() => {});
await page.waitForTimeout(800);
if (await page.locator('dialog[open]').count()) await dialogShot('friend-qr');
await closeDialog();

// Nepali home.
await page.goto(BASE);
await settle();
await page.getByRole('button', { name: 'नेपाली' }).first().click();
await shot('home-ne');
await page.getByRole('button', { name: 'EN' }).first().click(); // restore the account's language
await settle();

await browser.close();
