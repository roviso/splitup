// Real phone screens for the Smart Split film, plus the boxes of the UI we tap or type into.
// Spends 2 AI credits (one scan, one chat); never saves an expense.
// Usage: SPLITUP_EMAIL=... SPLITUP_PASSWORD=... node scripts/screenshots-ai.mjs -> public/ai/shots/*.png + boxes.json
import { chromium } from 'playwright';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://splitup.thimitech.com';
const OUT = 'public/ai/shots';
const BILL = 'research/ai/bill-photo.jpg';
const CHAT = 'hijo Aayush ra Binisha sanga momo, 1,350, I paid';
const ASSIGN = 'Binisha and I had the beers, Sagar had the chowmein, everyone shared the rest. I paid.';
mkdirSync(OUT, { recursive: true });
copyFileSync(BILL, `${OUT}/bill-photo.jpg`);

const browser = await chromium.launch();
const device = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, colorScheme: 'light', locale: 'en-US', isMobile: true, hasTouch: true };
const ctx = await browser.newContext(device);
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept()); // "Discard this bill?" -> yes, nothing is saved
const boxes = {};
const settle = async (ms = 1200) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(ms); };
const shot = async (name, ms) => { await settle(ms); await page.evaluate(() => document.activeElement?.blur()); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
/** Remember where an element is on screen (CSS px; the video multiplies by 3). */
const box = async (name, loc) => { const b = await loc.filter({ visible: true }).first().boundingBox(); if (!b) throw new Error(`no box for ${name}`); boxes[name] = b; };
const dialog = () => page.locator('dialog[open]');
const scrollSheet = (y) => page.evaluate((y) => {
  document.querySelectorAll('dialog[open] *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = y; });
}, y);
const waitAnswer = () => page.waitForFunction(() => !document.querySelector('dialog[open] .animate-spin'), null, { timeout: 120000 });

// Logged out: login page (the install demo's site) and a friend's invite link.
await page.goto(BASE);
await shot('login');
await page.goto(`${BASE}/add/VG7U-DX5G`);
await shot('invite-landing');
await box('inviteBanner', page.getByText(/You both get/).locator('xpath=ancestor::div[2]'));

await page.goto(BASE);
await page.fill('input[type=email]', process.env.SPLITUP_EMAIL);
await page.fill('input[type=password]', process.env.SPLITUP_PASSWORD);
await page.click('button[type=submit]');
await page.waitForSelector('text=Total balance', { timeout: 30000 });
await shot('home');
await box('aiBar', page.locator('form.ai-bar'));
await box('aiInput', page.locator('form.ai-bar input'));

// Credits sheet: balance, then the invite card.
await page.getByTitle('AI credits').first().click();
await shot('credits');
await box('creditDots', dialog().getByText('free every month').locator('..'));
await scrollSheet(9999);
await shot('credits-invite', 600);
await box('inviteCode', dialog().getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/));
await box('shareInvite', dialog().getByRole('button', { name: /Share invite/ }));
await box('bonusRow', dialog().getByText(/Bonus credits/).locator('..'));
await page.keyboard.press('Escape');

// Group -> Smart split -> scan the bill.
await page.goto(`${BASE}/groups`);
await settle();
await page.locator('a[href^="/groups/"]').first().click();
await shot('group');
await box('liveSync', page.getByText('Live sync'));
await page.locator('form.ai-bar input').click();
await page.keyboard.press('Enter');
await shot('group-start');
await box('upload', dialog().getByRole('button', { name: 'Upload' }));
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dialog().getByRole('button', { name: 'Upload' }).click()]);
await chooser.setFiles(BILL);
await shot('reading-1', 400);
await shot('reading-2', 1800);
await shot('reading-3', 1800);
await page.waitForSelector('text=/Tap a person|Assign/', { timeout: 120000 });
await shot('scanned', 1500);
await box('composer', dialog().locator('textarea').last().locator('..'));

// Tell it who had what (same bill session: free).
await dialog().locator('textarea').last().fill(ASSIGN);
await dialog().locator('textarea').last().press('Enter');
await waitAnswer();
await shot('assigned', 1500);
await scrollSheet(9999);
await shot('assigned-bottom', 600);
await box('save', dialog().getByRole('button', { name: /^Save/ }));
await box('shareList', dialog().getByText('Each share includes service charge and VAT').locator('..'));
await box('matches', dialog().getByText('Matches the bill total'));
await page.keyboard.press('Escape');
await settle();

// Chat with no photo, from Home.
await page.goto(BASE);
await settle();
await page.locator('form.ai-bar input').fill(CHAT);
await page.locator('form.ai-bar input').press('Enter');
await page.waitForTimeout(800);
await waitAnswer();
await shot('chat-draft', 1500);
await box('chatPeople', dialog().getByText('Tap a person, then tap everything they had').locator('xpath=following-sibling::*[1]'));
await box('chatReply', dialog().locator('p.line-clamp-2, p:has(> span.line-clamp-2)').last());
console.log('reply:', await dialog().locator('span.line-clamp-2').last().innerText().catch(() => '?'));
await page.keyboard.press('Escape');

writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
console.log(Object.keys(boxes).join(', '));
await browser.close();
