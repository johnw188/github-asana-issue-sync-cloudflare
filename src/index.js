// Main Cloudflare Worker entry point
import { verifyWebhookSignature } from './lib/util/verify-signature.js';
import { isSupportedEventType } from './lib/constants.js';

export { IssueCoordinator } from './durable-objects/issue-coordinator.js';

export default {
  async fetch(request, env, ctx) {
    // Only handle POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    try {
      // Skip signature verification in development (when running locally)
      const isLocalDev = request.url.includes('localhost') || request.url.includes('127.0.0.1');
      
      // Parse the body and verify signature
      let payload;
      if (env.WEBHOOK_SECRET && !isLocalDev) {
        const signature = request.headers.get('x-hub-signature-256');
        if (!signature) {
          return new Response('Missing signature', { status: 401 });
        }
        
        const body = await request.text();
        
        // Verify webhook signature
        const isValid = await verifyWebhookSignature(body, signature, env.WEBHOOK_SECRET);
        if (!isValid) {
          return new Response('Invalid signature', { status: 401 });
        }
        
        payload = JSON.parse(body);
      } else {
        // No signature verification (local dev or no secret configured)
        payload = await request.json();
      }
      
      // Extract issue/PR URL to determine which Durable Object to use
      const issueUrl = payload.issue?.html_url || payload.pull_request?.html_url;
      if (!issueUrl) {
        return new Response('No issue or PR URL found in webhook', { status: 400 });
      }
      
      // Get the Durable Object ID based on the issue URL
      const id = env.ISSUE_COORDINATOR.idFromName(issueUrl);
      const durableObject = env.ISSUE_COORDINATOR.get(id);
      
      // Get the event type from GitHub
      const eventType = request.headers.get('x-github-event');
      
      // Validate it's a supported event type
      if (!isSupportedEventType(eventType)) {
        return new Response(`Unsupported event type: ${eventType}`, { status: 400 });
      }
      
      // Route the webhook to the Durable Object
      const doRequest = new Request('https://internal/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          payload,
          headers: Object.fromEntries(request.headers.entries())
        })
      });
      
      const result = await durableObject.fetch(doRequest);
      return result;
    } catch (error) {
      console.error('Error processing webhook:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};