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
  
  return text;
}
