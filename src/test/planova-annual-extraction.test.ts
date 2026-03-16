// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems, groupIntoLines } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1a } from '@/lib/extraction-patterns/pattern1a';
import fs from 'fs';
import path from 'path';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.mjs';

describe('PLANOVA Annual Report Extraction', () => {
  it('should extract events from annual report PDF', async () => {
    const pdfPath = path.resolve(__dirname, '../../public/test-planova-annual.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('SKIP: test-planova-annual.pdf not found');
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

    // Debug: print first 3 pages lines
    for (let p = 0; p < Math.min(3, numPages); p++) {
      const lines = groupIntoLines(pageItems[p]);
      console.log(`\n=== PAGE ${p + 1} (${lines.length} lines) ===`);
      for (let i = 0; i < Math.min(30, lines.length); i++) {
        const l = lines[i];
        console.log(`  L${i}: [y=${l.y.toFixed(1)}] "${l.text}"`);
        // Show individual items for header-like lines
        if (l.text.includes('Evento') || l.text.includes('Código') || l.text.includes('Mês') || l.text.includes('Proventos') || l.text.includes('Valor')) {
          for (const it of l.items) {
            console.log(`    item: "${it.str}" x=${it.x.toFixed(1)} w=${it.width.toFixed(1)}`);
          }
        }
      }
    }

    // Run extraction
    const result = extractPattern1a(pageItems);

    console.log('\n=== EXTRACTION RESULT ===');
    console.log('Employee:', result.employeeName);
    console.log('CNPJ:', result.cnpj);
    console.log('Number of months:', result.months.length);

    for (const month of result.months) {
      console.log(`\n--- Month: ${month.month} ---`);
      console.log('Competência:', month.competencia);
      console.log('Events count:', month.eventos?.length ?? 0);
      if (month.eventos && month.eventos.length > 0) {
        for (const ev of month.eventos) {
          console.log(`  ${ev.codigo} | ${ev.descricao} | ref: ${ev.referencia} | venc: ${ev.vencimento} | desc: ${ev.desconto}`);
        }
      }
      console.log('Fields count:', month.fields?.length ?? 0);
    }

    // Assertions
    expect(result.months.length).toBeGreaterThan(0);
    
    // Should have events
    const totalEvents = result.months.reduce((sum, m) => sum + (m.eventos?.length ?? 0), 0);
    console.log('\nTotal events across all months:', totalEvents);
    expect(totalEvents).toBeGreaterThan(0);
  }, 120000);
});
