// Setup script for configuring GitHub webhooks and importing existing issues/PRs
// Usage: node dev/setup-repo.js <github-repo-url> [webhook-url]
// Example: node dev/setup-repo.js https://github.com/modelcontextprotocol/inspector
// Example: node dev/setup-repo.js https://github.com/modelcontextprotocol/inspector https://my-worker.example.workers.dev

import { readFileSync } from 'fs';

// Read environment variables from .dev.vars file
function getEnvVar(varName) {
  try {
    const envContent = readFileSync('.dev.vars', 'utf8');
    const match = envContent.match(new RegExp(`${varName}=(.+)`));
    return match ? match[1].trim() : null;
  } catch (error) {
    return process.env[varName] || null;
  }
}

function getGitHubToken() {
  return getEnvVar('GITHUB_TOKEN');
}

function getWebhookSecret() {
  return getEnvVar('WEBHOOK_SECRET');
}

const GITHUB_TOKEN = getGitHubToken();
const WEBHOOK_SECRET = getWebhookSecret();

function parseGitHubUrl(url) {
  const match = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?$/);
  if (!match) {
    throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo');
  }
  
  const [, owner, repo] = match;
  return { owner, repo: repo.replace(/\.git$/, '') };
}

async function checkRepoAccess(owner, repo) {
  console.log(`🔍 Checking access to ${owner}/${repo}...`);
  
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'github-asana-sync-setup'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository ${owner}/${repo} not found or insufficient permissions. Ensure your GitHub token has admin access to this repository.`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const repoData = await response.json();
  console.log(`✅ Repository found: ${repoData.full_name}`);
  console.log(`   - Private: ${repoData.private}`);
  console.log(`   - Admin permissions: ${repoData.permissions?.admin || 'unknown'}`);
  
  if (!repoData.permissions?.admin) {
    console.warn(`⚠️  Warning: Token may not have admin permissions. Webhook creation might fail.`);
  }
  
  return repoData;
}

async function createWebhook(owner, repo, webhookUrl) {
  console.log(`🪝 Creating webhook for ${owner}/${repo}...`);
  console.log(`   Target URL: ${webhookUrl}`);
  
  const webhookConfig = {
    name: 'web',
    active: true,
    events: [
      'issues',
      'issue_comment', 
      'pull_request',
      'pull_request_review_comment'
    ],
    config: {
      url: webhookUrl,
      content_type: 'json',
      insecure_ssl: '0' // Require SSL
    }
  };

  // Add webhook secret if available (recommended for security)
  if (WEBHOOK_SECRET) {
    webhookConfig.config.secret = WEBHOOK_SECRET;
    console.log(`   🔐 Using webhook secret for signature verification`);
  } else {
    console.log(`   ⚠️  No webhook secret configured - signatures will not be verified`);
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'github-asana-sync-setup',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(webhookConfig)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 422 && errorData.errors?.some(e => e.message?.includes('Hook already exists'))) {
      console.log(`ℹ️  Webhook already exists for ${webhookUrl}`);
      return null;
    }
    throw new Error(`Failed to create webhook: ${response.status} ${response.statusText}\n${JSON.stringify(errorData, null, 2)}`);
  }

  const webhook = await response.json();
  console.log(`✅ Webhook created successfully!`);
  console.log(`   - Webhook ID: ${webhook.id}`);
  console.log(`   - Events: ${webhook.events.join(', ')}`);
  console.log(`   - URL: ${webhook.config.url}`);
  
  return webhook;
}

async function fetchWithPagination(url, headers) {
  const allItems = [];
  let nextUrl = url;
  
  while (nextUrl) {
    console.log(`   Fetching: ${nextUrl}`);
    const response = await fetch(nextUrl, { headers });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const items = await response.json();
    allItems.push(...items);
    
    // Check for next page in Link header
    const linkHeader = response.headers.get('Link');
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
    
    console.log(`   Found ${items.length} items (total: ${allItems.length})`);
  }
  
  return allItems;
}

async function importExistingIssues(owner, repo, webhookUrl, state = 'all') {
  console.log(`\n📥 Importing existing issues from ${owner}/${repo}...`);
  console.log(`   State filter: ${state}`);
  
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'github-asana-sync-setup'
  };
  
  // Fetch all issues (GitHub API includes PRs in issues endpoint, we'll filter them)
  const issuesUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=100`;
  const allIssues = await fetchWithPagination(issuesUrl, headers);
  
  // Separate issues from PRs
  const issues = allIssues.filter(item => !item.pull_request);
  const prs = allIssues.filter(item => item.pull_request);
  
  console.log(`📊 Found ${issues.length} issues and ${prs.length} pull requests`);
  
  let importedCount = 0;
  let errorCount = 0;
  
  // Import issues
  for (const issue of issues) {
    try {
      console.log(`\n🔄 Importing issue #${issue.number}: ${issue.title}`);
      
      const payload = {
        action: 'opened',
        issue: issue,
        repository: {
          name: repo,
          owner: { login: owner }
        }
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-github-event': 'issues'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        console.log(`✅ Successfully imported issue #${issue.number}`);
        importedCount++;
      } else {
        console.log(`❌ Failed to import issue #${issue.number}: ${response.status}`);
        errorCount++;
      }
      
      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`❌ Error importing issue #${issue.number}:`, error.message);
      errorCount++;
    }
  }
  
  // Import pull requests
  for (const pr of prs) {
    try {
      console.log(`\n🔄 Importing PR #${pr.number}: ${pr.title}`);
      
      const payload = {
        action: 'opened', 
        pull_request: pr,
        repository: {
          name: repo,
          owner: { login: owner }
        }
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-github-event': 'pull_request'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        console.log(`✅ Successfully imported PR #${pr.number}`);
        importedCount++;
      } else {
        console.log(`❌ Failed to import PR #${pr.number}: ${response.status}`);
        errorCount++;
      }
      
      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`❌ Error importing PR #${pr.number}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Import Summary:`);
  console.log(`   - Total items: ${issues.length + prs.length}`);
  console.log(`   - Successfully imported: ${importedCount}`);
  console.log(`   - Errors: ${errorCount}`);
  
  return { total: issues.length + prs.length, imported: importedCount, errors: errorCount };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node dev/setup-repo.js <github-repo-url> [webhook-url]');
    console.error('');
    console.error('Examples:');
    console.error('  node dev/setup-repo.js https://github.com/modelcontextprotocol/inspector');
    console.error('  node dev/setup-repo.js https://github.com/owner/repo https://custom-worker.example.workers.dev');
    console.error('  node dev/setup-repo.js https://github.com/owner/repo http://localhost:8787');
    console.error('');
    console.error('If webhook-url is not provided, defaults to https://issue-sync.ant-mcp.org');
    console.error('For webhook creation, your GitHub token needs admin:repo_hook or repo scope and admin access to the repository.');
    process.exit(1);
  }

  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is required. Set it in .dev.vars or as an environment variable.');
    console.error('   The token needs admin:repo_hook or repo scope and admin access to the repository.');
    process.exit(1);
  }

  if (!WEBHOOK_SECRET) {
    console.warn('⚠️  WEBHOOK_SECRET not found. Webhooks will be created without signature verification.');
    console.warn('   For production use, set WEBHOOK_SECRET in .dev.vars for security.');
  }

  const repoUrl = args[0];
  const webhookUrl = args[1] || 'https://issue-sync.ant-mcp.org'; // Default to production webhook URL
  
  try {
    console.log(`🚀 Setting up repository integration for: ${repoUrl}`);
    console.log(`🪝 Webhook URL: ${webhookUrl}\n`);

    // Parse and validate the GitHub URL
    const { owner, repo } = parseGitHubUrl(repoUrl);
    
    // Check repository access and permissions
    await checkRepoAccess(owner, repo);
    
    // Create webhook (always create unless explicitly using localhost)
    if (!webhookUrl.includes('localhost')) {
      await createWebhook(owner, repo, webhookUrl);
    } else {
      console.log(`ℹ️  Skipping webhook creation (using local development server)`);
    }
    
    // Import existing issues and PRs
    const importResult = await importExistingIssues(owner, repo, webhookUrl, 'open');
    
    console.log(`\n🎉 Setup completed successfully!`);
    console.log(`   - Repository: ${owner}/${repo}`);
    if (!webhookUrl.includes('localhost')) {
      console.log(`   - Webhook configured for: ${webhookUrl}`);
    }
    console.log(`   - Imported ${importResult.imported} items`);
    
    if (importResult.errors > 0) {
      console.log(`\n⚠️  There were ${importResult.errors} errors during import. Check the logs above for details.`);
    }
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);