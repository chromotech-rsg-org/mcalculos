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
 * Automatically detects 90° rotated pages and swaps coordinates
 * so that groupIntoLines works correctly for rotated layouts.
 */
export const extractTextItems = async (page: any): Promise<TextItem[]> => {
  const content = await page.getTextContent();

  // First pass: collect raw data and detect rotation
  interface RawItem { str: string; tx: number[]; width: number; height: number; }
  const rawItems: RawItem[] = [];

  for (const item of content.items) {
    if (!item.str || item.str.trim() === '') continue;
    const tx = item.transform;
    rawItems.push({
      str: item.str,
      tx: [...tx],
      width: item.width,
      height: item.height ?? Math.abs(tx[3]),
    });
  }

  if (rawItems.length === 0) return [];

  // Detect 90° rotation: normal text has |tx[0]| >> |tx[1]|,
  // rotated 90° has |tx[0]| << |tx[1]|
  let rotatedCount = 0;
  for (const item of rawItems) {
    if (Math.abs(item.tx[0]) < Math.abs(item.tx[1]) * 0.5) rotatedCount++;
  }
  const isRotated = rotatedCount > rawItems.length * 0.5;

  if (!isRotated) {
    // Normal (non-rotated) page
    return rawItems.map(item => ({
      str: item.str,
      x: item.tx[4],
      y: item.tx[5],
      width: item.width,
      height: item.height,
    }));
  }

  // Rotated page: swap X↔Y coordinates
  // PDF X → visual Y (vertical row), PDF Y → visual X (horizontal column)
  // We need to flip Y so that items at the top of the visual page get highest new_y
  let maxX = 0;
  for (const item of rawItems) {
    const itemBottom = item.tx[4] + item.width; // approximate extent in X direction
    if (itemBottom > maxX) maxX = itemBottom;
  }

  return rawItems.map(item => ({
    str: item.str,
    x: item.tx[5],                    // visual X = PDF Y
    y: maxX - item.tx[4],             // visual Y = maxX - PDF X (flip for top-to-bottom)
    width: item.width,                // text advance (along reading direction)
    height: Math.abs(item.tx[1]),     // font size from rotation component
  }));
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
