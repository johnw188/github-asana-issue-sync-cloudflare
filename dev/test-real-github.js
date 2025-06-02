// Test script for real GitHub issues/PRs
// Usage: node dev/test-real-github.js <github-url> [action]
// Example: node dev/test-real-github.js https://github.com/owner/repo/issues/123
// Example: node dev/test-real-github.js https://github.com/owner/repo/pull/456 opened

import { readFileSync } from 'fs';

// Read GITHUB_TOKEN from .dev.vars file
function getGitHubToken() {
  try {
    const envContent = readFileSync('.dev.vars', 'utf8');
    const tokenMatch = envContent.match(/GITHUB_TOKEN=(.+)/);
    return tokenMatch ? tokenMatch[1].trim() : null;
  } catch (error) {
    return process.env.GITHUB_TOKEN || null;
  }
}

const GITHUB_TOKEN = getGitHubToken();
const LOCAL_WEBHOOK_URL = 'http://localhost:8787';

function parseGitHubUrl(url) {
  const match = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo/issues/123 or https://github.com/owner/repo/pull/456');
  }
  
  const [, owner, repo, type, number] = match;
  return {
    owner,
    repo,
    type: type === 'pull' ? 'pull_request' : 'issue',
    number: parseInt(number),
    issuePr: type === 'pull' ? 'pull' : 'issues'
  };
}

async function fetchGitHubData(owner, repo, type, number) {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/${type === 'pull_request' ? 'pulls' : 'issues'}/${number}`;
  
  console.log(`Fetching data from: ${apiUrl}`);
  
  const response = await fetch(apiUrl, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cloudflare-github-asana-sync-test'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

async function createWebhookPayload(owner, repo, type, itemData, action = 'opened') {
  // Fetch repository data
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cloudflare-github-asana-sync-test'
    }
  });

  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch repository data: ${repoResponse.status} ${repoResponse.statusText}`);
  }

  const repoData = await repoResponse.json();

  const payload = {
    action,
    repository: {
      name: repoData.name,
      owner: {
        login: repoData.owner.login
      }
    }
  };

  if (type === 'pull_request') {
    payload.pull_request = itemData;
  } else {
    payload.issue = itemData;
  }

  return payload;
}

async function sendWebhookEvent(payload, eventType) {
  console.log(`\n🧪 Sending ${eventType} event...`);
  
  const response = await fetch(LOCAL_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-github-event': eventType
    },
    body: JSON.stringify(payload)
  });
  
  console.log('Status:', response.status);
  
  const responseText = await response.text();
  
  try {
    const result = JSON.parse(responseText);
    console.log('✅ Success:', result);
    return result;
  } catch {
    console.log('❌ Response is not JSON:', responseText);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node dev/test-real-github.js <github-url> [action]');
    console.error('');
    console.error('Examples:');
    console.error('  node dev/test-real-github.js https://github.com/owner/repo/issues/123');
    console.error('  node dev/test-real-github.js https://github.com/owner/repo/pull/456 opened');
    console.error('');
    console.error('Available actions: opened, edited, closed, reopened');
    process.exit(1);
  }

  const githubUrl = args[0];
  const action = args[1] || 'opened';

  try {
    console.log(`🔄 Processing GitHub URL: ${githubUrl}`);
    console.log(`📋 Action: ${action}\n`);

    // Parse the GitHub URL
    const { owner, repo, type, number } = parseGitHubUrl(githubUrl);
    console.log(`📊 Parsed: ${owner}/${repo} ${type} #${number}`);

    // Fetch the GitHub data
    const itemData = await fetchGitHubData(owner, repo, type, number);
    console.log(`✅ Fetched ${type} data: "${itemData.title}"`);

    // Create webhook payload
    const payload = await createWebhookPayload(owner, repo, type, itemData, action);
    console.log(`📦 Created webhook payload for ${type} ${action} event`);

    // Determine event type
    const eventType = type === 'pull_request' ? 'pull_request' : 'issues';

    // Send webhook event
    await sendWebhookEvent(payload, eventType);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);