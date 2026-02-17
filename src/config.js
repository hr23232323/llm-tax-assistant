import os from 'os';
import path from 'path';
import chalk from 'chalk';

// Configuration Constants
export const MODEL = process.env.MODEL || 'google/gemini-3-flash-preview';
export const MAX_CONTEXT_CHARS = 120000;
export const MAX_HISTORY_TURNS = 10;
export const STREAM_DELAY = 8;

// Directory Paths
export const CONFIG_DIR = path.join(os.homedir(), '.tax-gpt');
export const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

// Color Scheme
export const C = {
  user: chalk.hex('#FF9500'),
  agent: chalk.hex('#FFFFFF'),
  agentLabel: chalk.hex('#007AFF'),
  system: chalk.hex('#8E8E93'),
  dim: chalk.hex('#636366'),
  border: chalk.hex('#48484A'),
  highlight: chalk.hex('#34C759'),
  error: chalk.hex('#FF3B30'),
  warning: chalk.hex('#FFCC00'),
};

// Icons
export const ICONS = {
  user: '❯',
  agent: '●',
  system: '•',
  arrow: '→',
  check: '✓',
  dot: '·'
};
