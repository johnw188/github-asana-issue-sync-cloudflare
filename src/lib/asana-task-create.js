// Create Asana tasks from GitHub issues
import { getCustomFieldForProject } from "./util/custom-field-helper.js";

export async function createTask(asanaAPI, content, projectId, repository, creator, githubUrl, env) {
  // Get custom field IDs from environment
  const repositoryFieldGid = env.REPOSITORY_FIELD_ID;
  const creatorFieldGid = env.CREATOR_FIELD_ID;
  const githubUrlFieldGid = env.GITHUB_URL_FIELD_ID;
  
  let customFields = {};
  
  // Add repository field if configured
  if (repositoryFieldGid && repositoryFieldGid.trim() && repository) {
    try {
      const optionGid = await getCustomFieldForProject(asanaAPI, repositoryFieldGid, repository);
      if (optionGid) {
        customFields[repositoryFieldGid] = optionGid;
      }
    } catch (error) {
      console.error('Error with repository custom field:', error.message);
    }
  }
  
  // Add creator field if configured
  if (creatorFieldGid && creator) {
    customFields[creatorFieldGid] = `@${creator}`;
  }
  
  // Add GitHub URL field if configured
  if (githubUrlFieldGid && githubUrl) {
    customFields[githubUrlFieldGid] = githubUrl;
  }
  
  // Only add custom_fields if we have any
  const customFieldsWrapper = Object.keys(customFields).length > 0 
    ? { custom_fields: customFields }
    : {};
  
  const task_data = { 
    data: { 
      ...content, 
      projects: [projectId],
      ...customFieldsWrapper
    } 
  };

  try {
    const result = await asanaAPI.createTask(task_data);
    return result; // Return full task object
  } catch (error) {
    console.error('Error creating task:', error.message);
    throw error;
  }
}