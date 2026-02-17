#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import readline from 'readline';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import gradient from 'gradient-string';
import cliCursor from 'cli-cursor';
import boxen from 'boxen';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/tax-gpt',
    'X-Title': 'Tax GPT'
  }
});

const MODEL = process.env.MODEL || 'google/gemini-3-flash-preview';
const MAX_CONTEXT_CHARS = 120000;
const MAX_HISTORY_TURNS = 10;
const STREAM_DELAY = 8;

const CONFIG_DIR = path.join(os.homedir(), '.tax-gpt');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

const C = {
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

const ICONS = {
  user: '❯',
  agent: '●',
  system: '•',
  arrow: '→',
  check: '✓',
  dot: '·'
};

// Format a single line with color highlights
function formatLine(text) {
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

class SessionManager {
  constructor() {
    this.currentSession = null;
    this.sessions = [];
  }

  async init() {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    await this.loadSessionsList();
  }

  async loadSessionsList() {
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      this.sessions = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
        .sort((a, b) => b.localeCompare(a));
    } catch {
      this.sessions = [];
    }
  }

  async createSession(name = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sessionName = name || `session-${timestamp}`;
    
    this.currentSession = {
      id: sessionName,
      name: sessionName,
      createdAt: new Date().toISOString(),
      messages: [],
      metadata: { model: MODEL, totalTurns: 0 }
    };
    
    await this.saveSession();
    return this.currentSession;
  }

  async loadSession(sessionId) {
    try {
      const data = await fs.readFile(path.join(SESSIONS_DIR, `${sessionId}.json`), 'utf-8');
      this.currentSession = JSON.parse(data);
      return this.currentSession;
    } catch {
      return null;
    }
  }

  async saveSession() {
    if (!this.currentSession) return;
    await fs.writeFile(
      path.join(SESSIONS_DIR, `${this.currentSession.id}.json`),
      JSON.stringify(this.currentSession, null, 2)
    );
  }

  async deleteSession(sessionId) {
    try {
      await fs.unlink(path.join(SESSIONS_DIR, `${sessionId}.json`));
      await this.loadSessionsList();
      return true;
    } catch {
      return false;
    }
  }

  addMessage(role, content) {
    if (!this.currentSession) return;
    this.currentSession.messages.push({ role, content, timestamp: new Date().toISOString() });
    this.currentSession.metadata.totalTurns = this.currentSession.messages.filter(m => m.role === 'user').length;
    if (this.currentSession.messages.length > MAX_HISTORY_TURNS * 2) {
      this.currentSession.messages = this.currentSession.messages.slice(-MAX_HISTORY_TURNS * 2);
    }
    this.saveSession();
  }

  getRecentMessages(count = 5) {
    if (!this.currentSession) return [];
    return this.currentSession.messages.slice(-count * 2);
  }
}

class TaxGPT {
  constructor() {
    this.knowledgeBase = '';
    this.chunks = [];
    this.sessionManager = new SessionManager();
    this.lineWidth = process.stdout.columns || 80;
  }

  async loadKnowledgeBase() {
    const spinner = ora({
      text: C.system('Loading IRS Publication 17...'),
      spinner: 'dots',
      color: 'gray'
    }).start();
    
    try {
      const kbPath = path.join(__dirname, 'knowledge-base', 'tax-knowledge-base.txt');
      this.knowledgeBase = await fs.readFile(kbPath, 'utf-8');
      this.chunks = this.createChunks(this.knowledgeBase, 3000);
      spinner.succeed(C.system(`Loaded ${this.chunks.length.toLocaleString()} chunks`));
    } catch (error) {
      spinner.fail(C.error('Failed to load knowledge base'));
      throw error;
    }
  }

  createChunks(text, chunkSize) {
    const chunks = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = '';
    
    for (const para of paragraphs) {
      if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk += '\n\n' + para;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  }

  findRelevantChunks(query, maxChunks = 5) {
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 3);
    
    const scored = this.chunks.map((chunk, idx) => {
      const chunkLower = chunk.toLowerCase();
      let score = 0;
      if (chunkLower.includes(queryLower)) score += 10;
      for (const kw of keywords) {
        if (chunkLower.includes(kw)) score += 2;
      }
      if (chunk.includes('Table') || chunk.includes('$')) score += 1;
      return { chunk, score, idx };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(item => item.chunk);
  }

  buildSystemPrompt(context, history, isFirstMessage = false) {
    const basePrompt = `You are Tax GPT, a tax savings assistant powered by IRS Publication 17 (2025).

YOUR MISSION:
Help users legally minimize their tax liability and keep more of their money. Every interaction should move toward identifying deductions, credits, and strategies they might be missing.

CORE PRINCIPLES:
1. TAX SAVINGS FIRST - Always look for opportunities to reduce taxable income or increase credits
2. PROACTIVE GUIDANCE - Don't just answer questions; suggest related savings opportunities
3. SPECIFICITY WINS - Give exact dollar amounts, income thresholds, and form numbers
4. CLARIFY TO SAVE - Ask about their situation to find credits/deductions they qualify for

APPROACH:
- Frame answers around "Here's how this affects your bottom line..."
- After answering, suggest 1-2 related tax savings opportunities
- Ask: "Do you also [qualify for X / have Y situation]?" to uncover more savings
- Always mention: "Many people miss this deduction..." when relevant

RULES:
- Answer using ONLY the IRS Publication 17 context provided
- Be conversational and enthusiastic about finding savings
- Use bullet points for deductions/credits lists
- Cite specific sections, tables, and dollar thresholds
- Format: $X,XXX for money, percentages as X%
- Never suggest illegal tax evasion - only legal avoidance strategies

${isFirstMessage ? `OPENING GREETING (use this exactly or adapt slightly):
"Welcome to Tax GPT! 💰\n\nI'm here to help you pay less in taxes and keep more of your hard-earned money. Whether you're filing for the first time or looking for deductions you might have missed, I'll search through IRS Publication 17 to find every legal way to reduce your tax bill.\n\nQuick questions to get you thinking about savings:\n• What's the standard deduction for 2025 and should I itemize instead?
• Am I missing any tax credits I qualify for?
• How can I reduce my taxable income before the deadline?
• What's the best filing status for my situation?
\nWhat would you like to explore? I'm ready to help you save!"

` : ''}IRS PUBLICATION 17 (2025) CONTEXT:
${context}

${history ? `RECENT CONVERSATION:\n${history}` : ''}`;
    return basePrompt;
  }

  async askQuestion(question) {
    const relevantChunks = this.findRelevantChunks(question);
    const context = relevantChunks.join('\n---\n');
    const truncatedContext = context.length > MAX_CONTEXT_CHARS 
      ? context.substring(0, MAX_CONTEXT_CHARS) + '...'
      : context;

    const recentHistory = this.sessionManager.getRecentMessages(3);
    const historyContext = recentHistory.length > 0 
      ? recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`).join('\n')
      : '';
    
    const isFirstMessage = recentHistory.length === 0;

    const messages = [
      {
        role: 'system',
        content: this.buildSystemPrompt(truncatedContext, historyContext, isFirstMessage)
      },
      ...recentHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: question }
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: messages,
        temperature: 0.2,
        max_tokens: 1500,
        stream: true
      });

      return completion;
    } catch (error) {
      if (error.status === 401) {
        throw new Error('Invalid API key. Check OPENROUTER_API_KEY in .env');
      }
      throw error;
    }
  }

  async streamResponse(stream) {
    cliCursor.hide();
    
    // Print agent label
    process.stdout.write('\n' + C.agentLabel('  ' + ICONS.agent + ' Tax GPT\n'));
    process.stdout.write(C.agent('  '));
    
    let fullContent = '';
    let currentLineLength = 2;
    const maxWidth = Math.min(this.lineWidth - 4, 100);
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        
        // Simple word streaming without markdown processing
        const words = content.split(/(\s+)/);
        
        for (const word of words) {
          if (word.includes('\n')) {
            const parts = word.split('\n');
            parts.forEach((part, idx) => {
              if (idx === 0) {
                process.stdout.write(C.agent(part));
                currentLineLength += part.length;
              } else {
                process.stdout.write('\n  ');
                process.stdout.write(C.agent(part));
                currentLineLength = 2 + part.length;
              }
            });
          } else {
            if (currentLineLength + word.length > maxWidth && word.trim()) {
              process.stdout.write('\n  ');
              currentLineLength = 2;
            }
            
            process.stdout.write(C.agent(word));
            currentLineLength += word.length;
          }
          
          if (STREAM_DELAY > 0) {
            await new Promise(r => setTimeout(r, STREAM_DELAY));
          }
        }
      }
    }
    
    process.stdout.write('\n');
    cliCursor.show();
    
    return fullContent;
  }

  printWelcome() {
    console.log('\n');
    console.log(gradient(['#007AFF', '#00C7BE'])(
      '  ╔══════════════════════════════════════════════════════════╗'
    ));
    console.log(gradient(['#007AFF', '#00C7BE'])(
      '  ║                                                          ║'
    ));
    console.log(gradient(['#007AFF', '#00C7BE'])(
      '  ║              Tax GPT  ·  Tax Assistant                   ║'
    ));
    console.log(gradient(['#007AFF', '#00C7BE'])(
      '  ║                                                          ║'
    ));
    console.log(gradient(['#007AFF', '#00C7BE'])(
      '  ╚══════════════════════════════════════════════════════════╝'
    ));
    console.log('\n');
    console.log(C.dim('  IRS Publication 17 (2025)  ·  Gemini 3 Flash  ·  /help'));
    console.log('');
  }

  printUserMessage(text) {
    console.log(C.user('  ' + ICONS.user + ' ' + text));
  }

  printError(message) {
    console.log('');
    console.log(C.error('  ' + ICONS.dot + ' ' + message));
    console.log('');
  }

  printSystem(message) {
    console.log(C.system('  ' + ICONS.system + ' ' + message));
  }

  printInputBox() {
    const width = Math.min(process.stdout.columns - 4, 76);
    const line = '─'.repeat(width);
    console.log(C.dim('  ' + line));
  }

  async handleCommand(input) {
    const command = input.trim().toLowerCase();

    switch (command) {
      case '/help':
        console.log('');
        console.log(boxen(
          C.agentLabel('Commands') + '\n\n' +
          C.highlight('/new') + '      Start new session\n' +
          C.highlight('/sessions') + ' List all sessions\n' +
          C.highlight('/switch') + '   Switch to another session\n' +
          C.highlight('/clear') + '    Clear current history\n' +
          C.highlight('/history') + '  Show recent messages\n' +
          C.highlight('/export') + '   Export to markdown\n' +
          C.highlight('/delete') + '   Delete a session\n' +
          C.highlight('/quit') + '     Exit',
          { padding: 1, margin: 1, borderStyle: 'round', borderColor: '#48484A' }
        ));
        return true;

      case '/quit':
      case '/exit':
        console.log('');
        this.printSystem('Saving session...');
        await this.sessionManager.saveSession();
        console.log('');
        process.exit(0);

      case '/new':
        const { sessionName } = await this.safePrompt([{
          type: 'input',
          name: 'sessionName',
          message: C.system('Session name (optional):'),
          default: ''
        }]);
        await this.sessionManager.createSession(sessionName || null);
        console.log('');
        this.printSystem(`New session: ${this.sessionManager.currentSession.name}`);
        console.log('');
        return true;

      case '/sessions':
        await this.sessionManager.loadSessionsList();
        if (this.sessionManager.sessions.length === 0) {
          this.printSystem('No saved sessions');
          console.log('');
          return true;
        }
        
        console.log('');
        console.log(C.agentLabel('  Sessions:'));
        console.log(C.dim('  ' + '─'.repeat(40)));
        this.sessionManager.sessions.forEach((id) => {
          const isCurrent = id === this.sessionManager.currentSession?.id;
          const prefix = isCurrent ? C.highlight(ICONS.check + ' ') : '  ';
          console.log(prefix + (isCurrent ? chalk.white(id) : C.dim(id)));
        });
        console.log('');
        return true;

      case '/switch':
        await this.sessionManager.loadSessionsList();
        if (this.sessionManager.sessions.length === 0) {
          this.printSystem('No sessions to switch to');
          console.log('');
          return true;
        }
        
        const { selected } = await this.safePrompt([{
          type: 'list',
          name: 'selected',
          message: C.system('Select session:'),
          choices: this.sessionManager.sessions
            .filter(id => id !== this.sessionManager.currentSession?.id)
            .map(id => ({ name: id, value: id }))
        }]);
        
        await this.sessionManager.loadSession(selected);
        console.log('');
        this.printSystem(`Switched to: ${selected}`);
        console.log('');
        return true;

      case '/clear':
        if (this.sessionManager.currentSession) {
          this.sessionManager.currentSession.messages = [];
          await this.sessionManager.saveSession();
          this.printSystem('History cleared');
          console.log('');
        }
        return true;

      case '/history':
        if (!this.sessionManager.currentSession?.messages.length) {
          this.printSystem('No history in current session');
          console.log('');
          return true;
        }
        
        console.log('');
        console.log(C.agentLabel('  History:'));
        console.log(C.dim('  ' + '─'.repeat(40)));
        this.sessionManager.currentSession.messages.forEach(m => {
          const icon = m.role === 'user' ? C.user(ICONS.user) : C.agentLabel(ICONS.agent);
          const preview = m.content.substring(0, 60) + (m.content.length > 60 ? '...' : '');
          console.log(`  ${icon} ${C.dim(preview)}`);
        });
        console.log('');
        return true;

      case '/export':
        if (!this.sessionManager.currentSession) {
          this.printError('No active session');
          return true;
        }
        const exportPath = path.join(process.cwd(), `${this.sessionManager.currentSession.id}.md`);
        const exportContent = `# ${this.sessionManager.currentSession.name}\n\n` +
          this.sessionManager.currentSession.messages
            .map(m => `## ${m.role === 'user' ? 'Q' : 'A'}\n\n${m.content}\n`)
            .join('\n---\n\n');
        await fs.writeFile(exportPath, exportContent);
        console.log('');
        this.printSystem(`Exported: ${exportPath}`);
        console.log('');
        return true;

      case '/delete':
        await this.sessionManager.loadSessionsList();
        const deletable = this.sessionManager.sessions.filter(id => id !== this.sessionManager.currentSession?.id);
        if (deletable.length === 0) {
          this.printSystem('No other sessions to delete');
          console.log('');
          return true;
        }
        
        const { toDelete } = await this.safePrompt([{
          type: 'list',
          name: 'toDelete',
          message: C.system('Delete session:'),
          choices: deletable.map(id => ({ name: id, value: id }))
        }]);
        
        await this.sessionManager.deleteSession(toDelete);
        this.printSystem(`Deleted: ${toDelete}`);
        console.log('');
        return true;

      default:
        if (command.startsWith('/')) {
          this.printError(`Unknown command: ${command}`);
          this.printSystem('Type /help for commands');
          console.log('');
          return true;
        }
        return false;
    }
  }

  async safePrompt(questions) {
    try {
      return await inquirer.prompt(questions);
    } catch (error) {
      if (error.name === 'ExitPromptError') {
        // User pressed Ctrl+C - exit gracefully
        console.log('');
        console.log(C.system('  Saving session and exiting...'));
        await this.sessionManager.saveSession();
        console.log(C.highlight('  ✓ Goodbye!'));
        console.log('');
        process.exit(0);
      }
      throw error;
    }
  }

  async interactiveMode() {
    this.printWelcome();
    await this.sessionManager.init();

    if (!this.sessionManager.currentSession) {
      await this.sessionManager.createSession();
    }

    this.printSystem(`Session: ${this.sessionManager.currentSession.name}`);
    console.log('');

    // Auto-trigger welcome greeting on first load if no messages yet
    const isNewSession = this.sessionManager.currentSession.messages.length === 0;
    if (isNewSession) {
      const spinner = ora({
        text: C.dim('Preparing your tax savings guide...'),
        spinner: 'dots',
        color: 'gray'
      }).start();

      try {
        const stream = await this.askQuestion('Introduce yourself and suggest some tax savings questions I could ask');
        spinner.stop();
        
        // Stream welcome response
        cliCursor.hide();
        process.stdout.write('\n' + C.agentLabel('  ' + ICONS.agent + ' Tax GPT') + '\n');
        
        let fullContent = '';
        let currentLine = '';
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            
            const tokens = content.split(/(\s+)/);
            
            for (const token of tokens) {
              if (token.includes('\n')) {
                const parts = token.split('\n');
                parts.forEach((part, idx) => {
                  if (idx === 0) {
                    currentLine += part;
                  } else {
                    process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
                    currentLine = part;
                  }
                });
              } else {
                currentLine += token;
              }
            }
            
            await new Promise(r => setTimeout(r, 4));
          }
        }
        
        if (currentLine) {
          process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
        }
        
        cliCursor.show();
        this.sessionManager.addMessage('assistant', fullContent);
        
        console.log('');
      } catch (error) {
        spinner.stop();
        this.printError('Failed to load welcome message: ' + error.message);
      }
      
      // Show starter questions as selectable list
      const exampleQuestions = [
        { name: "1. What's the standard deduction for 2025 and should I itemize instead?", value: "What's the standard deduction for 2025 and should I itemize instead?" },
        { name: "2. Am I missing any tax credits I qualify for?", value: "Am I missing any tax credits I qualify for?" },
        { name: "3. How can I reduce my taxable income before the deadline?", value: "How can I reduce my taxable income before the deadline?" },
        { name: "4. What's the best filing status for my situation?", value: "What's the best filing status for my situation?" },
        { name: "5. ✏️  OR type whatever you want!", value: "__CUSTOM__" }
      ];
      
      console.log(C.dim('  ─────────────────────────────────────────'));
      console.log(C.dim('  Select a number or type any question:'));
      const { selectedQuestion } = await this.safePrompt([{
        type: 'list',
        name: 'selectedQuestion',
        message: C.system('Get started:'),
        choices: exampleQuestions,
        pageSize: 10
      }]);
      
      let input;
      if (selectedQuestion === '__CUSTOM__') {
        const { customInput } = await this.safePrompt([{
          type: 'input',
          name: 'customInput',
          message: '',
          prefix: C.user('  ' + ICONS.user + ' ')
        }]);
        input = customInput;
      } else {
        input = selectedQuestion;
        // Show the selected question as user input
        console.log(C.user('  ' + ICONS.user + ' ' + input));
      }
      
      if (!input.trim()) {
        // Fall through to normal loop if nothing selected
      } else {
        console.log('');
        
        const spinner2 = ora({
          text: C.dim('Searching for tax savings...'),
          spinner: 'dots',
          color: 'gray'
        }).start();

        try {
          this.sessionManager.addMessage('user', input);
          
          spinner2.text = C.dim('Analyzing your situation...');
          const stream = await this.askQuestion(input);
          
          spinner2.stop();
          
          // Stream response with color highlighting
          cliCursor.hide();
          process.stdout.write('\n' + C.agentLabel('  ' + ICONS.agent + ' Tax GPT') + '\n');
          
          let fullContent = '';
          let currentLine = '';
          
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              
              const tokens = content.split(/(\s+)/);
              
              for (const token of tokens) {
                if (token.includes('\n')) {
                  const parts = token.split('\n');
                  parts.forEach((part, idx) => {
                    if (idx === 0) {
                      currentLine += part;
                    } else {
                      process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
                      currentLine = part;
                    }
                  });
                } else {
                  currentLine += token;
                }
              }
              
              await new Promise(r => setTimeout(r, 4));
            }
          }
          
          if (currentLine) {
            process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
          }
          
          cliCursor.show();
          this.sessionManager.addMessage('assistant', fullContent);
          
          console.log('');
          console.log(C.dim('  ' + ICONS.dot + ' ' + chalk.italic('Not professional tax advice')));
          console.log('');
        } catch (error) {
          spinner2.stop();
          this.printError(error.message);
        }
      }
    }

    while (true) {
      this.printInputBox();
      
      const { input: loopInput } = await this.safePrompt([{
        type: 'input',
        name: 'input',
        message: '',
        prefix: C.user('  ' + ICONS.user + ' ')
      }]);
      
      input = loopInput;

      if (!input.trim()) continue;

      if (input.startsWith('/')) {
        await this.handleCommand(input);
        continue;
      }
      
      // User message already shown in input, just add spacing
      console.log('');

      const spinner = ora({
        text: C.dim('Searching...'),
        spinner: 'dots',
        color: 'gray'
      }).start();

      try {
        this.sessionManager.addMessage('user', input);
        
        spinner.text = C.dim('Analyzing...');
        const stream = await this.askQuestion(input);
        
        spinner.stop();
        
        // Stream response with color highlighting
        cliCursor.hide();
        process.stdout.write('\n' + C.agentLabel('  ' + ICONS.agent + ' Tax GPT') + '\n');
        
        let fullContent = '';
        let currentLine = '';
        
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            
            // Process content word by word for color highlighting
            const tokens = content.split(/(\s+)/);
            
            for (const token of tokens) {
              if (token.includes('\n')) {
                // Handle newlines
                const parts = token.split('\n');
                parts.forEach((part, idx) => {
                  if (idx === 0) {
                    currentLine += part;
                  } else {
                    // Print completed line
                    process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
                    currentLine = part;
                  }
                });
              } else {
                currentLine += token;
              }
            }
            
            await new Promise(r => setTimeout(r, 4));
          }
        }
        
        // Print final line
        if (currentLine) {
          process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
        }
        
        cliCursor.show();
        this.sessionManager.addMessage('assistant', fullContent);
        
        console.log('');
        console.log(C.dim('  ' + ICONS.dot + ' ' + chalk.italic('Not professional tax advice')));
        console.log('');
      } catch (error) {
        spinner.stop();
        this.printError(error.message);
      }
    }
  }
}

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
      // Ctrl+C is handled by SIGINT above, but this ensures it works during prompts too
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
      // User pressed Ctrl+C during a prompt
      await gracefulShutdown('SIGINT');
    } else {
      throw error;
    }
  }
}

main().catch(async (error) => {
  if (error.name === 'ExitPromptError') {
    // Graceful exit on Ctrl+C during prompt
    console.log('');
    console.log(C.system('  Goodbye!'));
    console.log('');
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});
