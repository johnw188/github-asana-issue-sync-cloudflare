#!/usr/bin/env node

// Bulk import existing GitHub issues and PRs to Asana
// Usage: node dev/bulk-import.js owner/repo [--issues-only] [--prs-only] [--state=open|closed|all]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import our existing sync logic
import { AsanaAPI } from '../src/lib/asana-api-direct.js';
import { IssueSync } from '../src/lib/issue-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .dev.vars
function loadEnvVars() {
  const envPath = path.join(__dirname, '..', '.dev.vars');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .dev.vars file not found. Please create it with your environment variables.');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
      }
    }
  });
  
  return env;
}

// Fetch specific items by number
async function fetchSpecificItems(owner, repo, type, numbers, githubToken) {
  const items = [];
  
  for (const number of numbers) {
    try {
      console.log(`Fetching ${type} #${number}...`);
      
      const url = `https://api.github.com/repos/${owner}/${repo}/${type}/${number}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'github-asana-bulk-import'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`  ⚠️  ${type} #${number} not found`);
          continue;
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const item = await response.json();
      
      // Filter out PRs from issues endpoint (GitHub issues API includes PRs)
      if (type === 'issues' && item.pull_request) {
        console.log(`  ⚠️  #${number} is a pull request, skipping in issues mode`);
        continue;
      }
      
      items.push(item);
      console.log(`  ✅ Found ${type} #${number}: ${item.title}`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`  ❌ Error fetching ${type} #${number}: ${error.message}`);
    }
  }
  
  return items;
}

