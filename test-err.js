import puppeteer from 'puppeteer-core';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  await page.goto('http://localhost:5174/The-Rugby-Manager/tools/phase-animator.html');
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
})();
