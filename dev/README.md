# Development Tools

This directory contains tools and scripts for local development and testing.

## Files

- **`test-webhook.js`** - Local testing script that simulates GitHub webhook events
  - Generates unique issue numbers for each test run
  - Tests all webhook events (open, edit, close, reopen, comment)
  - Can test individual events or run the full suite

## Usage

```bash
# Test all webhook events
npm run test:webhook

# Test individual events
npm run test:webhook:opened
npm run test:webhook:edited  
npm run test:webhook:closed
npm run test:webhook:reopened
npm run test:webhook:comment
```

## Prerequisites

- Local worker running: `npm run dev`
- Environment variables configured in `.dev.vars`

The test script automatically generates unique issue numbers based on timestamps to avoid conflicts between test runs.