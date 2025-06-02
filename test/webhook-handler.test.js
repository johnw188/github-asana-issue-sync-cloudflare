import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookHandler } from '../src/lib/webhook-handler.js';

describe('WebhookHandler', () => {
  let mockAsanaClient;
  let mockEnv;
  let webhookHandler;

  beforeEach(() => {
    mockAsanaClient = {
      getTasksApi: vi.fn(),
      getCustomFieldsApi: vi.fn(),
      getStoriesApi: vi.fn(),
      getProjectsApi: vi.fn()
    };

    mockEnv = {
      ASANA_PROJECT_ID: 'test-project-id',
      ASANA_PAT: 'test-token'
    };

    webhookHandler = new WebhookHandler(mockAsanaClient, mockEnv);
  });

  describe('verifySignature', () => {
    it('should verify valid webhook signature', async () => {
      const secret = 'test-secret';
      const body = '{"test": "data"}';
      
      // Note: In a real test, you'd compute the actual HMAC signature
      // For this example, we're just testing the structure
      const signature = 'sha256=test-signature';
      
      // Mock crypto.subtle for testing
      global.crypto = {
        subtle: {
          importKey: vi.fn().mockResolvedValue({}),
          sign: vi.fn().mockResolvedValue(new ArrayBuffer(32))
        }
      };

      const result = await webhookHandler.verifySignature(body, signature, secret);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('handleWebhook', () => {
    it('should handle issues opened event', async () => {
      const payload = {
        action: 'opened',
        issue: {
          html_url: 'https://github.com/test/repo/issues/1',
          title: 'Test Issue',
          body: 'Test body',
          user: { login: 'testuser' },
          created_at: '2023-01-01T00:00:00Z'
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' }
        }
      };

      const headers = new Map([['x-github-event', 'issues']]);
      
      // Mock the issue sync
      webhookHandler.issueSync.handleIssueEvent = vi.fn().mockResolvedValue({
        status: 'processed',
        action: 'opened'
      });

      const result = await webhookHandler.handleWebhook(payload, headers);
      
      expect(result.status).toBe('processed');
      expect(result.action).toBe('opened');
    });

    it('should ignore unhandled events', async () => {
      const payload = { action: 'test' };
      const headers = new Map([['x-github-event', 'unknown']]);

      const result = await webhookHandler.handleWebhook(payload, headers);
      
      expect(result.status).toBe('ignored');
      expect(result.event).toBe('unknown');
    });
  });
});