import { it } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1aPage } from '@/lib/extraction-patterns/pattern1a';
import * as fs from 'fs';

it('debug page 1', async () => {
  const pdfPath = 'public/HOLERITES_MENTOR_544-552_ANO_2024.pdf';
  if (!fs.existsSync(pdfPath)) { console.log('PDF not found'); return; }
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const page = await pdf.getPage(1);
  const items = await extractTextItems(page);

  const result = extractPattern1aPage(items);
  console.log('\n=== Extraction Result ===');
  console.log('Events count:', result.month.eventos?.length || 0);
  if (result.month.eventos) {
    for (const ev of result.month.eventos) {
      console.log('  ' + ev.codigo + ' ' + ev.descricao + ' | ref=' + ev.referencia + ' venc=' + ev.vencimento + ' desc=' + ev.desconto);
    }
  }
  console.log('TotalVenc=' + result.month.totalVencimentos + ' TotalDesc=' + result.month.totalDescontos + ' Liq=' + result.month.valorLiquido);
});
