// Ensure Asana task exists with proper configuration
import { getCustomFieldForProject, getMultiEnumOptionsForField } from "./util/custom-field-helper.js";

/**
 * Ensure a task exists in Asana with proper custom fields configured.
 * This function will look up existing tasks by GitHub URL, create a new task if needed,
 * and always ensure all custom fields are properly set.
 * 
 * @param {Object} asanaAPI - Asana API client
 * @param {string} projectId - Asana project ID  
 * @param {string} githubUrl - GitHub URL to use for lookup and custom field
 * @param {string} repository - Repository name for custom field
 * @param {string} creator - GitHub username for creator field
 * @param {Object} env - Environment variables
 * @param {string} type - Issue type ('Issue' or 'Pull Request')
 * @param {Array} labels - GitHub labels array
 * @param {string} taskName - Name for the task
 * @returns {Promise<Object>} Asana task object with gid
 */
export async function ensureTaskExists(asanaAPI, projectId, githubUrl, repository, creator, env, type = 'Issue', labels = [], taskName = '', cachedTaskGid = null) {
  try {
    console.log(`🔍 Ensuring task exists for: ${githubUrl}`);
    
    let existingTask = null;
    
    // If we have a cached task GID, verify it still exists
    if (cachedTaskGid) {
      existingTask = await verifyTaskExists(asanaAPI, cachedTaskGid);
      if (existingTask) {
        console.log(`✅ Using verified cached task: ${cachedTaskGid}`);
      } else {
        console.log(`⚠️  Cached task no longer exists: ${cachedTaskGid}`);
      }
    }
    
    // If no cached task or it no longer exists, try to find by GitHub URL
    if (!existingTask) {
      existingTask = await findTaskByGithubUrl(asanaAPI, projectId, githubUrl, env);
      if (existingTask) {
        console.log(`✅ Found existing task by GitHub URL: ${existingTask.gid}`);
      }
    }
    
    // If we have an existing task, update its custom fields
    if (existingTask) {
      await updateTaskCustomFields(asanaAPI, existingTask.gid, repository, creator, githubUrl, env, type, labels);
      return existingTask;
    }
    
    // Create new task if not found
    console.log(`📝 Creating new task: ${taskName}`);
    const newTask = await createTaskWithCustomFields(asanaAPI, projectId, repository, creator, githubUrl, env, type, labels, taskName);
    console.log(`✅ Created new task: ${newTask.gid}`);
    
    return newTask;
    
  } catch (error) {
    console.error('❌ Error ensuring task exists:', error.message);
    throw error;
  }
}

/**
 * Verify that a task still exists in Asana
 * @param {Object} asanaAPI - Asana API client
 * @param {string} taskGid - Task GID to verify
 * @returns {Promise<Object|null>} Task object if exists, null otherwise
 */
async function verifyTaskExists(asanaAPI, taskGid) {
  try {
    console.log(`🔍 Verifying task exists: ${taskGid}`);
    const task = await asanaAPI.getTask(taskGid, {
      opt_fields: 'gid,name'
    });
    
    if (task && task.gid) {
      console.log(`✅ Task verified: ${task.name}`);
      return { gid: task.gid, name: task.name };
    }
  } catch (error) {
    // Task doesn't exist or API error
    console.log(`⚠️  Task verification failed: ${error.message}`);
  }
  
  return null;
}

/**
 * Find existing task by GitHub URL custom field
 * @param {Object} asanaAPI - Asana API client
 * @param {string} projectId - Asana project ID
 * @param {string} githubUrl - GitHub URL to search for
 * @param {Object} env - Environment variables
 * @returns {Promise<Object|null>} Existing task or null if not found
 */
