// @ts-check

import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * Convert HTML table to properly aligned monospaced text
 * @param {string} tableHtml - HTML table string
 * @returns {string} - Formatted monospaced text
 */
function convertTableToPreformatted(tableHtml) {
  // Extract rows
  const rows = [];
  const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  
  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = rowMatch.match(/<(th|td)[^>]*>[\s\S]*?<\/(th|td)>/gi) || [];
    
    for (const cellMatch of cellMatches) {
      // Extract text content, removing HTML tags
      let cellText = cellMatch
        .replace(/<[^>]*>/g, '') // Remove all HTML tags
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      
      cells.push(cellText);
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  if (rows.length === 0) return '';
  
  // Calculate column widths
  const columnWidths = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      columnWidths[i] = Math.max(columnWidths[i] || 0, row[i].length);
    }
  }
  
  // Format rows with proper spacing
  const formattedRows = rows.map((row, rowIndex) => {
    const paddedCells = row.map((cell, cellIndex) => {
      return cell.padEnd(columnWidths[cellIndex] || 0);
    });
    
    const formattedRow = '| ' + paddedCells.join(' | ') + ' |';
    
    // Add separator line after header row (first row)
    if (rowIndex === 0 && rows.length > 1) {
      const separator = '|' + columnWidths.map(width => '-'.repeat(width + 2)).join('|') + '|';
      return formattedRow + '\n' + separator;
    }
    
    return formattedRow;
  });
  
  return formattedRows.join('\n');
}

/**
 * HTML in Asana is extremely limited. If a rich text string contains any <p> or <br> tags,
 * the request will fail.
 *
 * Only H1 and H2 tags are supported, so we map h1-h3 => h1 and h4-h6 => h2
 *
 * @link https://forum.asana.com/t/changes-are-coming-to-rich-text-html-notes-and-html-text-in-asana/113434/9
 *
 * @param {string} rawMd Markdown source
 * @returns {string} Rendered HTML string, with Asana-unsafe tags removed
 */
export function renderMarkdown(rawMd) {
  const rendered = micromark(rawMd, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });

  const cleaned = rendered
    .replace(/<\/p>\s*/g, "\n\n")
    .replace(/<br>\s*/g, "\n")
    .replace(/<p>/g, "")
    .replace(/<(\/?)h[123]>\s*/g, "<$1h1>")
    .replace(/<(\/?)h[456]>\s*/g, "<$1h2>")
    .replace(/<input\s+type="checkbox"\s+disabled=""\s+checked=""\s*\/>/g, "[x]") // Replace checked checkboxes
    .replace(/<input\s+type="checkbox"\s+disabled=""\s*\/>/g, "[ ]") // Replace unchecked checkboxes
    .replace(/href="((?!https?:\/\/)[^"]+)"/g, 'href="https://$1"') // Add https:// to links without protocol
    // Convert tables to properly formatted preformatted text
    .replace(/<table[^>]*>[\s\S]*?<\/table>/gi, (tableMatch) => {
      const formattedTable = convertTableToPreformatted(tableMatch);
      return formattedTable ? `<pre>${formattedTable}</pre>` : '';
    })
    // Convert <pre><code> to just <pre> (Asana doesn't support nested code in pre)
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
      // Remove trailing newline if present
      const trimmedCode = code.replace(/\n$/, '');
      return `<pre>${trimmedCode}</pre>`;
    })
    // Clean up extra newlines inside blockquotes
    .replace(/<blockquote>\n/g, '<blockquote>')
    .replace(/\n<\/blockquote>/g, '</blockquote>')
    .trim();

  // Final cleanup pass
  const final = `<body>${cleaned}</body>`
    // Remove newlines after <hr> tags
    .replace(/<hr>\n+/g, '<hr>');

  return final;
}