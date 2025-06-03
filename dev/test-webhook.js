// Test script for local development

// Generate unique issue number based on timestamp
const issueNumber = Math.floor(Date.now() / 1000); // Unix timestamp for uniqueness
const timestamp = new Date().toISOString();

const baseIssue = {
  html_url: `https://github.com/test/repo/issues/${issueNumber}`,
  title: `Test Issue #${issueNumber}`,
  body: `This is a test issue created at ${timestamp}`,
  number: issueNumber,
  user: { 
    login: "testuser",
    html_url: "https://github.com/testuser"
  },
  created_at: timestamp
};

const basePullRequest = {
  html_url: `https://github.com/test/repo/pull/${issueNumber}`,
  title: `Test Pull Request #${issueNumber}`,
  body: `This is a test pull request created at ${timestamp}

## Testing Table Conversion

Here's a test table to verify our table-to-preformatted conversion:

| Feature | Before | After |
|---------|--------|-------|
| Tables  | ❌ XML Error | ✅ Works |
| Images  | ![image](https://example.com/img.png) | Text only |
| Links   | [GitHub](https://github.com) | Still works |

## Test Checklist

- [x] Basic functionality works
- [ ] Table conversion implemented  
- [x] Error handling added
- [ ] Production deployment

This should test our table handling!`,
  number: issueNumber,
  user: { 
    login: "testuser",
    html_url: "https://github.com/testuser"
  },
  created_at: timestamp
};

const baseRepository = {
  name: "test",
  owner: { login: "test-owner" }
};

const testPayloads = {
  issueOpened: {
    action: "opened",
    issue: baseIssue,
    repository: baseRepository
  },
  
  issueEdited: {
    action: "edited",
    issue: {
      ...baseIssue,
      title: "Updated Test Issue",
      body: "This is an updated test issue with more details"
    },
    repository: baseRepository
  },
  
  issueClosed: {
    action: "closed",
    issue: baseIssue,
    repository: baseRepository
  },
  
  issueReopened: {
    action: "reopened",
    issue: baseIssue,
    repository: baseRepository
  },
  
  commentCreated: {
    action: "created",
    issue: baseIssue,
    repository: baseRepository,
    comment: {
      html_url: `https://github.com/test/repo/issues/${issueNumber}#issuecomment-${issueNumber}999`,
      body: "This is a test comment on the issue",
      user: {
        login: "commenter",
        html_url: "https://github.com/commenter"
      },
      created_at: new Date().toISOString()
    }
  },
  
  prOpened: {
    action: "opened",
    pull_request: basePullRequest,
    repository: baseRepository
  },
  
  prEdited: {
    action: "edited",
    pull_request: {
      ...basePullRequest,
      title: "Updated Test Pull Request",
      body: "This is an updated test pull request with more details"
    },
    repository: baseRepository
  },
  
  prClosed: {
    action: "closed",
    pull_request: basePullRequest,
    repository: baseRepository
  },
  
  prReopened: {
    action: "reopened",
    pull_request: basePullRequest,
    repository: baseRepository
  },
  
  prCommentCreated: {
    action: "created",
    pull_request: basePullRequest,
    repository: baseRepository,
    comment: {
      html_url: `https://github.com/test/repo/pull/${issueNumber}#discussion_r${issueNumber}999`,
      body: "This is a test review comment on the pull request",
      user: {
        login: "reviewer",
        html_url: "https://github.com/reviewer"
      },
      created_at: new Date().toISOString()
    }
  }
};

async function testWebhookEvent(eventName, payload, githubEvent = 'issues') {
  try {
    console.log(`\n🧪 Testing ${eventName}...`);
    const response = await fetch('http://localhost:8787', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': githubEvent
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
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log(`🚀 Running all webhook tests for issue/PR #${issueNumber}...\n`);
  
  console.log('📋 ISSUE TESTS');
  // Test 1: Issue Opened
  await testWebhookEvent('Issue Opened', testPayloads.issueOpened, 'issues');
  
  // Test 2: Issue Edited
  await testWebhookEvent('Issue Edited', testPayloads.issueEdited, 'issues');
  
  // Test 3: Issue Closed
  await testWebhookEvent('Issue Closed', testPayloads.issueClosed, 'issues');
  
  // Test 4: Issue Reopened
  await testWebhookEvent('Issue Reopened', testPayloads.issueReopened, 'issues');
  
  // Test 5: Comment Created
  await testWebhookEvent('Comment Created', testPayloads.commentCreated, 'issue_comment');
  
  console.log('\n🔀 PULL REQUEST TESTS');
  // Test 6: PR Opened
  await testWebhookEvent('PR Opened', testPayloads.prOpened, 'pull_request');
  
  // Test 7: PR Edited
  await testWebhookEvent('PR Edited', testPayloads.prEdited, 'pull_request');
  
  // Test 8: PR Closed
  await testWebhookEvent('PR Closed', testPayloads.prClosed, 'pull_request');
  
  // Test 9: PR Reopened
  await testWebhookEvent('PR Reopened', testPayloads.prReopened, 'pull_request');
  
  // Test 10: PR Comment Created
  await testWebhookEvent('PR Comment Created', testPayloads.prCommentCreated, 'pull_request_review_comment');
  
  console.log('\n🎉 All tests completed!');
}

// Run individual test or all tests
const testName = process.argv[2];
if (testName && testPayloads[testName]) {
  let eventType = 'issues';
  if (testName === 'commentCreated') {
    eventType = 'issue_comment';
  } else if (testName.startsWith('pr')) {
    if (testName === 'prCommentCreated') {
      eventType = 'pull_request_review_comment';
    } else {
      eventType = 'pull_request';
    }
  }
  testWebhookEvent(testName, testPayloads[testName], eventType);
} else {
  runAllTests().catch(console.error);
}