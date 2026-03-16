import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems, groupIntoLines, findColumnX } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1a } from '@/lib/extraction-patterns/pattern1a';
import type { TextItem } from '@/lib/extraction-patterns/pdf-layout';
import * as fs from 'fs';
import * as path from 'path';

describe('SECID Extraction', () => {
  it('should correctly separate vencimentos and descontos', async () => {
    const pdfPath = path.resolve(__dirname, '../../public/test-secid-3.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('test-secid-3.pdf not found, skipping');
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    
    // Analyze page 1 in detail
    const page = await pdf.getPage(1);
    const items = await extractTextItems(page);
    const lines = groupIntoLines(items);
    
    console.log(`\n=== PAGE 1 (${lines.length} lines) ===`);
    
    // Find header line
    let headerLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].text;
      if (/Proventos/i.test(text) && /Descontos/i.test(text)) {
        headerLineIdx = i;
        console.log(`\nHEADER LINE ${i}: "${text}"`);
        for (const item of lines[i].items) {
          console.log(`  item: "${item.str}" x=${item.x.toFixed(1)} w=${item.width.toFixed(1)} rightEdge=${(item.x + item.width).toFixed(1)}`);
        }
        
        const vencX = findColumnX(lines[i], 'Proventos');
        const descX = findColumnX(lines[i], 'Descontos');
        const refX = findColumnX(lines[i], 'Ref');
        console.log(`  vencX(center)=${vencX?.toFixed(1)} descX(center)=${descX?.toFixed(1)} refX(center)=${refX?.toFixed(1)}`);
        if (vencX && descX) {
          console.log(`  midpoint=${((vencX + descX) / 2).toFixed(1)} gap=${Math.abs(descX - vencX).toFixed(1)}`);
        }
        break;
      }
    }
    
    // Show event lines with INSS, IRRF, MENSALIDADE
    if (headerLineIdx >= 0) {
      for (let i = headerLineIdx + 1; i < Math.min(headerLineIdx + 20, lines.length); i++) {
        const text = lines[i].text;
        if (/INSS|IRRF|MENSALIDADE/i.test(text)) {
          console.log(`\nEVENT LINE ${i}: "${text}"`);
          for (const item of lines[i].items) {
            console.log(`  item: "${item.str}" x=${item.x.toFixed(1)} w=${item.width.toFixed(1)} rightEdge=${(item.x + item.width).toFixed(1)} center=${(item.x + item.width/2).toFixed(1)}`);
          }
        }
      }
    }
    
    // Run full extraction
    const numPages = pdf.numPages;
    const pageItems: TextItem[][] = [];
    for (let p = 1; p <= numPages; p++) {
      const pg = await pdf.getPage(p);
      pageItems.push(await extractTextItems(pg));
    }
    
    const result = extractPattern1a(pageItems);
    console.log(`\n=== RESULT ===`);
    console.log(`Months: ${result.months.length}`);
    
    // Check first month events
    const month1 = result.months[0];
    if (month1) {
      console.log(`\n--- ${month1.month} ---`);
      for (const ev of (month1.eventos || [])) {
        console.log(`  ${ev.codigo} | ${ev.descricao} | ref:${ev.referencia} | v:${ev.vencimento} | d:${ev.desconto}`);
      }
      
      // INSS NORMAL should be desconto
      const inss = month1.eventos?.find(e => /INSS/i.test(e.descricao));
      if (inss) {
        console.log(`\nINSS check: vencimento=${inss.vencimento} desconto=${inss.desconto}`);
        expect(inss.desconto).not.toBe('0');
        expect(inss.vencimento).toBe('0');
      }
      
      // IRRF should be desconto
      const irrf = month1.eventos?.find(e => /IRRF/i.test(e.descricao));
      if (irrf) {
        console.log(`IRRF check: vencimento=${irrf.vencimento} desconto=${irrf.desconto}`);
        expect(irrf.desconto).not.toBe('0');
        expect(irrf.vencimento).toBe('0');
      }
      
      // MENSALIDADE SINDICAL should be desconto
      const mensalidade = month1.eventos?.find(e => /MENSALIDADE/i.test(e.descricao));
      if (mensalidade) {
        console.log(`MENSALIDADE check: vencimento=${mensalidade.vencimento} desconto=${mensalidade.desconto}`);
        expect(mensalidade.desconto).not.toBe('0');
        expect(mensalidade.vencimento).toBe('0');
      }
    }
  });
});
