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

### Quick Start (Makefile)

```bash
make setup    # Install deps + create .env file
make start    # Start Tax GPT
```

### Manual Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your OpenRouter API key:
```
OPENROUTER_API_KEY=your_key_here
```

3. (Optional) Change the AI model:
```
MODEL=google/gemini-3-flash-preview
```

Get your API key at: https://openrouter.ai/keys
Browse available models at: https://openrouter.ai/models

## Usage

```bash
npm start
# or
make start
```

## Session Storage

Sessions are automatically saved to:
- macOS/Linux: `~/.tax-gpt/sessions/`
- Windows: `%USERPROFILE%\.tax-gpt\sessions\`

Each session is stored as a JSON file with full conversation history.

## Knowledge Base

The application uses the complete text of **IRS Publication 17 (2025)**: "Your Federal Income Tax For Individuals"

**Location:** `knowledge-base/tax-knowledge-base.txt`

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

### Contributing Knowledge

Want to add more tax knowledge? Check out [`knowledge-base/README.md`](knowledge-base/README.md) for:
- How to add new sources (IRS pubs, state guides, etc.)
- Formatting guidelines
- Code modification instructions
- Legal considerations

## Model

**Google Gemini 3 Flash Preview** via OpenRouter
- Extremely fast responses
- Very cost-effective
- Excellent for tax Q&A

## Disclaimer

⚠️ **This is informational only and not professional tax advice.** Always consult a qualified tax professional for your specific situation.

## Contributing

We welcome contributions! Here's how you can help:

### Add More Knowledge

The easiest way to contribute is by expanding the knowledge base:
- Add IRS publications (Pub 501, 505, etc.)
- Include state tax guides
- Add tax court decisions

See [`knowledge-base/README.md`](knowledge-base/README.md) for detailed instructions.

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Ideas for Contributions

- [ ] Multi-file knowledge base support
- [ ] Search across multiple tax years
- [ ] Export to PDF
- [ ] Web interface
- [ ] State-specific tax modules
- [ ] Integration with tax software APIs

## License

MIT
