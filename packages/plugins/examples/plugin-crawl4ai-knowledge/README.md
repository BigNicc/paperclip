# Crawl4AI Knowledge Plugin

Local Paperclip plugin that turns Crawl4AI crawl results into a persistent company knowledge base.

## What it does

- stores crawl source definitions per company
- crawls websites via a Crawl4AI Docker/API endpoint
- writes markdown snapshots into a local knowledge directory
- exposes search + crawl actions in the Paperclip UI
- registers agent tools so specialist agents can use the knowledge base

## Long-term setup

This plugin is intended to be used together with:

- a running local or remote Crawl4AI service
- a dedicated specialist agent such as `Crawl4AI Agent`
- a persistent knowledge directory inside the company workspace

In the MIGA setup, markdown snapshots are written into:

- `MIGA Consulting AI Company/knowledge/crawl4ai/`

## Local workflow

```bash
pnpm dev:crawl4ai
pnpm --filter @paperclipai/plugin-crawl4ai-knowledge typecheck
pnpm --filter @paperclipai/plugin-crawl4ai-knowledge test
pnpm --filter @paperclipai/plugin-crawl4ai-knowledge build
```
