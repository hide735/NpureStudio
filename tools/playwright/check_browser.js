#!/usr/bin/env node
// tools/playwright/check_browser.js
// Playwright E2E: load app, click generate, capture console & network, assert common errors fixed

const URL = process.env.APP_URL || 'http://localhost:8080/';
const NAV_TIMEOUT = 60000;
const WAIT_AFTER_CLICK = 45000; // ms

async function run() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (err) {
    console.error('\nPlaywright is not installed. Install dev dependency and browsers with:');
    console.error('  npm i -D playwright');
    console.error('  npx playwright install');
    console.error('\nThen re-run: node tools/playwright/check_browser.js\n');
    process.exit(2);
  }

  const browser = await playwright.chromium.launch({ headless: true, args: [ '--enable-unsafe-webgpu', '--enable-experimental-web-platform-features' ] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const logs = [];
  const errors = [];
  const responses = [];

  page.on('console', msg => {
    try { logs.push({ type: msg.type(), text: msg.text() }); } catch(e) { logs.push({ type: 'unknown', text: String(msg) }); }
  });
  page.on('pageerror', err => errors.push(String(err)));
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const status = res.status();
      responses.push({ url, status });
    } catch (e) {}
  });

  console.log('Navigating to', URL);
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  } catch (e) {
    console.error('Navigation failed:', e.message || e);
    await browser.close();
    process.exit(3);
  }

  // Wait for app to attach handlers
  await page.waitForTimeout(500);

  // Ensure the generate button exists
  const genExists = await page.$('#generate-btn');
  if (!genExists) {
    console.error('Generate button (#generate-btn) not found on page.');
    await browser.close();
    process.exit(4);
  }

  // Fill prompt and click generate to trigger translator/generator init flows
  try {
    await page.fill('#inpaint-prompt', 'テスト: Playwright 自動化');
  } catch (e) {
    // ignore if fill fails
  }

  console.log('Clicking generate to trigger lazy initialization...');
  await page.click('#generate-btn');

  console.log(`Waiting ${WAIT_AFTER_CLICK}ms for console/network activity...`);
  await page.waitForTimeout(WAIT_AFTER_CLICK);

  // Summarize findings
  const summary = {
    totalLogs: logs.length,
    totalErrors: errors.length,
    onnxResponses: responses.filter(r => r.url.includes('onnxruntime-web') || r.url.includes('ort.') ),
    mimeIssues: logs.filter(l => /MIME type|Refused to execute script/i.test(l.text)),
    dtypeWarnings: logs.filter(l => /dtype not specified/i.test(l.text)),
    unsupportedPipeline: logs.filter(l => /Unsupported pipeline: text-to-image/i.test(l.text)),
  };

  console.log('\n--- Playwright check summary ---');
  console.log('Total console messages:', summary.totalLogs);
  console.log('Page errors:', summary.totalErrors);
  console.log('onnxruntime/network hits (sample):');
  for (const r of summary.onnxResponses) console.log(' ', r.status, r.url);
  console.log('MIME/script issues found:', summary.mimeIssues.length);
  console.log('dtype warnings found:', summary.dtypeWarnings.length);
  console.log('Unsupported pipeline messages:', summary.unsupportedPipeline.length);

  // Heuristics for pass/fail
  const pass = (
    // No MIME/script refusal and onnxruntime loaded with 2xx OR no onnx requests made
    (summary.mimeIssues.length === 0) &&
    (summary.onnxResponses.length === 0 || summary.onnxResponses.some(r => r.status >= 200 && r.status < 400))
  );

  if (pass) {
    console.log('\nResult: PASS — basic checks OK');
    await browser.close();
    process.exit(0);
  } else {
    console.error('\nResult: FAIL — issues detected. Save full logs to tools/playwright/check_browser.log');
    const fs = require('fs');
    fs.writeFileSync('tools/playwright/check_browser.log', JSON.stringify({ logs, errors, responses }, null, 2));
    await browser.close();
    process.exit(5);
  }
}

run().catch(e => {
  console.error('Unexpected error in Playwright check:', e && e.message ? e.message : e);
  process.exit(99);
});
