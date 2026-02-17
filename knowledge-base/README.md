# Knowledge Base

This directory contains the source material that powers Tax GPT. The assistant uses this data to answer tax-related questions.

## Current Knowledge Base

| File | Source | Size | Description |
|------|--------|------|-------------|
| `tax-knowledge-base.txt` | IRS Publication 17 (2025) | ~1MB | Complete text of "Your Federal Income Tax For Individuals" |
| `irs-tax-guide-2025.pdf` | IRS Publication 17 (2025) | - | Original PDF source |

**Stats:**
- 995,462 characters
- 176,148 words
- 12,509 lines
- ~142 pages

## How to Add More Knowledge

Want to expand Tax GPT's knowledge? Here's how:

### 1. Choose Your Source

Good sources for tax knowledge:
- IRS Publications (Pub 501, Pub 505, etc.)
- State tax guides
- Tax court decisions
- IRS forms and instructions
- Tax treaty documents

### 2. Prepare the Text

The app reads plain text files. To add a new source:

1. **Extract text** from your source (PDF → text)
2. **Clean it up**: Remove headers, footers, page numbers
3. **Save as**: `your-source-name.txt` in this directory

**Quick PDF to text conversion:**
```bash
# macOS
pdftotext source.pdf knowledge-base/new-source.txt

# Or use Python
python3 -c "import fitz; open('knowledge-base/new-source.txt','w').write(fitz.open('source.pdf')[0].get_text())"
```

### 3. Update the Code

Currently, Tax GPT loads a single knowledge base file. To use multiple files, modify `index.js`:

```javascript
// Around line 177 in index.js
const kbFiles = [
  'tax-knowledge-base.txt',
  'your-new-source.txt'
];

const knowledgeBases = await Promise.all(
  kbFiles.map(f => fs.readFile(path.join(__dirname, 'knowledge-base', f), 'utf-8'))
);
this.knowledgeBase = knowledgeBases.join('\n\n');
```

### 4. Test It

```bash
npm start
# Ask a question related to your new source
```

## Contribution Guidelines

### Formatting Tips

1. **Keep it clean**: Remove metadata, headers, page numbers
2. **Preserve structure**: Keep paragraph breaks and section headers
3. **Use plain text**: No Markdown, HTML, or formatting codes
4. **One source per file**: Easier to manage and update

### File Naming

- Use lowercase with hyphens
- Include year if applicable: `pub-17-2025.txt`
- Be descriptive: `california-tax-guide-2025.txt`

### Example Structure

```
knowledge-base/
├── README.md                    # This file
├── tax-knowledge-base.txt       # Default IRS Pub 17
├── irs-tax-guide-2025.pdf       # Original PDF
├── pub-501-2025.txt             # Exemptions, Standard Deduction
├── pub-505-2025.txt             # Estimated Tax
└── california-ftb-2025.txt      # State-specific guide
```

## Submitting Contributions

1. Fork the repo
2. Add your knowledge base file
3. Update this README with the new entry
4. Submit a PR with:
   - Source citation (where the data came from)
   - Brief description of what's included
   - File size and stats

## Legal Notes

- IRS publications are **public domain** ✅
- State tax guides vary by state (check licensing)
- Always cite your sources in the PR description
- Don't include copyrighted material without permission

## Questions?

Open an issue with the `knowledge-base` label!
