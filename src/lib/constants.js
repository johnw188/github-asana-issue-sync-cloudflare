// GitHub webhook event types that we support
export const GITHUB_EVENT_TYPES = {
  ISSUES: 'issues',
  ISSUE_COMMENT: 'issue_comment',
  PULL_REQUEST: 'pull_request',
  PULL_REQUEST_REVIEW_COMMENT: 'pull_request_review_comment'
};

// Create a frozen object to use as an enum
export const GithubEventType = Object.freeze(GITHUB_EVENT_TYPES);

// Helper to check if an event type is supported
export function isSupportedEventType(eventType) {
  return Object.values(GITHUB_EVENT_TYPES).includes(eventType);
}