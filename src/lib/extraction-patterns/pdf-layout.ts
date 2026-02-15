/**
 * Positional PDF text extraction utilities.
 * Reconstructs visual lines and columns from pdf.js text items.
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutLine {
  y: number;
  items: TextItem[];
  text: string;
}

/**
 * Extract positioned text items from a pdf.js page.
 */
export const extractTextItems = async (page: any): Promise<TextItem[]> => {
  const content = await page.getTextContent();
  const items: TextItem[] = [];

  for (const item of content.items) {
    if (!item.str || item.str.trim() === '') continue;
    const tx = item.transform;
    items.push({
      str: item.str,
      x: tx[4],
      y: tx[5],
      width: item.width,
      height: item.height ?? Math.abs(tx[3]),
    });
  }

  return items;
};

/**
 * Group text items into visual lines by Y coordinate.
 * Items within `tolerance` pixels of Y are considered the same line.
 * Lines are sorted top-to-bottom (highest Y first in PDF coords).
 */
export const groupIntoLines = (items: TextItem[], tolerance = 3): LayoutLine[] => {
  if (items.length === 0) return [];

  // Sort by Y descending (PDF coordinate: higher Y = higher on page)
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines: LayoutLine[] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentLine.push(item);
    } else {
      // Finalize previous line
      currentLine.sort((a, b) => a.x - b.x);
      const avgY = currentLine.reduce((s, it) => s + it.y, 0) / currentLine.length;
      lines.push({
        y: avgY,
        items: currentLine,
        text: currentLine.map(it => it.str).join(' '),
      });
      currentLine = [item];
      currentY = item.y;
    }
  }

  // Last line
  currentLine.sort((a, b) => a.x - b.x);
  const avgY = currentLine.reduce((s, it) => s + it.y, 0) / currentLine.length;
  lines.push({
    y: avgY,
    items: currentLine,
    text: currentLine.map(it => it.str).join(' '),
  });

  return lines;
};

/**
 * Find the X position of a column header in a line.
 * Returns the center X of the matching item.
 */
export const findColumnX = (line: LayoutLine, label: string): number | null => {
  for (const item of line.items) {
    if (item.str.toLowerCase().includes(label.toLowerCase())) {
      return item.x + item.width / 2;
    }
  }
  return null;
};

/**
 * Determine which column a value belongs to based on its X position.
 * Returns 'vencimento' or 'desconto'.
 */
export const classifyValueColumn = (
  itemX: number,
  vencimentoX: number,
  descontoX: number,
): 'vencimento' | 'desconto' => {
  const distVenc = Math.abs(itemX - vencimentoX);
  const distDesc = Math.abs(itemX - descontoX);
  return distVenc <= distDesc ? 'vencimento' : 'desconto';
};

/**
 * Get flat text from all items (for pattern detection).
 */
export const flattenItems = (items: TextItem[]): string => {
  return items.map(it => it.str).join(' ');
};
