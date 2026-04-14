import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1aPage } from '@/lib/extraction-patterns/pattern1a';
import type { TextItem } from '@/lib/extraction-patterns/pdf-layout';
import * as fs from 'fs';
import * as path from 'path';

describe('MENTOR PDF extraction - per page totals', () => {
  it('should extract correct totals per page', async () => {
    const pdfPath = path.resolve(__dirname, '../../public/HOLERITES_MENTOR_544-552_ANO_2024.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('MENTOR PDF not found, skipping');
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    
    const expected = [
      { page: 1, month: '04/2024', totalVenc: '1.135,08', totalDesc: '435,57', liquido: '699,51' },
      { page: 2, month: '05/2024', totalVenc: '318,00', totalDesc: '23,85', liquido: '294,15' },
      { page: 6, month: '09/2024', totalVenc: '1.272,00', totalDesc: '108,12', liquido: '1.163,88' },
      { page: 9, month: '12/2024', totalVenc: '3.879,60', totalDesc: '3.879,60', liquido: '0,00' },
    ];

    for (const exp of expected) {
      const page = await pdf.getPage(exp.page);
      const items = await extractTextItems(page);
      const result = extractPattern1aPage(items);
      
      console.log(`Page ${exp.page}: month=${result.month.month}, totalVenc=${result.month.totalVencimentos}, totalDesc=${result.month.totalDescontos}, liquido=${result.month.valorLiquido}`);
      console.log(`  Footer fields:`, result.month.fields.filter(f => /Total|Líquido|Base.*FGTS|FGTS.*[Mm]|Base.*IRRF/i.test(f.key)).map(f => `${f.key}=${f.value}`));
      
      expect(result.month.totalVencimentos).toBe(exp.totalVenc);
      expect(result.month.totalDescontos).toBe(exp.totalDesc);
      expect(result.month.valorLiquido).toBe(exp.liquido);
    }
  });
});
