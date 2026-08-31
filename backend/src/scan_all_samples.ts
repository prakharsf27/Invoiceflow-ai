import fs from 'fs';
import path from 'path';
import { documentTextExtractionService } from './services/documentTextExtractionService.js';
import { deterministicParserService } from './services/extraction/deterministicParserService.js';

async function scanAll() {
  const uploadsDir = path.resolve('uploads');
  const dirs = fs.readdirSync(uploadsDir);
  const seenHashes = new Set<string>();

  for (const d of dirs) {
    const fullDir = path.join(uploadsDir, d);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    const files = fs.readdirSync(fullDir);
    for (const f of files) {
      if (!f.endsWith('.pdf')) continue;
      const filePath = path.join(fullDir, f);
      const buf = fs.readFileSync(filePath);
      const res = await documentTextExtractionService.extractText(buf);
      const key = res.text.slice(0, 100);
      if (seenHashes.has(key)) continue;
      seenHashes.add(key);

      console.log('====================================');
      console.log('UNIQUE PDF SAMPLE:', filePath);
      console.log('RAW EXTRACTED TEXT (sample 400 chars):');
      console.log(res.text.slice(0, 400));
      console.log('PARSED INVOICE RESULT:');
      const parsed = deterministicParserService.parseInvoiceText(res.text);
      console.log({
        docType: deterministicParserService.detectDocumentTypeFromText(res.text),
        invoiceNumber: parsed.data.invoiceNumber,
        supplierName: parsed.data.supplierName,
        supplierGstin: parsed.data.supplierGstin,
        invoiceDate: parsed.data.invoiceDate,
        dueDate: parsed.data.dueDate,
        poNumber: parsed.data.poNumber,
        subtotal: parsed.data.subtotal,
        tax: parsed.data.tax,
        amount: parsed.data.amount,
        paymentTerms: parsed.data.paymentTerms,
        bankDetails: parsed.data.bankDetails,
        lineItemsCount: parsed.data.lineItems.length,
        confidence: parsed.confidence,
        needsAI: parsed.needsAI,
      });
      console.log('====================================\n');
    }
  }
}
scanAll().catch(console.error);
