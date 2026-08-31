import fs from 'fs';
import path from 'path';
import { documentTextExtractionService } from './services/documentTextExtractionService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';

async function scan() {
  const uploadsDir = path.resolve('uploads');
  if (!fs.existsSync(uploadsDir)) {
    console.log('No uploads dir found');
    return;
  }
  const dirs = fs.readdirSync(uploadsDir);
  for (const d of dirs) {
    const fullDir = path.join(uploadsDir, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir);
    for (const f of files) {
      if (!f.endsWith('.pdf')) continue;
      const filePath = path.join(fullDir, f);
      const buf = fs.readFileSync(filePath);
      const res = await documentTextExtractionService.extractText(buf);
      if (
        res.text.includes('00989') ||
        res.text.includes('07AADCD7742P1ZQ') ||
        res.text.includes('DataCore') ||
        res.text.includes('320960') ||
        res.text.includes('272000') ||
        res.text.includes('Enterprise Network Switch')
      ) {
        console.log('====================================');
        console.log('MATCH FOUND:', filePath);
        console.log('--- RAW TEXT ---');
        console.log(res.text);
        console.log('--- PARSER OUTPUT ---');
        const parsed = deterministicParserService.parseInvoiceText(res.text);
        console.log(JSON.stringify(parsed, null, 2));
        console.log('====================================\n');
      }
    }
  }
}
scan().catch(console.error);
