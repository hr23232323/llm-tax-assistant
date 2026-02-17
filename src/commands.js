import fs from 'fs/promises';
import path from 'path';
import boxen from 'boxen';
import chalk from 'chalk';
import { C, ICONS } from './config.js';

export class CommandHandler {
  constructor(sessionManager, safePrompt) {
    this.sessionManager = sessionManager;
    this.safePrompt = safePrompt;
  }

  async handle(input) {
    const command = input.trim().toLowerCase();

    switch (command) {
      case '/help':
        return this.showHelp();

      case '/quit':
      case '/exit':
        return await this.quit();

      case '/new':
        return await this.newSession();

      case '/sessions':
        return this.listSessions();

      case '/switch':
        return await this.switchSession();

      case '/clear':
        return this.clearHistory();

      case '/history':
        return this.showHistory();

      case '/export':
        return await this.exportSession();

      case '/delete':
        return await this.deleteSession();

      default:
        if (command.startsWith('/')) {
          console.log('');
          console.log(C.error('  ' + ICONS.dot + ' ' + `Unknown command: ${command}`));
          console.log(C.system('  ' + ICONS.system + ' Type /help for commands'));
          console.log('');
          return true;
        }
        return false;
    }
  }

  showHelp() {
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
  }

  async quit() {
    console.log('');
    console.log(C.system('  ' + ICONS.system + ' Saving session...'));
    await this.sessionManager.saveSession();
    console.log('');
    process.exit(0);
  }

  async newSession() {
    const { sessionName } = await this.safePrompt([{
      type: 'input',
      name: 'sessionName',
      message: C.system('Session name (optional):'),
      default: ''
    }]);
    await this.sessionManager.createSession(sessionName || null);
    console.log('');
    console.log(C.system('  ' + ICONS.system + ' ' + `New session: ${this.sessionManager.currentSession.name}`));
    console.log('');
    return true;
  }

  async listSessions() {
    await this.sessionManager.loadSessionsList();
    if (this.sessionManager.sessions.length === 0) {
      console.log(C.system('  ' + ICONS.system + ' No saved sessions'));
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
  }

  async switchSession() {
    await this.sessionManager.loadSessionsList();
    if (this.sessionManager.sessions.length === 0) {
      console.log(C.system('  ' + ICONS.system + ' No sessions to switch to'));
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
    console.log(C.system('  ' + ICONS.system + ' ' + `Switched to: ${selected}`));
    console.log('');
    return true;
  }

  clearHistory() {
    if (this.sessionManager.currentSession) {
      this.sessionManager.currentSession.messages = [];
      this.sessionManager.saveSession();
      console.log(C.system('  ' + ICONS.system + ' History cleared'));
      console.log('');
    }
    return true;
  }

  showHistory() {
    if (!this.sessionManager.currentSession?.messages.length) {
      console.log(C.system('  ' + ICONS.system + ' No history in current session'));
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
  }

  async exportSession() {
    if (!this.sessionManager.currentSession) {
      console.log(C.error('  ' + ICONS.dot + ' No active session'));
      return true;
    }
    const exportPath = path.join(process.cwd(), `${this.sessionManager.currentSession.id}.md`);
    const exportContent = `# ${this.sessionManager.currentSession.name}\n\n` +
      this.sessionManager.currentSession.messages
        .map(m => `## ${m.role === 'user' ? 'Q' : 'A'}\n\n${m.content}\n`)
        .join('\n---\n\n');
    await fs.writeFile(exportPath, exportContent);
    console.log('');
    console.log(C.system('  ' + ICONS.system + ' ' + `Exported: ${exportPath}`));
    console.log('');
    return true;
  }

  async deleteSession() {
    await this.sessionManager.loadSessionsList();
    const deletable = this.sessionManager.sessions.filter(id => id !== this.sessionManager.currentSession?.id);
    if (deletable.length === 0) {
      console.log(C.system('  ' + ICONS.system + ' No other sessions to delete'));
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
    console.log(C.system('  ' + ICONS.system + ' ' + `Deleted: ${toDelete}`));
    console.log('');
    return true;
  }
}
