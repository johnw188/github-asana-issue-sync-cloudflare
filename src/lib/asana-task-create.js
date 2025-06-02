// Create Asana tasks from GitHub issues
import { getCustomFieldForProject, getMultiEnumOptionsForField } from "./util/custom-field-helper.js";

export async function createTask(asanaAPI, content, projectId, repository, creator, githubUrl, env, type = 'Issue', labels = []) {
  // Get custom field IDs from environment
  const repositoryFieldGid = env.REPOSITORY_FIELD_ID;
  const creatorFieldGid = env.CREATOR_FIELD_ID;
  const githubUrlFieldGid = env.GITHUB_URL_FIELD_ID;
  const issueTypeFieldGid = env.ISSUE_TYPE_FIELD_ID;
  const labelsFieldGid = env.LABELS_FIELD_ID;
  
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
  
  // Add Issue Type field if configured
  if (issueTypeFieldGid && type) {
    try {
      const optionGid = await getCustomFieldForProject(asanaAPI, issueTypeFieldGid, type);
      if (optionGid) {
        customFields[issueTypeFieldGid] = optionGid;
      }
    } catch (error) {
      console.error('Error with issue type custom field:', error.message);
    }
  }
  
  // Add Labels field if configured and labels exist
  if (labelsFieldGid && labels && labels.length > 0) {
    try {
      const labelNames = labels.map(label => label.name);
      const labelOptionGids = await getMultiEnumOptionsForField(asanaAPI, labelsFieldGid, labelNames);
      if (labelOptionGids.length > 0) {
        customFields[labelsFieldGid] = labelOptionGids;
      }
    } catch (error) {
      console.error('Error with labels custom field:', error.message);
    }
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