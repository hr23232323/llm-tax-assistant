# Tax GPT - Makefile
# Simple commands to get started quickly

.PHONY: help install start stats clean

# Default target shows help
help:
	@echo "Tax GPT - Available Commands:"
	@echo ""
	@echo "  make install    Install dependencies"
	@echo "  make start      Start Tax GPT (same as: npm start)"
	@echo "  make stats      Show knowledge base statistics"
	@echo "  make clean      Remove node_modules and reinstall"
	@echo "  make setup      Full setup (install deps + create .env)"
	@echo ""

# Install dependencies
install:
	npm install

# Start the application
start:
	npm start

# Show knowledge base stats
stats:
	node stats.js

# Full setup - install and create env file
setup: install
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✓ Created .env file - remember to add your API key!"; \
	else \
		echo "✓ .env already exists"; \
	fi
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit .env and add your OpenRouter API key"
	@echo "  2. Run: make start"
	@echo ""

# Clean and reinstall
clean:
	rm -rf node_modules package-lock.json
	npm install
	@echo "✓ Clean install complete"

# Development mode with nodemon (if installed)
dev:
	@if command -v nodemon >/dev/null 2>&1; then \
		nodemon index.js; \
	else \
		npx nodemon index.js; \
	fi
