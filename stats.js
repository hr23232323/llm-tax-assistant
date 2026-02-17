#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import gradient from 'gradient-string';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = {
  label: chalk.hex('#007AFF'),
  value: chalk.hex('#FFFFFF'),
  dim: chalk.hex('#8E8E93'),
  dot: '·'
};

const stats = async () => {
  const kb = await fs.readFile(path.join(__dirname, 'knowledge-base', 'tax-knowledge-base.txt'), 'utf-8');
  const lines = kb.split('\n');
  const words = kb.split(/\s+/);
  
  console.log('\n');
  console.log(gradient(['#007AFF', '#00C7BE'])(
    '  ╔══════════════════════════════════════════════════════════╗'
  ));
  console.log(gradient(['#007AFF', '#00C7BE'])(
    '  ║                                                          ║'
  ));
  console.log(gradient(['#007AFF', '#00C7BE'])(
    '  ║            Tax GPT  ·  Knowledge Base                   ║'
  ));
  console.log(gradient(['#007AFF', '#00C7BE'])(
    '  ║                                                          ║'
  ));
  console.log(gradient(['#007AFF', '#00C7BE'])(
    '  ╚══════════════════════════════════════════════════════════╝'
  ));
  console.log('');
  
  console.log(`  ${C.dot} ${C.label('Source:')}      IRS Publication 17 (2025)`);
  console.log(`  ${C.dot} ${C.label('Title:')}       "Your Federal Income Tax For Individuals"`);
  console.log(`  ${C.dot} ${C.label('Characters:')}  ${kb.length.toLocaleString()}`);
  console.log(`  ${C.dot} ${C.label('Lines:')}       ${lines.length.toLocaleString()}`);
  console.log(`  ${C.dot} ${C.label('Words:')}       ${words.length.toLocaleString()}`);
  console.log(`  ${C.dot} ${C.label('Pages:')}       ~142 pages`);
  const model = process.env.MODEL || 'google/gemini-3-flash-preview';
  console.log(`  ${C.dot} ${C.label('Model:')}        ${model}`);
  console.log('');
  
  console.log(C.dim('  Topics: Filing requirements, Income, Deductions, Tax credits,'));
  console.log(C.dim('          Estimated taxes, 2025 tax tables'));
  console.log('');
};

stats();