async function findTaskByGithubUrl(asanaAPI, projectId, githubUrl, env) {
  try {
    const githubUrlFieldGid = env.GITHUB_URL_FIELD_ID;
    
    if (!githubUrlFieldGid) {
      console.log('⚠️  No GITHUB_URL_FIELD_ID configured, cannot search for existing tasks');
      return null;
    }
    
    console.log(`🔍 Searching for existing task with GitHub URL: ${githubUrl}`);
    
    // Get all tasks in the project
    const opts = {
      project: projectId,
      opt_fields: 'gid,name,custom_fields.gid,custom_fields.text_value',
      limit: 100
    };
    
    const tasksResponse = await asanaAPI.getTasksForProject(projectId, opts);
    
    // Search through tasks for matching GitHub URL
    for (const task of tasksResponse.data) {
      if (task.custom_fields) {
        for (const field of task.custom_fields) {
          if (field.gid === githubUrlFieldGid && field.text_value === githubUrl) {
            console.log(`✅ Found existing task by GitHub URL: ${task.gid} - ${task.name}`);
            return task;
          }
        }
      }
    }
    
    console.log(`📝 No existing task found for GitHub URL: ${githubUrl}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error searching for existing task:', error.message);
    return null; // Continue with creation if search fails
  }
}

/**
 * Create a new task with all custom fields configured
 * @param {Object} asanaAPI - Asana API client
 * @param {string} projectId - Asana project ID
 * @param {string} repository - Repository name
 * @param {string} creator - GitHub username
 * @param {string} githubUrl - GitHub URL
 * @param {Object} env - Environment variables
 * @param {string} type - Issue type
 * @param {Array} labels - GitHub labels
 * @param {string} taskName - Task name
 * @returns {Promise<Object>} Created task object
 */
async function createTaskWithCustomFields(asanaAPI, projectId, repository, creator, githubUrl, env, type, labels, taskName) {
  const customFields = await buildCustomFields(repository, creator, githubUrl, env, type, labels, asanaAPI);
  
  const taskData = {
    data: {
      name: taskName,
      projects: [projectId],
      ...(Object.keys(customFields).length > 0 ? { custom_fields: customFields } : {})
    }
  };
  
  try {
    const result = await asanaAPI.createTask(taskData);
    return result;
  } catch (error) {
    console.error('❌ Error creating task:', error.message);
    throw error;
  }
}

/**
 * Update custom fields on an existing task
 * @param {Object} asanaAPI - Asana API client
 * @param {string} taskGid - Task GID to update
 * @param {string} repository - Repository name
 * @param {string} creator - GitHub username
 * @param {string} githubUrl - GitHub URL
 * @param {Object} env - Environment variables
 * @param {string} type - Issue type
 * @param {Array} labels - GitHub labels
 * @returns {Promise<void>}
 */
async function updateTaskCustomFields(asanaAPI, taskGid, repository, creator, githubUrl, env, type, labels) {
  try {
    console.log(`🔧 Updating custom fields for task: ${taskGid}`);
    
    const customFields = await buildCustomFields(repository, creator, githubUrl, env, type, labels, asanaAPI);
    
    if (Object.keys(customFields).length > 0) {
      const updateData = {
        data: {
          custom_fields: customFields
        }
      };
      
      await asanaAPI.updateTask(taskGid, updateData);
      console.log(`✅ Updated custom fields for task: ${taskGid}`);
    } else {
      console.log(`ℹ️  No custom fields to update for task: ${taskGid}`);
    }
    
  } catch (error) {
    console.error(`❌ Error updating custom fields for task ${taskGid}:`, error.message);
    throw error;
  }
}

/**
 * Build custom fields object for task creation/update
 * @param {string} repository - Repository name
 * @param {string} creator - GitHub username
 * @param {string} githubUrl - GitHub URL
 * @param {Object} env - Environment variables
 * @param {string} type - Issue type
 * @param {Array} labels - GitHub labels
 * @param {Object} asanaAPI - Asana API client
 * @returns {Promise<Object>} Custom fields object
 */
async function buildCustomFields(repository, creator, githubUrl, env, type, labels, asanaAPI) {
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
        console.log(`✅ Set repository field: ${repository}`);
      }
    } catch (error) {
      console.error('❌ Error with repository custom field:', error.message);
    }
  }
  
  // Add creator field if configured
  if (creatorFieldGid && creator) {
    customFields[creatorFieldGid] = `@${creator}`;
    console.log(`✅ Set creator field: @${creator}`);
  }
  
  // Add GitHub URL field if configured
  if (githubUrlFieldGid && githubUrl) {
    customFields[githubUrlFieldGid] = githubUrl;
    console.log(`✅ Set GitHub URL field: ${githubUrl}`);
  }
  
  // Add Issue Type field if configured
  if (issueTypeFieldGid && type) {
    try {
      const optionGid = await getCustomFieldForProject(asanaAPI, issueTypeFieldGid, type);
      if (optionGid) {
        customFields[issueTypeFieldGid] = optionGid;
        console.log(`✅ Set issue type field: ${type}`);
      }
    } catch (error) {
      console.error('❌ Error with issue type custom field:', error.message);
    }
  }
  
  // Add Labels field if configured and labels exist
  if (labelsFieldGid && labels && labels.length > 0) {
    try {
      console.log(`🏷️  Processing ${labels.length} labels...`);
      const labelNames = labels.map(label => label.name);
      const labelOptionGids = await getMultiEnumOptionsForField(asanaAPI, labelsFieldGid, labelNames);
      if (labelOptionGids.length > 0) {
        customFields[labelsFieldGid] = labelOptionGids;
        console.log(`✅ Set labels field: ${labelNames.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Error with labels custom field:', error.message);
    }
  }
  
  return customFields;
}