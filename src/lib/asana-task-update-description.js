// Update Asana task descriptions
import { getCustomFieldForProject, getMultiEnumOptionsForField } from "./util/custom-field-helper.js";

export async function updateTaskDescription(asanaAPI, task_gid, content) {
  try {
    const result = await asanaAPI.updateTask(task_gid, { data: content });
    console.log({ result });
    return result.permalink_url;
  } catch (error) {
    console.error('Error updating task description:', error.message);
    
    // If it's an XML parsing error, log the HTML content that caused it
    if (error.message.includes('xml_parsing_error') || error.message.includes('XML is invalid')) {
      console.error('❌ XML PARSING ERROR - Attempted HTML content:');
      console.error('='.repeat(80));
      if (content.html_notes) {
        console.error(content.html_notes);
      } else if (content.notes) {
        console.error('Notes field:', content.notes);
      } else {
        console.error('No HTML content found');
      }
      console.error('='.repeat(80));
      console.error('Content object:', JSON.stringify(content, null, 2));
    }
    
    throw error;
  }
}

export async function updateTaskWithCustomFields(asanaAPI, task_gid, content, repository, creator, githubUrl, env, type = 'Issue', labels = []) {
  try {
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
        console.log('Processing labels for update:', labels);
        const labelNames = labels.map(label => label.name);
        console.log('Label names for update:', labelNames);
        const labelOptionGids = await getMultiEnumOptionsForField(asanaAPI, labelsFieldGid, labelNames);
        console.log('Label option GIDs for update:', labelOptionGids);
        if (labelOptionGids.length > 0) {
          customFields[labelsFieldGid] = labelOptionGids;
          console.log('Set labels custom field for update');
        }
      } catch (error) {
        console.error('Error with labels custom field:', error.message);
      }
    } else {
      console.log('Labels field not processed for update:', { labelsFieldGid, labels: labels?.length || 0 });
    }
    
    // Build update data with content and custom fields
    const updateData = {
      data: {
        ...content,
        ...(Object.keys(customFields).length > 0 ? { custom_fields: customFields } : {})
      }
    };
    
    const result = await asanaAPI.updateTask(task_gid, updateData);
    console.log({ result });
    return result.permalink_url;
  } catch (error) {
    console.error('Error updating task with custom fields:', error.message);
    
    // If it's an XML parsing error, log the HTML content that caused it
    if (error.message.includes('xml_parsing_error') || error.message.includes('XML is invalid')) {
      console.error('❌ XML PARSING ERROR - Attempted HTML content:');
      console.error('='.repeat(80));
      if (content.html_notes) {
        console.error(content.html_notes);
      } else if (content.notes) {
        console.error('Notes field:', content.notes);
      } else {
        console.error('No HTML content found in update data');
      }
      console.error('='.repeat(80));
      console.error('Full update data:', JSON.stringify(updateData, null, 2));
    }
    
    throw error;
  }
}