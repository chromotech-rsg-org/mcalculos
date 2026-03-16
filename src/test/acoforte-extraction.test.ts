// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems, groupIntoLines } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1a } from '@/lib/extraction-patterns/pattern1a';
import fs from 'fs';
import path from 'path';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.mjs';

describe('Acoforte Extraction', () => {
  it('should extract events from Acoforte payslip', async () => {
    const pdfPath = path.resolve(__dirname, '../../public/test-acoforte.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('SKIP: test-acoforte.pdf not found');
      return;
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = new Uint8Array(pdfBuffer);

    const pdf = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const numPages = pdf.numPages;
    console.log('Total pages:', numPages);

    const pageItems: any[][] = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const items = await extractTextItems(page);
      pageItems.push(items);
    }

    // Debug page 1 lines
    const lines = groupIntoLines(pageItems[0]);
    console.log(`\n=== PAGE 1 (${lines.length} lines) ===`);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      console.log(`  L${i}: [y=${l.y.toFixed(1)}] "${l.text}"`);
      if (l.text.includes('VERBA') || l.text.includes('PROVENTOS') || l.text.includes('SALARIO') || l.text.includes('SALAR')) {
        for (const it of l.items) {
          console.log(`    item: "${it.str}" x=${it.x.toFixed(1)} w=${it.width.toFixed(1)}`);
        }
      }
    }

    const result = extractPattern1a(pageItems);

    console.log('\n=== RESULT ===');
    console.log('Employee:', result.employeeName);
    console.log('CNPJ:', result.cnpj);
    console.log('Months:', result.months.length);

    for (const month of result.months) {
      console.log(`\n--- ${month.month} (comp: ${month.competencia}) ---`);
      console.log('Events:', month.eventos?.length ?? 0);
      if (month.eventos) {
        for (const ev of month.eventos) {
          console.log(`  ${ev.codigo} | ${ev.descricao} | ref:${ev.referencia} | v:${ev.vencimento} | d:${ev.desconto}`);
        }
      }
      console.log('Fields:', month.fields?.length ?? 0);
      for (const f of (month.fields || []).slice(0, 10)) {
        console.log(`  ${f.key}: ${f.value}`);
      }
      console.log('TotVenc:', month.totalVencimentos, 'TotDesc:', month.totalDescontos, 'Liq:', month.valorLiquido);
    }

    expect(result.months.length).toBeGreaterThan(0);
    const totalEvents = result.months.reduce((s, m) => s + (m.eventos?.length ?? 0), 0);
    console.log('\nTotal events:', totalEvents);
    expect(totalEvents).toBeGreaterThan(0);
  }, 120000);
});
