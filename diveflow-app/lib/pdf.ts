import puppeteer from 'puppeteer';

export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ printBackground: true, format: 'A4' });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generateReceiptPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ printBackground: true, width: '80mm' });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
