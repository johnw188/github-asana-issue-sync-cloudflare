// Main Cloudflare Worker entry point
import { AsanaAPI } from './lib/asana-api-direct.js';
import { WebhookHandler } from './lib/webhook-handler.js';

export default {
  async fetch(request, env, ctx) {
    // Initialize Asana API client with environment variables
    const asanaAPI = new AsanaAPI(env.ASANA_PAT);
    
    // Create webhook handler
    const webhookHandler = new WebhookHandler(asanaAPI, env);
    
    // Only handle POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    try {
      // Skip signature verification in development (when running locally)
      const isLocalDev = request.url.includes('localhost') || request.url.includes('127.0.0.1');
      
      // Verify webhook signature if secret is configured and not in local dev
      if (env.WEBHOOK_SECRET && !isLocalDev) {
        const signature = request.headers.get('x-hub-signature-256');
        if (!signature) {
          return new Response('Missing signature', { status: 401 });
        }
        
        const body = await request.text();
        const isValid = await webhookHandler.verifySignature(body, signature, env.WEBHOOK_SECRET);
        if (!isValid) {
          return new Response('Invalid signature', { status: 401 });
        }
        
        // Parse the body again since we consumed it
        const payload = JSON.parse(body);
        const result = await webhookHandler.handleWebhook(payload, request.headers);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // No signature verification (local dev or no secret configured)
        const payload = await request.json();
        const result = await webhookHandler.handleWebhook(payload, request.headers);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
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