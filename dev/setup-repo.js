// Setup script for configuring GitHub webhooks and importing existing issues/PRs
// Usage: node dev/setup-repo.js <github-repo-url> [webhook-url]
// Example: node dev/setup-repo.js https://github.com/modelcontextprotocol/inspector
// Example: node dev/setup-repo.js https://github.com/modelcontextprotocol/inspector https://my-worker.example.workers.dev

import { readFileSync } from 'fs';
import { createHmac } from 'crypto';

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
        action: 'opened', // Now comments are always fetched regardless of action
        issue: issue,
        repository: {
          name: repo,
          owner: { login: owner }
        }
      };
      
      const payloadBody = JSON.stringify(payload);
      console.log(`   📤 Sending webhook payload to: ${webhookUrl}`);
      console.log(`   📋 Payload size: ${payloadBody.length} bytes`);
      
      // Generate GitHub-style webhook signature
      const headers = {
        'Content-Type': 'application/json',
        'x-github-event': 'issues',
        'User-Agent': 'GitHub-Hookshot/bulk-import'
      };
      
      if (WEBHOOK_SECRET) {
        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(payloadBody)
          .digest('hex');
        headers['x-hub-signature-256'] = `sha256=${signature}`;
        console.log(`   🔐 Added webhook signature: sha256=${signature.substring(0, 8)}...`);
      } else {
        console.log(`   ⚠️  No webhook secret - sending unsigned request`);
      }
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: payloadBody
      });
      
      console.log(`   📊 Response status: ${response.status} ${response.statusText}`);
      console.log(`   📊 Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const responseText = await response.text();
        console.log(`   📄 Response body:`, responseText);
        console.log(`✅ Successfully imported issue #${issue.number}`);
        importedCount++;
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Error response body:`, errorText);
        console.log(`❌ Failed to import issue #${issue.number}: ${response.status} ${response.statusText}`);
        errorCount++;
      }
      
      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`❌ Error importing issue #${issue.number}:`);
      console.log(`   🔍 Error type: ${error.constructor.name}`);
      console.log(`   🔍 Error message: ${error.message}`);
      console.log(`   🔍 Error stack:`, error.stack);
      if (error.cause) {
        console.log(`   🔍 Error cause:`, error.cause);
      }
      errorCount++;
    }
  }
  
  // Import pull requests
  for (const pr of prs) {
    try {
      console.log(`\n🔄 Importing PR #${pr.number}: ${pr.title}`);
      
      const payload = {
        action: 'opened', // Now comments are always fetched regardless of action
        pull_request: pr,
        repository: {
          name: repo,
          owner: { login: owner }
        }
      };
      
      const payloadBody = JSON.stringify(payload);
      console.log(`   📤 Sending webhook payload to: ${webhookUrl}`);
      console.log(`   📋 Payload size: ${payloadBody.length} bytes`);
      
      // Generate GitHub-style webhook signature  
      const headers = {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'User-Agent': 'GitHub-Hookshot/bulk-import'
      };
      
      if (WEBHOOK_SECRET) {
        const signature = createHmac('sha256', WEBHOOK_SECRET)
          .update(payloadBody)
          .digest('hex');
        headers['x-hub-signature-256'] = `sha256=${signature}`;
        console.log(`   🔐 Added webhook signature: sha256=${signature.substring(0, 8)}...`);
      } else {
        console.log(`   ⚠️  No webhook secret - sending unsigned request`);
      }
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: payloadBody
      });
      
      console.log(`   📊 Response status: ${response.status} ${response.statusText}`);
      console.log(`   📊 Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const responseText = await response.text();
        console.log(`   📄 Response body:`, responseText);
        console.log(`✅ Successfully imported PR #${pr.number}`);
        importedCount++;
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Error response body:`, errorText);
        console.log(`❌ Failed to import PR #${pr.number}: ${response.status} ${response.statusText}`);
        errorCount++;
      }
      
      // Rate limiting: small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`❌ Error importing PR #${pr.number}:`);
      console.log(`   🔍 Error type: ${error.constructor.name}`);
      console.log(`   🔍 Error message: ${error.message}`);
      console.log(`   🔍 Error stack:`, error.stack);
      if (error.cause) {
        console.log(`   🔍 Error cause:`, error.cause);
      }
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
    console.error('Usage: node dev/setup-repo.js <github-repo-url> [webhook-url] [--manual]');
    console.error('');
    console.error('Examples:');
    console.error('  node dev/setup-repo.js https://github.com/modelcontextprotocol/inspector');
    console.error('  node dev/setup-repo.js https://github.com/owner/repo https://custom-worker.example.workers.dev');
    console.error('  node dev/setup-repo.js https://github.com/owner/repo --manual');
    console.error('');
    console.error('If webhook-url is not provided, defaults to https://issue-sync.ant-mcp.org');
    console.error('Use --manual flag to skip webhook creation and just show configuration instructions');
    console.error('For webhook creation, your GitHub token needs admin:repo_hook or repo scope and admin access to the repository.');
    process.exit(1);
  }

  const repoUrl = args[0];
  const isManual = args.includes('--manual');
  const webhookUrl = isManual ? 'https://issue-sync.ant-mcp.org' : (args[1] || 'https://issue-sync.ant-mcp.org');
  
  // Parse and validate the GitHub URL
  const { owner, repo } = parseGitHubUrl(repoUrl);
  
  if (isManual) {
    console.log(`📋 Manual webhook configuration for: ${repoUrl}\n`);
    
    console.log(`🪝 Webhook Configuration Instructions:`);
    console.log(`   1. Go to: https://github.com/${owner}/${repo}/settings/hooks`);
    console.log(`   2. Click "Add webhook"`);
    console.log(`   3. Configure the webhook:`);
    console.log(`      - Payload URL: ${webhookUrl}`);
    console.log(`      - Content type: application/json`);
    if (WEBHOOK_SECRET) {
      console.log(`      - Secret: ${WEBHOOK_SECRET}`);
    } else {
      console.log(`      - Secret: (none configured - add WEBHOOK_SECRET to .dev.vars for security)`);
    }
    console.log(`      - SSL verification: Enable`);
    console.log(`      - Events: Select "Let me select individual events"`);
    console.log(`        ✅ Issues`);
    console.log(`        ✅ Issue comments`);
    console.log(`        ✅ Pull requests`);
    console.log(`        ✅ Pull request review comments`);
    console.log(`   4. Click "Add webhook"\n`);
    
    // Still do the import in manual mode if we have a token
    if (GITHUB_TOKEN) {
      console.log(`📥 Importing existing issues and PRs with your GitHub token...\n`);
      
      try {
        // Import existing issues and PRs
        const importResult = await importExistingIssues(owner, repo, webhookUrl, 'open');
        
        console.log(`\n🎉 Manual setup completed!`);
        console.log(`   - Repository: ${owner}/${repo}`);
        console.log(`   - Webhook: Configure manually using instructions above`);
        console.log(`   - Imported ${importResult.imported} items`);
        
        if (importResult.errors > 0) {
          console.log(`\n⚠️  There were ${importResult.errors} errors during import. Check the logs above for details.`);
        }
        
      } catch (error) {
        console.error('❌ Import failed:', error.message);
        console.log(`\n📥 You can manually import later using:`);
        console.log(`   npm run import ${repoUrl}`);
      }
    } else {
      console.log(`📥 To import existing issues and PRs, run:`);
      console.log(`   npm run import ${repoUrl}`);
    }
    
    return;
  }

  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is required for automated setup. Set it in .dev.vars or use --manual flag.');
    console.error('   The token needs admin:repo_hook or repo scope and admin access to the repository.');
    console.error('   For manual setup, run: node dev/setup-repo.js <repo-url> --manual');
    process.exit(1);
  }

  if (!WEBHOOK_SECRET) {
    console.warn('⚠️  WEBHOOK_SECRET not found. Webhooks will be created without signature verification.');
    console.warn('   For production use, set WEBHOOK_SECRET in .dev.vars for security.');
  }
  
  try {
    console.log(`🚀 Setting up repository integration for: ${repoUrl}`);
    console.log(`🪝 Webhook URL: ${webhookUrl}\n`);
    
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
    console.error('\n💡 If you have permission issues, try manual setup:');
    console.error(`   node dev/setup-repo.js ${repoUrl} --manual`);
    process.exit(1);
  }
}

main().catch(console.error);