import fs from 'fs/promises';
import path from 'path';
import { CONFIG_DIR, SESSIONS_DIR, MAX_HISTORY_TURNS, MODEL } from './config.js';

export class SessionManager {
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
