const { chromium } = require('playwright-core');
const fs = require('fs');

const TARGET_URL = (process.argv[2] || process.env.TARGET_URL || 'https://app.zoikoshield.com').replace(/\/+$/, '');
const USER_EMAIL = process.env.USER_EMAIL || 'aditya@zoiko.com';
const USER_PASS = process.env.USER_PASS || 'Aditya@20045678';

const VIEWPORTS = [320, 480, 768, 1024, 1280, 1440, 1600, 1920];
const ROUTES_TO_TEST = [
  '/login',
  '/customer/dashboard',
  '/alerts',
  '/cases',
  '/findings',
  '/connectors',
  '/notifications',
  '/pricing',
  '/ai-governance',
  '/compliance',
];

async function run() {
  console.log(`Starting Viewport & Interaction Verification against ${TARGET_URL}...`);

  // Detect Chrome executable on Windows
  const candidateChromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const executablePath = candidateChromePaths.find((p) => p && fs.existsSync(p));
  if (!executablePath) {
    console.error('Google Chrome executable not found on host.');
    process.exit(1);
  }

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const summary = [];

  for (const width of VIEWPORTS) {
    console.log(`\n--- Testing Viewport Width: ${width}px ---`);
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore benign telemetry/favicon noise
        if (!text.includes('favicon.ico')) {
          consoleErrors.push(text);
        }
      }
    });

    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
        failedRequests.push({ url: res.url(), status: res.status() });
      }
    });

    // 1. Perform Login
    try {
      await page.goto(`${TARGET_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.fill('input[type="email"]', USER_EMAIL);
      await page.fill('input[type="password"]', USER_PASS);
      const submitBtn = await page.$('button[type="submit"]') || await page.$('button:has-text("Sign in")') || await page.$('button:has-text("Log in")');
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          submitBtn.click(),
        ]);
      }
      await page.waitForTimeout(2000);
    } catch (err) {
      console.warn(`Login flow warning at ${width}px:`, err.message);
    }

    // 2. Visit routes and exercise controls
    for (const route of ROUTES_TO_TEST) {
      try {
        await page.goto(`${TARGET_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1000);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });

        // Click buttons / tabs present on the page
        const clickableCount = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button:not([disabled])'));
          const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
          const targets = [...btns.slice(0, 5), ...tabs.slice(0, 3)];
          let clicked = 0;
          for (const el of targets) {
            try {
              el.click();
              clicked++;
            } catch {}
          }
          return clicked;
        });

        summary.push({
          width,
          route,
          overflow,
          clickableCount,
          consoleErrorCount: consoleErrors.length,
          failedRequestCount: failedRequests.length,
          pass: consoleErrors.length === 0,
        });

        console.log(`  [${width}px] ${route} -> Overflow: ${overflow ? 'YES' : 'NO'}, Clicked: ${clickableCount}, Console Errors: ${consoleErrors.length}`);
      } catch (err) {
        console.error(`  [${width}px] ${route} FAILED:`, err.message);
        summary.push({
          width,
          route,
          overflow: false,
          clickableCount: 0,
          consoleErrorCount: consoleErrors.length + 1,
          failedRequestCount: failedRequests.length,
          pass: false,
          error: err.message,
        });
      }
    }

    await context.close();
  }

  await browser.close();

  fs.writeFileSync('scripts/frontend-viewport-results.json', JSON.stringify(summary, null, 2));
  console.log('\n--- VIEWPORT & INTERACTION VERIFICATION COMPLETE ---');
  const total = summary.length;
  const passed = summary.filter((s) => s.pass).length;
  console.log(`Total Route/Viewport Combinations Tested: ${total}`);
  console.log(`Passed: ${passed}, Failed: ${total - passed}`);
}

run().catch((err) => {
  console.error('[FATAL] Viewport verification failed:', err);
  process.exit(1);
});
