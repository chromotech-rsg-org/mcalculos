import { describe, it, expect } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { extractTextItems, groupIntoLines } from '@/lib/extraction-patterns/pdf-layout';
import { extractPattern1a } from '@/lib/extraction-patterns/pattern1a';
import fs from 'fs';
import path from 'path';

// Configure PDF.js worker for Node
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

describe('Keypar PDF Extraction', () => {
  it('should correctly extract events from Keypar payslip PDF', async () => {
    const pdfPath = path.resolve(__dirname, '../../public/test-keypar.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = new Uint8Array(pdfBuffer);

    const pdf = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const numPages = pdf.numPages;
    const pageItems: any[][] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const items = await extractTextItems(page);
      pageItems.push(items);
    }

    const result = extractPattern1a(pageItems);

    console.log('=== EXTRACTION RESULT ===');
    console.log('Employee:', result.employeeName);
    console.log('CNPJ:', result.cnpj);
    console.log('Number of months:', result.months.length);

    for (const month of result.months) {
      console.log(`\n--- Month: ${month.month} ---`);
      console.log('Competência:', month.competencia);
      console.log('Total Vencimentos:', month.totalVencimentos);
      console.log('Total Descontos:', month.totalDescontos);
      console.log('Valor Líquido:', month.valorLiquido);
      
      if (month.eventos && month.eventos.length > 0) {
        console.log('Events:');
        for (const ev of month.eventos) {
          console.log(`  ${ev.codigo} | ${ev.descricao} | ref: ${ev.referencia} | venc: ${ev.vencimento} | desc: ${ev.desconto}`);
        }
      } else {
        console.log('NO EVENTS EXTRACTED');
      }
      
      // Key fields
      const keyFields = ['Empresa', 'CNPJ', 'Nome', 'Cargo', 'Salário Base', 'Base FGTS', 'FGTS do Mês', 'Base IRRF'];
      for (const kf of keyFields) {
        const field = month.fields?.find(f => f.key.toLowerCase().includes(kf.toLowerCase()));
        if (field) console.log(`  ${field.key}: ${field.value}`);
      }
    }

    // Basic assertions
    expect(result.months.length).toBeGreaterThan(0);
    
    for (const month of result.months) {
      // Every month should have events
      expect(month.eventos).toBeDefined();
      expect(month.eventos!.length).toBeGreaterThan(0);
      
      // Check events have proper structure
      for (const ev of month.eventos!) {
        expect(ev.codigo).toMatch(/^\d{3,4}$/);
        expect(ev.descricao.length).toBeGreaterThan(0);
        
        // At least one of vencimento or desconto should be non-zero
        const hasValue = ev.vencimento !== '0' || ev.desconto !== '0';
        expect(hasValue).toBe(true);
        
        // Vencimento and desconto should not contain concatenated values (e.g., "9,131.531,00")
        if (ev.vencimento !== '0') {
          const commaCount = (ev.vencimento.match(/,/g) || []).length;
          expect(commaCount).toBeLessThanOrEqual(1); // Max one comma (decimal separator)
        }
        if (ev.desconto !== '0') {
          const commaCount = (ev.desconto.match(/,/g) || []).length;
          expect(commaCount).toBeLessThanOrEqual(1);
        }
      }
      
      // Discount events (code 2xxx) should have values in desconto, not vencimento
      const discountEvents = month.eventos!.filter(ev => parseInt(ev.codigo) >= 2000 && parseInt(ev.codigo) < 3000);
      for (const ev of discountEvents) {
        if (ev.vencimento !== '0' && ev.desconto === '0') {
          console.warn(`WARNING: Discount event ${ev.codigo} (${ev.descricao}) has value in vencimento (${ev.vencimento}) instead of desconto`);
        }
      }
    }
  }, 60000);
});
