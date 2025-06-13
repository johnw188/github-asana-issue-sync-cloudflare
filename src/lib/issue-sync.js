// Core issue synchronization logic - refactored to use two-step approach
import { issueToTask } from './util/issue-to-task.js';
import { ensureTaskExists } from './asana-task-ensure.js';
import { updateTaskDescription } from './asana-task-update-description.js';
import { markTaskComplete } from './asana-task-completed.js';
import { GithubEventType } from './constants.js';

export class IssueSync {
  constructor(asanaAPI, env) {
    this.asanaAPI = asanaAPI;
    this.env = env;
    this.projectId = env.ASANA_PROJECT_ID;
    
    if (!this.projectId) {
      throw new Error("ASANA_PROJECT_ID environment variable is required");
    }
  }
  
  async handleEvent(eventType, payload) {
    // Determine event type and extract common data
    const isPullRequest = eventType === GithubEventType.PULL_REQUEST || eventType === GithubEventType.PULL_REQUEST_REVIEW_COMMENT;
    const isComment = eventType === GithubEventType.ISSUE_COMMENT || eventType === GithubEventType.PULL_REQUEST_REVIEW_COMMENT;
    const source = isPullRequest ? payload.pull_request : payload.issue;
    const githubUrl = source?.html_url;
    
    if (!githubUrl) {
      throw new Error(`Unable to find GitHub ${isPullRequest ? 'pull request' : 'issue'} URL`);
    }
    
    // Step 1: Ensure task exists with proper custom fields
    const taskContent = await issueToTask(payload, this.env, isPullRequest ? 'pull_request' : undefined);
    const repository = payload.repository.name;
    const creator = source.user.login;
    
    const task = await ensureTaskExists(
      this.asanaAPI,
      this.projectId,
      githubUrl,
      repository,
      creator,
      this.env,
      isPullRequest ? 'PR' : 'Issue',
      taskContent.labels,
      taskContent.name,
      payload._cachedAsanaTaskGid // Pass cached GID if available
    );
    
    // Step 2: Update task description with markdown content and image processing
    await updateTaskDescription(
      this.asanaAPI,
      task.gid,
      taskContent.markdownContent,
      true // Enable image processing
    );
    
    // Step 3: Handle completion status (only for non-comment events)
    let result = task.permalink_url;
    if (!isComment) {
      const githubState = source.state; // 'open' or 'closed'
      const shouldBeCompleted = githubState === 'closed';
      const action = payload.action;
      
      if (action === "closed" || action === "reopened" || shouldBeCompleted !== undefined) {
        result = await markTaskComplete(this.asanaAPI, shouldBeCompleted, task.gid);
      }
    }
    
    // Determine the action name for response
    let actionName = payload.action || eventType;
    if (isComment && payload.action === 'created') {
      actionName = eventType === GithubEventType.PULL_REQUEST_REVIEW_COMMENT ? 'pr_comment_created' : 'comment_created';
    }
    
    return { status: 'processed', action: actionName, result, taskGid: task.gid };
  }
  
  async handleIssueEvent(payload) {
    return this.handleEvent('issues', payload);
  }
  
  async handleCommentEvent(payload) {
    return this.handleEvent('issue_comment', payload);
  }
  
  async handlePullRequestEvent(payload) {
    return this.handleEvent('pull_request', payload);
  }
  
  async handlePullRequestCommentEvent(payload) {
    return this.handleEvent('pull_request_comment', payload);
  }
}