// Fetch all issues or PRs from GitHub with pagination
async function fetchAllItems(owner, repo, type, state, githubToken) {
  const items = [];
  let page = 1;
  const perPage = 100;
  
  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/${type}?state=${state}&page=${page}&per_page=${perPage}&sort=created&direction=asc`;
    
    console.log(`Fetching ${type} page ${page}...`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'github-asana-bulk-import'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const pageItems = await response.json();
    
    if (pageItems.length === 0) {
      break;
    }
    
    // Filter out PRs from issues endpoint (GitHub issues API includes PRs)
    const filteredItems = type === 'issues' 
      ? pageItems.filter(item => !item.pull_request)
      : pageItems;
    
    items.push(...filteredItems);
    console.log(`  Found ${filteredItems.length} ${type} on page ${page} (total: ${items.length})`);
    
    if (pageItems.length < perPage) {
      break; // Last page
    }
    
    page++;
    
    // Rate limiting - be nice to GitHub API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return items;
}

// Check if task already exists in Asana
async function taskExists(asanaAPI, projectId, githubUrl) {
  try {
    const tasks = await asanaAPI.getTasksForProject(projectId, {
      opt_fields: 'name,notes',
      limit: 100
    });
    
    // Check first page of tasks
    const existingTask = tasks.data.find(task => 
      task.notes && task.notes.includes(githubUrl)
    );
    
    return !!existingTask;
  } catch (error) {
    console.warn(`Warning: Could not check for existing task: ${error.message}`);
    return false;
  }
}

// Process a single item (issue or PR)
async function processItem(item, type, issueSync, asanaAPI, projectId, env) {
  const githubUrl = item.html_url;
  
  // Check if task already exists
  const exists = await taskExists(asanaAPI, projectId, githubUrl);
  if (exists) {
    console.log(`  ⏭️  Skipping ${type} #${item.number} - task already exists`);
    return { skipped: true };
  }
  
  try {
    // Create a synthetic webhook payload
    const webhookPayload = {
      action: 'opened',
      [type === 'issue' ? 'issue' : 'pull_request']: item,
      repository: {
        name: item.repository_url.split('/').pop(),
        owner: {
          login: item.repository_url.split('/').slice(-2, -1)[0]
        }
      }
    };
    
    // Use existing sync logic
    if (type === 'issue') {
      await issueSync.handleIssueEvent(webhookPayload);
    } else {
      await issueSync.handlePullRequestEvent(webhookPayload);
    }
    
    console.log(`  ✅ Created task for ${type} #${item.number}: ${item.title}`);
    return { created: true };
    
  } catch (error) {
    console.error(`  ❌ Error processing ${type} #${item.number}: ${error.message}`);
    return { error: error.message, item: item };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0].includes('help')) {
    console.log(`
Usage: node dev/bulk-import.js owner/repo [options]

Options:
  --issues-only    Import only issues (default: import both issues and PRs)
  --prs-only      Import only pull requests  
  --state=STATE   Filter by state: open, closed, all (default: all)
  --numbers=N,N   Import only specific issue/PR numbers (comma-separated)
  --dry-run       Show what would be imported without creating tasks

Examples:
  node dev/bulk-import.js johnw188/my-repo
  node dev/bulk-import.js johnw188/my-repo --issues-only --state=open
  node dev/bulk-import.js johnw188/my-repo --prs-only
  node dev/bulk-import.js johnw188/my-repo --numbers=123,456,789
  node dev/bulk-import.js johnw188/my-repo --dry-run
`);
    process.exit(0);
  }
  
  const repo = args[0];
  const [owner, repoName] = repo.split('/');
  
  if (!owner || !repoName) {
    console.error('Error: Repository must be in format "owner/repo"');
    process.exit(1);
  }
  
  const issuesOnly = args.includes('--issues-only');
  const prsOnly = args.includes('--prs-only');
  const stateArg = args.find(arg => arg.startsWith('--state='));
  const state = stateArg ? stateArg.split('=')[1] : 'all';
  const numbersArg = args.find(arg => arg.startsWith('--numbers='));
  const specificNumbers = numbersArg ? numbersArg.split('=')[1].split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)) : null;
  const dryRun = args.includes('--dry-run');
  
  if (!['open', 'closed', 'all'].includes(state)) {
    console.error('Error: State must be one of: open, closed, all');
    process.exit(1);
  }
  
  console.log(`🚀 Starting bulk import for ${repo}`);
  console.log(`   State: ${state}`);
  console.log(`   Types: ${issuesOnly ? 'issues only' : prsOnly ? 'PRs only' : 'issues and PRs'}`);
  if (specificNumbers) console.log(`   Numbers: ${specificNumbers.join(', ')}`);
  console.log(`   Mode: ${dryRun ? 'dry run' : 'live import'}`);
  console.log('');
  
  // Load environment
  const env = loadEnvVars();
  
  if (!env.GITHUB_TOKEN || !env.ASANA_PAT || !env.ASANA_PROJECT_ID) {
    console.error('Error: Missing required environment variables (GITHUB_TOKEN, ASANA_PAT, ASANA_PROJECT_ID)');
    process.exit(1);
  }
  
  // Initialize Asana API and sync
  const asanaAPI = new AsanaAPI(env.ASANA_PAT);
  const issueSync = new IssueSync(asanaAPI, env);
  
  const results = {
    issues: { found: 0, created: 0, skipped: 0, errors: 0 },
    prs: { found: 0, created: 0, skipped: 0, errors: 0 }
  };
  
  const failedItems = {
    issues: [],
    prs: []
  };
  
  try {
    // Import issues
    if (!prsOnly) {
      console.log('📋 Fetching issues...');
      const issues = specificNumbers 
        ? await fetchSpecificItems(owner, repoName, 'issues', specificNumbers, env.GITHUB_TOKEN)
        : await fetchAllItems(owner, repoName, 'issues', state, env.GITHUB_TOKEN);
      results.issues.found = issues.length;
      
      if (issues.length > 0) {
        console.log(`\n📋 Processing ${issues.length} issues...\n`);
        
        for (const issue of issues) {
          if (dryRun) {
            console.log(`  [DRY RUN] Would import issue #${issue.number}: ${issue.title}`);
            continue;
          }
          
          const result = await processItem(issue, 'issue', issueSync, asanaAPI, env.ASANA_PROJECT_ID, env);
          
          if (result.created) results.issues.created++;
          else if (result.skipped) results.issues.skipped++;
          else if (result.error) {
            results.issues.errors++;
            failedItems.issues.push({
              number: issue.number,
              title: issue.title,
              url: issue.html_url,
              error: result.error
            });
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    
    // Import PRs
    if (!issuesOnly) {
      console.log('\n🔄 Fetching pull requests...');
      const prs = specificNumbers 
        ? await fetchSpecificItems(owner, repoName, 'pulls', specificNumbers, env.GITHUB_TOKEN)
        : await fetchAllItems(owner, repoName, 'pulls', state, env.GITHUB_TOKEN);
      results.prs.found = prs.length;
      
      if (prs.length > 0) {
        console.log(`\n🔄 Processing ${prs.length} pull requests...\n`);
        
        for (const pr of prs) {
          if (dryRun) {
            console.log(`  [DRY RUN] Would import PR #${pr.number}: ${pr.title}`);
            continue;
          }
          
          const result = await processItem(pr, 'pull_request', issueSync, asanaAPI, env.ASANA_PROJECT_ID, env);
          
          if (result.created) results.prs.created++;
          else if (result.skipped) results.prs.skipped++;
          else if (result.error) {
            results.prs.errors++;
            failedItems.prs.push({
              number: pr.number,
              title: pr.title,
              url: pr.html_url,
              error: result.error
            });
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    
    // Summary
    console.log('\n📊 Import Summary:');
    console.log(`Issues: ${results.issues.found} found, ${results.issues.created} created, ${results.issues.skipped} skipped, ${results.issues.errors} errors`);
    console.log(`PRs: ${results.prs.found} found, ${results.prs.created} created, ${results.prs.skipped} skipped, ${results.prs.errors} errors`);
    
    const totalCreated = results.issues.created + results.prs.created;
    const totalErrors = results.issues.errors + results.prs.errors;
    
    if (dryRun) {
      console.log('\n✨ Dry run complete - no tasks were created');
    } else if (totalCreated > 0) {
      console.log(`\n✅ Successfully imported ${totalCreated} items to Asana!`);
    }
    
    if (totalErrors > 0) {
      console.log(`\n⚠️  ${totalErrors} items failed to import`);
      
      // Output failed items for easy rerunning
      const allFailedItems = [...failedItems.issues, ...failedItems.prs];
      if (allFailedItems.length > 0) {
        console.log('\n📋 Failed Items (for easy retry):');
        console.log('');
        
        // Group by error type for better organization
        const errorGroups = {};
        allFailedItems.forEach(item => {
          const errorKey = item.error.substring(0, 100); // First 100 chars of error
          if (!errorGroups[errorKey]) {
            errorGroups[errorKey] = [];
          }
          errorGroups[errorKey].push(item);
        });
        
        Object.entries(errorGroups).forEach(([errorType, items]) => {
          console.log(`❌ Error: ${errorType}${errorType.length >= 100 ? '...' : ''}`);
          items.forEach(item => {
            console.log(`   - #${item.number}: ${item.title}`);
            console.log(`     ${item.url}`);
          });
          console.log('');
        });
        
        // Output as a simple list for scripts
        console.log('📋 Failed Item Numbers (copy for selective retry):');
        const failedNumbers = allFailedItems.map(item => `#${item.number}`).join(', ');
        console.log(failedNumbers);
        console.log('');
        
        // Output as URLs for manual checking
        console.log('🔗 Failed Item URLs:');
        allFailedItems.forEach(item => {
          console.log(`${item.url}`);
        });
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`\n❌ Import failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);