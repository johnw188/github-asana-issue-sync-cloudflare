// Asana API client for Cloudflare Workers
import { ApiClient, TasksApi, CustomFieldsApi, StoriesApi, ProjectsApi } from "asana";

export class AsanaClient {
  constructor(accessToken) {
    if (!accessToken) {
      throw new Error("Asana access token is required");
    }
    
    // Create a new client instance to avoid global state issues
    this.client = new ApiClient();
    const token = this.client.authentications["token"];
    token.accessToken = accessToken;
    
    this.tasksApi = new TasksApi(this.client);
    this.customFieldsApi = new CustomFieldsApi(this.client);
    this.storiesApi = new StoriesApi(this.client);
    this.projectsApi = new ProjectsApi(this.client);
  }
  
  getTasksApi() {
    return this.tasksApi;
  }
  
  getCustomFieldsApi() {
    return this.customFieldsApi;
  }
  
  getStoriesApi() {
    return this.storiesApi;
  }
  
  getProjectsApi() {
    return this.projectsApi;
  }
}