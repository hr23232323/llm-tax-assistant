import chalk from 'chalk';
import { C } from './config.js';

// Format a single line with color highlights
export function formatLine(text) {
  // Highlight dollar amounts: $X,XXX
  text = text.replace(/(\$[\d,]+)/g, C.highlight('$1'));
  
  // Highlight percentages: X%
  text = text.replace(/(\d+%)/g, C.highlight('$1'));
  
  // Convert **text** to bold
  text = text.replace(/\*\*(.+?)\*\*/g, (_, p1) => chalk.bold(p1));
  
  // Convert _text_ to italic
  text = text.replace(/_(.+?)_/g, (_, p1) => chalk.italic(p1));
  
  // Convert * bullet to proper bullet
  text = text.replace(/^\*\s/, C.dim('• ') + ' ');
  
  // Convert ### headers to bold + underline
  text = text.replace(/^###\s+(.+)$/, (_, p1) => chalk.bold.underline(p1));
  
  // Convert ## headers to bold
  text = text.replace(/^##\s+(.+)$/, (_, p1) => chalk.bold(p1));
  
  return text;
}

// Helper to truncate text while preserving ANSI codes
function truncateWithAnsi(text, maxLength) {
  let length = 0;
  let result = '';
  let inAnsi = false;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      inAnsi = true;
    }
    
    if (inAnsi) {
      result += text[i];
      if (text[i] === 'm') {
        inAnsi = false;
      }
    } else {
      if (length >= maxLength) break;
      result += text[i];
      length++;
    }
  }
  
  return result;
}

// Parse and render markdown tables as ASCII tables
export function renderTable(lines, startIdx) {
  const tableLines = [];
  let idx = startIdx;
  
  // Collect all table rows
  while (idx < lines.length && lines[idx].trim().startsWith('|')) {
    tableLines.push(lines[idx]);
    idx++;
  }
  
  if (tableLines.length < 2) return { rendered: null, endIdx: startIdx };
  
  // Parse rows
  const rows = tableLines.map(line => 
    line.split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0)
  ).filter(row => row.length > 0);
  
  if (rows.length < 2) return { rendered: null, endIdx: startIdx };
  
  // Remove separator row (contains only dashes and colons)
  const dataRows = rows.filter(row => !row.every(cell => /^[-:]+$/.test(cell)));
  
  if (dataRows.length === 0) return { rendered: null, endIdx: startIdx };
  
  // Calculate column widths (use plain text length, not formatted length)
  const colCount = Math.max(...dataRows.map(row => row.length));
  const colWidths = [];
  
  for (let col = 0; col < colCount; col++) {
    const maxWidth = Math.max(...dataRows.map(row => {
      const cell = row[col] || '';
      // Strip ANSI codes for length calculation
      return cell.replace(/\x1b\[[0-9;]*m/g, '').length;
    }));
    colWidths.push(Math.min(maxWidth + 2, 35)); // Max 35 chars per column
  }
  
  // Build table
  let result = '\n';
  
  // Top border
  result += '  ' + colWidths.map(w => '─'.repeat(w)).join('─┬─') + '\n';
  
  // Header row
  const headerRow = dataRows[0];
  result += '  │' + headerRow.map((cell, i) => {
    const plainCell = cell.replace(/\x1b\[[0-9;]*m/g, '');
    const truncated = plainCell.slice(0, colWidths[i] - 2);
    const padded = ' ' + truncated.padEnd(colWidths[i] - 2) + ' ';
    return chalk.bold(padded);
  }).join('│') + '│\n';
  
  // Separator
  result += '  ' + colWidths.map(w => '─'.repeat(w)).join('─┼─') + '\n';
  
  // Data rows
  for (let i = 1; i < dataRows.length; i++) {
    result += '  │' + dataRows[i].map((cell, col) => {
      // Format the cell content (for colors)
      const formatted = formatLine(cell);
      const plainText = formatted.replace(/\x1b\[[0-9;]*m/g, '');
      const visibleLength = plainText.length;
      const targetWidth = colWidths[col] - 2;
      
      // Truncate while preserving ANSI codes
      const truncated = truncateWithAnsi(formatted, targetWidth);
      
      // Calculate padding needed
      const paddingNeeded = targetWidth - Math.min(visibleLength, targetWidth);
      const padding = paddingNeeded > 0 ? ' '.repeat(paddingNeeded) : '';
      
      return ' ' + truncated + padding + ' ';
    }).join('│') + '│\n';
  }
  
  // Bottom border
  result += '  ' + colWidths.map(w => '─'.repeat(w)).join('─┴─') + '\n';
  
  return { rendered: result, endIdx: idx };
}

// Render markdown content with full formatting
export function renderMarkdown(content) {
  const lines = content.split('\n');
  let result = '';
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check for table
    if (line.trim().startsWith('|')) {
      const { rendered, endIdx } = renderTable(lines, i);
      if (rendered) {
        result += rendered;
        i = endIdx;
        continue;
      }
    }
    
    // Format regular line
    result += formatLine(line) + '\n';
    i++;
  }
  
  return result;
}

// Format content for streaming output (handles partial content)
export function formatStreamChunk(chunk, currentLine) {
  currentLine += chunk;
  
  // Check if we have a complete line
  if (currentLine.includes('\n')) {
    const lines = currentLine.split('\n');
    const completeLines = lines.slice(0, -1);
    currentLine = lines[lines.length - 1];
    
    return {
      output: completeLines.map(l => '  ' + formatLine(l)).join('\n') + '\n',
      currentLine
    };
  }
  
  return { output: '', currentLine };
}

// Render a horizontal rule
export function renderHorizontalRule() {
  const width = Math.min(process.stdout.columns - 4, 76);
  return '  ' + C.dim('─'.repeat(width)) + '\n';
}

// Render a highlighted box (for important info)
export function renderInfoBox(title, content) {
  const lines = content.split('\n');
  const maxWidth = Math.max(title.length, ...lines.map(l => l.length)) + 4;
  
  let result = '\n';
  result += '  ┌' + '─'.repeat(maxWidth) + '┐\n';
  result += '  │ ' + chalk.bold(title).padEnd(maxWidth - 1) + '│\n';
  result += '  ├' + '─'.repeat(maxWidth) + '┤\n';
  
  lines.forEach(line => {
    result += '  │ ' + formatLine(line).padEnd(maxWidth - 1) + '│\n';
  });
  
  result += '  └' + '─'.repeat(maxWidth) + '┘\n';
  
  return result;
}
