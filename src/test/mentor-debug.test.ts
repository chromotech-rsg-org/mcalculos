import { it } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems, groupIntoLines } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1aPage } from '@/lib/extraction-patterns/pattern1a';
import * as fs from 'fs';

it('debug page 1', async () => {
  const pdfPath = 'public/HOLERITES_MENTOR_544-552_ANO_2024.pdf';
  if (!fs.existsSync(pdfPath)) { console.log('PDF not found'); return; }
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const page = await pdf.getPage(1);
  const items = await extractTextItems(page);
  const lines = groupIntoLines(items);

  // Show header and event lines
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if (/Evento|Proventos|Descontos|0741|0742|1741|VALE|Total|Base.*FGTS|Líquido/i.test(t)) {
      console.log(`L${i}: "${t}"`);
      console.log('  Items:', lines[i].items.map(it => `"${it.str}" x=${Math.round(it.x)} w=${Math.round(it.width)} re=${Math.round(it.x+it.width)}`).join(' | '));
    }
  }

  const result = extractPattern1aPage(items);
  console.log('\n=== Extraction Result ===');
  console.log('Events count:', result.month.events?.length || 0);
  if (result.month.events) {
    for (const ev of result.month.events) {
      console.log(`  ${ev.codigo} ${ev.descricao} | ref=${ev.referencia} venc=${ev.vencimento} desc=${ev.desconto}`);
    }
  }
  console.log(`TotalVenc=${result.month.totalVencimentos} TotalDesc=${result.month.totalDescontos} Liq=${result.month.valorLiquido}`);
});
