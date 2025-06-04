// Core issue synchronization logic - refactored to use two-step approach
import { issueToTask } from './util/issue-to-task.js';
import { ensureTaskExists } from './asana-task-ensure.js';
import { updateTaskDescription } from './asana-task-update-description.js';
import { markTaskComplete } from './asana-task-completed.js';

export class IssueSync {
  constructor(asanaAPI, env) {
    this.asanaAPI = asanaAPI;
    this.env = env;
    this.projectId = env.ASANA_PROJECT_ID;
    
    if (!this.projectId) {
      throw new Error("ASANA_PROJECT_ID environment variable is required");
    }
  }
  
  async handleIssueEvent(payload) {
    const { action } = payload;
    const issueUrl = payload.issue?.html_url;
    
    if (!issueUrl) {
      throw new Error("Unable to find GitHub issue URL");
    }
    
    let result;
    
    // Step 1: Ensure task exists with proper custom fields
    const taskContent = await issueToTask(payload, this.env);
    const repository = payload.repository.name;
    const creator = payload.issue.user.login;
    const githubUrl = payload.issue.html_url;
    
    const task = await ensureTaskExists(
      this.asanaAPI,
      this.projectId,
      githubUrl,
      repository,
      creator,
      this.env,
      'Issue',
      taskContent.labels,
      taskContent.name
    );
    
    // Step 2: Update task description with markdown content and image processing
    await updateTaskDescription(
      this.asanaAPI,
      task.gid,
      taskContent.markdownContent,
      true // Enable image processing
    );
    
    // Step 3: Handle completion status based on GitHub issue state
    const githubState = payload.issue.state; // 'open' or 'closed'
    const shouldBeCompleted = githubState === 'closed';
    
    if (action === "closed" || action === "reopened" || shouldBeCompleted !== undefined) {
      result = await markTaskComplete(this.asanaAPI, shouldBeCompleted, task.gid);
    } else {
      result = task.permalink_url;
    }
    
    return { status: 'processed', action, result, taskGid: task.gid };
  }
  
  async handleCommentEvent(payload) {
    const issueUrl = payload.issue?.html_url;
    
    if (!issueUrl) {
      throw new Error("Unable to find GitHub issue URL");
    }
    
    // Step 1: Ensure task exists with proper custom fields
    const taskContent = await issueToTask(payload, this.env);
    const repository = payload.repository.name;
    const creator = payload.issue.user.login;
    const githubUrl = payload.issue.html_url;
    
    const task = await ensureTaskExists(
      this.asanaAPI,
      this.projectId,
      githubUrl,
      repository,
      creator,
      this.env,
      'Issue',
      taskContent.labels,
      taskContent.name
    );
    
    // Step 2: Update task description to include the new comment
    const result = await updateTaskDescription(
      this.asanaAPI,
      task.gid,
      taskContent.markdownContent,
      true // Enable image processing
    );
    
    return { status: 'processed', action: 'comment_created', result, taskGid: task.gid };
  }
  
  async handlePullRequestEvent(payload) {
    const { action } = payload;
    const prUrl = payload.pull_request?.html_url;
    
    if (!prUrl) {
      throw new Error("Unable to find GitHub pull request URL");
    }
    
    let result;
    
    // Step 1: Ensure task exists with proper custom fields
    const taskContent = await issueToTask(payload, this.env, 'pull_request');
    const repository = payload.repository.name;
    const creator = payload.pull_request.user.login;
    const githubUrl = payload.pull_request.html_url;
    
    const task = await ensureTaskExists(
      this.asanaAPI,
      this.projectId,
      githubUrl,
      repository,
      creator,
      this.env,
      'PR',
      taskContent.labels,
      taskContent.name
    );
    
    // Step 2: Update task description with markdown content and image processing
    await updateTaskDescription(
      this.asanaAPI,
      task.gid,
      taskContent.markdownContent,
      true // Enable image processing
    );
    
    // Step 3: Handle completion status based on GitHub PR state
    const githubState = payload.pull_request.state; // 'open' or 'closed'
    const shouldBeCompleted = githubState === 'closed';
    
    if (action === "closed" || action === "reopened" || shouldBeCompleted !== undefined) {
      result = await markTaskComplete(this.asanaAPI, shouldBeCompleted, task.gid);
    } else {
      result = task.permalink_url;
    }
    
    return { status: 'processed', action, result, taskGid: task.gid };
  }
  
  async handlePullRequestCommentEvent(payload) {
    const prUrl = payload.pull_request?.html_url;
    
    if (!prUrl) {
      throw new Error("Unable to find GitHub pull request URL");
    }
    
    // Step 1: Ensure task exists with proper custom fields
    const taskContent = await issueToTask(payload, this.env, 'pull_request');
    const repository = payload.repository.name;
    const creator = payload.pull_request.user.login;
    const githubUrl = payload.pull_request.html_url;
    
    const task = await ensureTaskExists(
      this.asanaAPI,
      this.projectId,
      githubUrl,
      repository,
      creator,
      this.env,
      'PR',
      taskContent.labels,
      taskContent.name
    );
    
    // Step 2: Update task description to include the new comment
    const result = await updateTaskDescription(
      this.asanaAPI,
      task.gid,
      taskContent.markdownContent,
      true // Enable image processing
    );
    
    return { status: 'processed', action: 'pr_comment_created', result, taskGid: task.gid };
  }
}