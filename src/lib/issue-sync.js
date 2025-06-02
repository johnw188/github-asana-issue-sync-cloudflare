// Core issue synchronization logic
import { issueToTask } from './util/issue-to-task.js';
import { createTask } from './asana-task-create.js';
import { findTaskContaining } from './asana-task-find.js';
import { markTaskComplete } from './asana-task-completed.js';
import { updateTaskDescription } from './asana-task-update-description.js';

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
    
    if (action === "opened") {
      const taskContent = await issueToTask(payload, this.env);
      const repository = payload.repository.name;
      const creator = payload.issue.user.login;
      const githubUrl = payload.issue.html_url;
      
      result = await createTask(
        this.asanaAPI,
        taskContent,
        this.projectId,
        repository,
        creator,
        githubUrl,
        this.env
      );
    } else if (action === "edited") {
      const theTask = await findTaskContaining(this.asanaAPI, issueUrl, this.projectId, this.env);
      
      if (!theTask) {
        // Task was deleted, recreate it
        const taskContent = await issueToTask(payload, this.env);
        const repository = payload.repository.name;
        const creator = payload.issue.user.login;
        const githubUrl = payload.issue.html_url;
        
        result = await createTask(
          this.asanaAPI,
          taskContent,
          this.projectId,
          repository,
          creator,
          githubUrl,
          this.env
        );
      } else {
        const taskContent = await issueToTask(payload, this.env);
        result = await updateTaskDescription(this.asanaAPI, theTask.gid, taskContent);
      }
    } else if (action === "closed" || action === "reopened") {
      const theTask = await findTaskContaining(this.asanaAPI, issueUrl, this.projectId, this.env);
      
      if (!theTask) {
        // Task was deleted, recreate it and then mark its status
        const taskContent = await issueToTask(payload, this.env);
        const repository = payload.repository.name;
        const creator = payload.issue.user.login;
        const githubUrl = payload.issue.html_url;
        
        const newTask = await createTask(
          this.asanaAPI,
          taskContent,
          this.projectId,
          repository,
          creator,
          githubUrl,
          this.env
        );
        
        const completed = action === "closed";
        result = await markTaskComplete(this.asanaAPI, completed, newTask.gid);
      } else {
        const completed = action === "closed";
        result = await markTaskComplete(this.asanaAPI, completed, theTask.gid);
      }
    }
    
    return { status: 'processed', action, result };
  }
  
  async handleCommentEvent(payload) {
    const issueUrl = payload.issue?.html_url;
    
    if (!issueUrl) {
      throw new Error("Unable to find GitHub issue URL");
    }
    
    const theTask = await findTaskContaining(this.asanaAPI, issueUrl, this.projectId, this.env);
    let result;
    
    if (!theTask) {
      // Task was deleted, recreate it with full conversation
      const taskContent = await issueToTask(payload, this.env);
      const repository = payload.repository.name;
      const creator = payload.issue.user.login;
      const githubUrl = payload.issue.html_url;
      
      result = await createTask(
        this.asanaAPI,
        taskContent,
        this.projectId,
        repository,
        creator,
        githubUrl,
        this.env
      );
    } else {
      // Update task description to include the new comment
      const taskContent = await issueToTask(payload, this.env);
      result = await updateTaskDescription(this.asanaAPI, theTask.gid, taskContent);
    }
    
    return { status: 'processed', action: 'comment_created', result };
  }
}