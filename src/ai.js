import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import OpenAI from 'openai';
import ora from 'ora';
import gradient from 'gradient-string';
import cliCursor from 'cli-cursor';
import chalk from 'chalk';
import dotenv from 'dotenv';

import { C, ICONS, MODEL, MAX_CONTEXT_CHARS } from './config.js';
import { formatLine, renderMarkdown } from './formatter.js';
import { SessionManager } from './session.js';
import { CommandHandler } from './commands.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/tax-gpt',
    'X-Title': 'Tax GPT'
  }
});

export class TaxGPT {
  constructor() {
    this.knowledgeBase = '';
    this.chunks = [];
    this.sessionManager = new SessionManager();
    this.lineWidth = process.stdout.columns || 80;
    this.commands = new CommandHandler(this.sessionManager, this.safePrompt.bind(this));
  }

  async safePrompt(questions) {
    try {
      const inquirer = (await import('inquirer')).default;
      return await inquirer.prompt(questions);
    } catch (error) {
      if (error.name === 'ExitPromptError') {
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

  async loadKnowledgeBase() {
    const spinner = ora({
      text: C.system('Loading IRS Publication 17...'),
      spinner: 'dots',
      color: 'gray'
    }).start();
    
    try {
      const kbPath = path.join(__dirname, '..', 'knowledge-base', 'tax-knowledge-base.txt');
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
"Welcome to Tax GPT! 💰\n\nI'm here to help you pay less in taxes and keep more of your hard-earned money. Whether you're filing for the first time or looking for deductions you might have missed, I'll search through IRS Publication 17 to find every legal way to reduce your tax bill.

Quick questions to get you thinking about savings:
• What's the standard deduction for 2025 and should I itemize instead?
• Am I missing any tax credits I qualify for?
• How can I reduce my taxable income before the deadline?
• What's the best filing status for my situation?

What would you like to explore? I'm ready to help you save!"

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

  printSystem(message) {
    console.log(C.system('  ' + ICONS.system + ' ' + message));
  }

  printError(message) {
    console.log('');
    console.log(C.error('  ' + ICONS.dot + ' ' + message));
    console.log('');
  }

  printInputBox() {
    const width = Math.min(process.stdout.columns - 4, 76);
    const line = '─'.repeat(width);
    console.log(C.dim('  ' + line));
  }

  async streamResponse(stream) {
    cliCursor.hide();
    process.stdout.write('\n' + C.agentLabel('  ' + ICONS.agent + ' Tax GPT') + '\n');
    
    let fullContent = '';
    const lines = [];
    let currentLine = '';
    
    // Collect and display content during streaming
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        
        // Check for newlines to complete lines
        if (content.includes('\n')) {
          const parts = (currentLine + content).split('\n');
          // All but the last part are complete lines
          for (let i = 0; i < parts.length - 1; i++) {
            const formatted = formatLine(parts[i]);
            lines.push(parts[i]);
            process.stdout.write(C.agent('  ') + formatted + '\n');
          }
          // Last part is the new current line
          currentLine = parts[parts.length - 1];
        } else {
          currentLine += content;
        }
        
        await new Promise(r => setTimeout(r, 4));
      }
    }
    
    // Handle any remaining content
    if (currentLine) {
      lines.push(currentLine);
      process.stdout.write(C.agent('  ') + formatLine(currentLine) + '\n');
    }
    
    cliCursor.show();
    
    // If content contains markdown tables, re-render with proper formatting
    if (fullContent.includes('|')) {
      // Clear previous output and re-render with markdown support
      const lineCount = lines.length + 2; // +2 for header and newline
      process.stdout.write('\x1b[' + lineCount + 'A'); // Move cursor up
      process.stdout.write('\x1b[0J'); // Clear from cursor to end
      
      const rendered = renderMarkdown(fullContent);
      process.stdout.write(C.agent(rendered));
    }
    
    return fullContent;
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
        
        const fullContent = await this.streamResponse(stream);
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
        console.log(C.user('  ' + ICONS.user + ' ' + input));
      }
      
      if (input.trim()) {
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
          
          const fullContent = await this.streamResponse(stream);
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

    // Main conversation loop
    while (true) {
      this.printInputBox();
      
      const { input: loopInput } = await this.safePrompt([{
        type: 'input',
        name: 'input',
        message: '',
        prefix: C.user('  ' + ICONS.user + ' ')
      }]);
      
      const input = loopInput;

      if (!input.trim()) continue;

      if (input.startsWith('/')) {
        await this.commands.handle(input);
        continue;
      }
      
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
        
        const fullContent = await this.streamResponse(stream);
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
