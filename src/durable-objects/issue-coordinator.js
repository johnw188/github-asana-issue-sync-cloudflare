// Durable Object for coordinating operations on a single GitHub issue
import { AsanaAPI } from '../lib/asana-api-direct.js';
import { IssueSync } from '../lib/issue-sync.js';

export class IssueCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // Initialize state
    this.state.blockConcurrencyWhile(async () => {
      this.cachedTaskGid = await this.state.storage.get('asanaTaskGid');
    });
  }

  async fetch(request) {
    try {
      const { eventType, payload, headers } = await request.json();
      
      // Process the event
      const result = await this.handleEvent(eventType, payload, headers);
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error in IssueCoordinator:', error);
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleEvent(eventType, payload, headers) {
    // Use blockConcurrencyWhile to ensure operations are processed sequentially
    return await this.state.blockConcurrencyWhile(async () => {
      console.log(`🔄 Processing event: ${eventType} for issue: ${this.getIssueUrl(payload)}`);
      
      const maxRetries = 2;
      const retryDelays = [5000, 10000]; // 5 seconds, then 10 seconds
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Initialize Asana API client
          const asanaAPI = new AsanaAPI(this.env.ASANA_PAT);
          const issueSync = new IssueSync(asanaAPI, this.env);
          
          // Pass the cached task GID if we have one
          if (this.cachedTaskGid) {
            console.log(`📌 Passing cached task GID: ${this.cachedTaskGid}`);
            payload._cachedAsanaTaskGid = this.cachedTaskGid;
          }
          
          // Process the event using the unified handler
          const result = await issueSync.handleEvent(eventType, payload);
          
          // Store the task GID if we created/found a task
          if (result.taskGid && result.taskGid !== this.cachedTaskGid) {
            this.cachedTaskGid = result.taskGid;
            await this.state.storage.put('asanaTaskGid', result.taskGid);
            console.log(`💾 Stored Asana task GID: ${result.taskGid}`);
          }
          
          // Success! Return the result
          return result;
          
        } catch (error) {
          console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);
          
          // If this was the last attempt, throw the error
          if (attempt === maxRetries) {
            console.error(`🚫 All ${maxRetries + 1} attempts failed. Giving up.`);
            throw error;
          }
          
          // Wait before retrying
          const delay = retryDelays[attempt];
          console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    });
  }


  getIssueUrl(payload) {
    // Extract the GitHub URL from the payload
    if (payload.issue?.html_url) {
      return payload.issue.html_url;
    } else if (payload.pull_request?.html_url) {
      return payload.pull_request.html_url;
    }
    return 'unknown';
  }
}