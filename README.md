# Tax GPT

A lean, fast tax assistant powered by IRS Publication 17 (2025) and OpenRouter. Minimal UI, maximum value.

![Version](https://img.shields.io/badge/version-2.0.0-green)
![Model](https://img.shields.io/badge/model-Gemini%203%20Flash-blue)

## Features

- **Streaming Output**: Watch responses type out in real-time
- **Clean UI**: Claude Code / opencode-style interface with clear user/agent differentiation
- **Session Management**: Create, save, and switch between sessions
- **Persistent History**: Auto-saved to `~/.tax-gpt/sessions/`
- **Lean System Prompt**: Every word adds value—no fluff
- **Smart Context**: Maintains conversation history for coherent multi-turn discussions
- **Knowledge Base**: 995K characters from IRS Publication 17 (142 pages)

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a new session |
| `/sessions` | List and switch between saved sessions |
| `/clear` | Clear current session history |
| `/history` | Show conversation history |
| `/export` | Export session to Markdown file |
| `/delete` | Delete a saved session |
| `/quit` | Exit the application |

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your OpenRouter API key:
```
OPENROUTER_API_KEY=your_key_here
```

Get your API key at: https://openrouter.ai/keys

## Usage

```bash
npm start
```

## Session Storage

Sessions are automatically saved to:
- macOS/Linux: `~/.tax-gpt/sessions/`
- Windows: `%USERPROFILE%\.tax-gpt\sessions\`

Each session is stored as a JSON file with full conversation history.

## Knowledge Base

The application uses the complete text of **IRS Publication 17 (2025)**: "Your Federal Income Tax For Individuals"

**Statistics:**
- 995,462 characters
- 176,148 words
- 12,509 lines
- ~142 pages

**Covers:**
- Filing requirements and status
- Income and adjustments
- Standard and itemized deductions
- Tax credits (Child Tax Credit, EITC, etc.)
- Estimated taxes and withholding
- 2025 tax tables and rates

## Model

**Google Gemini 3 Flash Preview** via OpenRouter
- Extremely fast responses
- Very cost-effective
- Excellent for tax Q&A

## Disclaimer

⚠️ **This is informational only and not professional tax advice.** Always consult a qualified tax professional for your specific situation.

## License

MIT
