import { describe, it, expect, beforeAll } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems, flattenItems } from '@/lib/extraction-patterns';
import { extractPattern1aPage } from '@/lib/extraction-patterns/pattern1a';
import type { TextItem } from '@/lib/extraction-patterns';
import fs from 'fs';
import path from 'path';

// Disable worker for Node
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

describe('MENTOR PDF extraction - per page', () => {
  let pagesItems: TextItem[][] = [];

  beforeAll(async () => {
    const pdfPath = path.resolve('/tmp/mentor.pdf');
    const data = fs.readFileSync(pdfPath);
    const pdf = await pdfjsLib.getDocument({ data, disableWorker: true } as any).promise;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const items = await extractTextItems(page);
      pagesItems.push(items);
    }
  });

  const expected = [
    { page: 1, month: '04/2024', totalVenc: '1.135,08', totalDesc: '435,57', liquido: '699,51' },
    { page: 2, month: '05/2024', totalVenc: '318,00', totalDesc: '23,85', liquido: '294,15' },
    { page: 3, month: '06/2024', totalVenc: '318,00', totalDesc: '23,85', liquido: '294,15' },
    { page: 4, month: '07/2024', totalVenc: '318,00', totalDesc: '23,85', liquido: '294,15' },
    { page: 5, month: '08/2024', totalVenc: '318,00', totalDesc: '23,85', liquido: '294,15' },
    { page: 6, month: '09/2024', totalVenc: '1.272,00', totalDesc: '108,12', liquido: '1.163,88' },
    { page: 7, month: '10/2024', totalVenc: '1.272,00', totalDesc: '374,77', liquido: '897,23' },
    { page: 8, month: '11/2024', totalVenc: '1.749,00', totalDesc: '108,12', liquido: '1.640,88' },
    { page: 9, month: '12/2024', totalVenc: '3.879,60', totalDesc: '3.879,60', liquido: '0,00' },
  ];

  for (const exp of expected) {
    it(`Page ${exp.page} (${exp.month}) should have correct totals`, () => {
      const result = extractPattern1aPage(pagesItems[exp.page - 1]);
      console.log(`Page ${exp.page}: month=${result.month.month}, totalVenc=${result.month.totalVencimentos}, totalDesc=${result.month.totalDescontos}, liquido=${result.month.valorLiquido}`);
      console.log(`  Fields with "Total" or "Líquido" or "Base":`, result.month.fields.filter(f => /Total|Líquido|Base|FGTS/i.test(f.key)).map(f => `${f.key}=${f.value}`));
      expect(result.month.totalVencimentos).toBe(exp.totalVenc);
      expect(result.month.totalDescontos).toBe(exp.totalDesc);
      expect(result.month.valorLiquido).toBe(exp.liquido);
    });
  }
});
