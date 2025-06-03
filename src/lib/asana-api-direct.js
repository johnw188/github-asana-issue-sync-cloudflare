// Direct Asana API client using fetch for Cloudflare Workers

export class AsanaAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://app.asana.com/api/1.0';
  }

  async request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    console.log(`Asana API ${method} ${endpoint}`);
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Asana API error: ${response.status} - ${errorText}`);
      throw new Error(`Asana API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  // Task methods
  async createTask(taskData) {
    const endpoint = '/tasks';
    const result = await this.request('POST', endpoint, taskData);
    return result.data;
  }

  async updateTask(taskGid, taskData) {
    const endpoint = `/tasks/${taskGid}`;
    const result = await this.request('PUT', endpoint, taskData);
    return result.data;
  }

  async getTasksForProject(projectId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.limit) params.append('limit', opts.limit);
    if (opts.opt_fields) params.append('opt_fields', opts.opt_fields);
    
    const endpoint = `/projects/${projectId}/tasks?${params}`;
    const result = await this.request('GET', endpoint);
    
    const api = this; // Capture reference for nextPage method
    
    return {
      data: result.data,
      next_page: result.next_page,
      async nextPage() {
        if (result.next_page && result.next_page.uri) {
          const nextUrl = result.next_page.uri.replace('https://app.asana.com/api/1.0', '');
          const nextResult = await api.request('GET', nextUrl);
          return {
            data: nextResult.data,
            next_page: nextResult.next_page,
            async nextPage() {
              // Simplified - just return no more data for now
              return { data: null };
            }
          };
        }
        return { data: null };
      }
    };
  }

  async getProject(projectId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.opt_fields) params.append('opt_fields', opts.opt_fields);
    
    const endpoint = `/projects/${projectId}?${params}`;
    const result = await this.request('GET', endpoint);
    return result.data;
  }

  // Custom field methods
  async getCustomField(customFieldGid, opts = {}) {
    const params = new URLSearchParams();
    if (opts.opt_fields) params.append('opt_fields', opts.opt_fields);
    
    const endpoint = `/custom_fields/${customFieldGid}?${params}`;
    const result = await this.request('GET', endpoint);
    return result.data;
  }

  async createEnumOptionForCustomField(customFieldGid, optData) {
    const endpoint = `/custom_fields/${customFieldGid}/enum_options`;
    const result = await this.request('POST', endpoint, optData);
    return result.data;
  }

  // Attachment methods
  async createAttachment(attachmentData) {
    const endpoint = '/attachments';
    const result = await this.request('POST', endpoint, attachmentData);
    return result.data;
  }

  async createFileAttachment(parentGid, fileBuffer, fileName, contentType) {
    const url = `${this.baseUrl}/attachments`;
    
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('parent', parentGid);
    
    // Create a Blob from the buffer and append as file
    const blob = new Blob([fileBuffer], { type: contentType });
    formData.append('file', blob, fileName);
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
        // Don't set Content-Type - let browser set it with boundary for multipart
      },
      body: formData
    };

    console.log(`Asana API POST /attachments (file upload: ${fileName})`);
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Asana API error: ${response.status} - ${errorText}`);
      throw new Error(`Asana API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.data;
  }

  async getAttachmentsForObject(parentGid, opts = {}) {
    const params = new URLSearchParams();
    params.append('parent', parentGid);
    if (opts.opt_fields) params.append('opt_fields', opts.opt_fields);
    
    const endpoint = `/attachments?${params}`;
    const result = await this.request('GET', endpoint);
    return result;
  }

  // Story methods
  async getStoriesForTask(taskGid, opts = {}) {
    const params = new URLSearchParams();
    params.append('parent', taskGid);
    if (opts.opt_fields) params.append('opt_fields', opts.opt_fields);
    
    const endpoint = `/stories?${params}`;
    const result = await this.request('GET', endpoint);
    return result;
  }

  async deleteStory(storyGid) {
    const endpoint = `/stories/${storyGid}`;
    const result = await this.request('DELETE', endpoint);
    return result;
  }
}