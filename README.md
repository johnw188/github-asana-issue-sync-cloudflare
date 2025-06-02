# GitHub to Asana Issue Sync - Cloudflare Worker

A Cloudflare Worker that synchronizes GitHub Issues to Asana Tasks via webhooks. This provides a secure alternative to the GitHub Action version, preventing exposure of Asana credentials to external collaborators.

## Features

- **Secure**: Runs on Cloudflare infrastructure, keeping Asana credentials isolated
- **Real-time**: Responds to GitHub webhook events instantly
- **Full Conversation Sync**: Includes issue descriptions and all comments
- **Custom Fields**: Optional repository tagging and metadata
- **Status Sync**: Automatically marks tasks complete/incomplete when issues are closed/reopened

## Setup

### 1. Deploy to Cloudflare

```bash
npm install
npx wrangler deploy
```

### 2. Configure Secrets

Set these secrets in your Cloudflare dashboard or via CLI:

```bash
# Required
npx wrangler secret put ASANA_PAT
npx wrangler secret put ASANA_PROJECT_ID

# Optional
npx wrangler secret put REPOSITORY_FIELD_ID
npx wrangler secret put CREATOR_FIELD_ID  
npx wrangler secret put GITHUB_URL_FIELD_ID
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

### 3. Configure GitHub Webhook

In your GitHub repository settings:

1. Go to Settings → Webhooks → Add webhook
2. Set Payload URL to your Cloudflare Worker URL
3. Set Content type to `application/json`
4. Set Secret to your `WEBHOOK_SECRET` (optional but recommended)
5. Select individual events: `Issues` and `Issue comments`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ASANA_PAT` | Yes | Asana Personal Access Token |
| `ASANA_PROJECT_ID` | Yes | Asana Project ID where tasks will be created |
| `REPOSITORY_FIELD_ID` | No | Custom field ID for repository name tagging |
| `CREATOR_FIELD_ID` | No | Custom field ID for issue creator |
| `GITHUB_URL_FIELD_ID` | No | Custom field ID for GitHub issue URL (enables faster search) |
| `GITHUB_TOKEN` | No | GitHub token for fetching issue comments |
| `WEBHOOK_SECRET` | No | GitHub webhook secret for signature verification |

## Supported Events

- **Issues opened**: Creates new Asana task
- **Issues edited**: Updates task description with latest content
- **Issues closed/reopened**: Marks task complete/incomplete
- **Issue comments created**: Updates task description with full conversation

## Development

```bash
# Local development
npm run dev

# Run tests
npm test

# Deploy
npm run deploy
```

## Migration from GitHub Action

If you're migrating from the github-issues-asana-tasks-action:

1. Note your current environment variables
2. Deploy this Cloudflare Worker with the same configuration
3. Update your repository webhook to point to the Worker URL
4. Remove the GitHub Action workflow file

The Worker maintains the same functionality and data format as the original action.

## Security

- Asana credentials are stored as Cloudflare secrets, not accessible to repository collaborators
- Optional webhook signature verification prevents unauthorized requests
- No sensitive data is logged or exposed

## License

MIT