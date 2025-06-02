// GitHub webhook handler
import { IssueSync } from './issue-sync.js';

export class WebhookHandler {
  constructor(asanaClient, env) {
    this.asanaClient = asanaClient;
    this.env = env;
    this.issueSync = new IssueSync(asanaClient, env);
  }
  
  async verifySignature(body, signature, secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expectedSignature = 'sha256=' + Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return signature === expectedSignature;
  }
  
  async handleWebhook(payload, headers) {
    const eventType = headers.get('x-github-event');
    const action = payload.action;
    
    console.log(`Received ${eventType} event with action: ${action}`);
    
    // Handle issues events
    if (eventType === 'issues') {
      return await this.issueSync.handleIssueEvent(payload);
    }
    
    // Handle pull request events
    if (eventType === 'pull_request') {
      return await this.issueSync.handlePullRequestEvent(payload);
    }
    
    // Handle issue comments
    if (eventType === 'issue_comment' && action === 'created') {
      return await this.issueSync.handleCommentEvent(payload);
    }
    
    // Handle pull request review comments
    if (eventType === 'pull_request_review_comment' && action === 'created') {
      return await this.issueSync.handlePullRequestCommentEvent(payload);
    }
    
    // Return success for unhandled events
    return { status: 'ignored', event: eventType, action };
  }
}