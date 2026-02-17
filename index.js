#!/usr/bin/env node

import readline from 'readline';
import dotenv from 'dotenv';
import { C } from './src/config.js';
import { TaxGPT } from './src/ai.js';

dotenv.config();

async function main() {
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
    console.error('');
    console.error(C.error('  Error: OPENROUTER_API_KEY not set'));
    console.error('');
    console.error(C.dim('  1. Copy .env.example to .env'));
    console.error(C.dim('  2. Add your API key from https://openrouter.ai/keys'));
    console.error('');
    process.exit(1);
  }

  const taxGPT = new TaxGPT();
  
  // Handle graceful shutdown
  let shutdownInProgress = false;
  
  const gracefulShutdown = async (signal) => {
    if (shutdownInProgress) {
      console.log('');
      console.log(C.error('  Forced exit'));
      process.exit(1);
    }
    
    shutdownInProgress = true;
    console.log('');
    console.log(C.system('  Saving session and exiting...'));
    
    try {
      await taxGPT.sessionManager.saveSession();
    } catch (e) {
      // Ignore save errors during shutdown
    }
    
    console.log(C.highlight('  ✓ Goodbye!'));
    console.log('');
    process.exit(0);
  };
  
  // Handle Ctrl+C (SIGINT) - always works
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle other termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Handle Escape key detection for double-press exit
  let escapeCount = 0;
  let escapeTimer = null;
  
  const handleKeypress = (str, key) => {
    if (key && key.name === 'escape') {
      escapeCount++;
      
      if (escapeCount === 1) {
        console.log('');
        console.log(C.dim('  Press ESC again to quit (or use Ctrl+C)'));
        escapeTimer = setTimeout(() => {
          escapeCount = 0;
        }, 2000);
      } else if (escapeCount >= 2) {
        clearTimeout(escapeTimer);
        escapeTimer = null;
        escapeCount = 0;
        gracefulShutdown('ESC');
      }
    } else if (key && (key.name === 'c' && key.ctrl)) {
      gracefulShutdown('SIGINT');
    } else {
      escapeCount = 0;
      if (escapeTimer) {
        clearTimeout(escapeTimer);
        escapeTimer = null;
      }
    }
  };
  
  // Set up keypress handling
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', handleKeypress);
  }
  
  try {
    await taxGPT.loadKnowledgeBase();
    await taxGPT.interactiveMode();
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      await gracefulShutdown('SIGINT');
    } else {
      throw error;
    }
  }
}

main().catch(async (error) => {
  if (error.name === 'ExitPromptError') {
    console.log('');
    console.log(C.system('  Goodbye!'));
    console.log('');
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});
