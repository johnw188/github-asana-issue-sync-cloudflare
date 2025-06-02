# Development Tools

This directory contains tools and scripts for local development and testing.

## Files

- **`test-webhook.js`** - Local testing script that simulates GitHub webhook events
  - Generates unique issue/PR numbers for each test run
  - Tests all webhook events for both issues and pull requests (open, edit, close, reopen, comment)
  - Can test individual events or run the full suite

- **`test-real-github.js`** - Test with real GitHub issues/PRs
  - Takes a GitHub issue or PR URL and simulates webhook events using real data
  - Fetches actual issue/PR data from GitHub API
  - Useful for testing with real file changes, comments, and content

## Usage

```bash
# Test all webhook events (issues and PRs)
npm run test:webhook

# Test individual issue events
npm run test:webhook:opened
npm run test:webhook:edited  
npm run test:webhook:closed
npm run test:webhook:reopened
npm run test:webhook:comment

# Test individual pull request events
npm run test:webhook:pr-opened
npm run test:webhook:pr-edited
npm run test:webhook:pr-closed
npm run test:webhook:pr-reopened
npm run test:webhook:pr-comment

# Test with real GitHub issues/PRs
npm run test:real https://github.com/owner/repo/issues/123
npm run test:real https://github.com/owner/repo/pull/456
npm run test:real https://github.com/owner/repo/issues/123 edited
```

## Prerequisites

- Local worker running: `npm run dev`
- Environment variables configured in `.dev.vars`

The test script automatically generates unique issue/PR numbers based on timestamps to avoid conflicts between test runs.