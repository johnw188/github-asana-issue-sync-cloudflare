// Update Asana task descriptions with image processing support
import { renderMarkdown } from "./util/markdown-to-asana-html.js";

/**
 * Update task description from markdown content with optional image processing
 * @param {Object} asanaAPI - Asana API client
 * @param {string} taskGid - Task GID to update
 * @param {string} markdownContent - Raw markdown content
 * @param {boolean} processImages - Whether to process images as attachments
 * @returns {Promise<string>} Task permalink URL
 */
export async function updateTaskDescription(asanaAPI, taskGid, markdownContent, processImages = true) {
  let html_notes = null;
  
  try {
    console.log(`📝 Updating task description: ${taskGid}`);
    
    // Convert markdown to Asana HTML with optional image processing
    const renderOptions = processImages ? { asanaAPI, taskGid } : {};
    html_notes = await renderMarkdown(markdownContent, renderOptions);
    
    // Update task with the rendered content
    const updateData = {
      data: {
        html_notes: html_notes
      }
    };
    
    console.log(`📄 HTML being sent to Asana for task ${taskGid}:`);
    console.log('='.repeat(80));
    console.log(html_notes);
    console.log('='.repeat(80));
    
    const result = await asanaAPI.updateTask(taskGid, updateData);
    
    console.log(`✅ Updated task description: ${taskGid}`);
    return result.permalink_url;
    
  } catch (error) {
    console.error(`❌ Error updating task description for ${taskGid}:`, error.message);
    
    // If it's an XML parsing error, log both markdown and HTML content
    if (error.message.includes('xml_parsing_error') || error.message.includes('XML is invalid')) {
      console.error('❌ XML PARSING ERROR - Full debugging info:');
      console.error('='.repeat(80));
      console.error('📝 ORIGINAL MARKDOWN CONTENT:');
      console.error(markdownContent || 'No markdown content');
      console.error('='.repeat(80));
      console.error('🔄 CONVERTED HTML CONTENT:');
      console.error(html_notes || 'No HTML content generated');
      console.error('='.repeat(80));
      
      // Fallback: Try updating with plain text notes instead of HTML
      console.log('⚠️  Falling back to plain text notes due to XML parsing error...');
      try {
        const fallbackData = {
          data: {
            notes: markdownContent
          }
        };
        
        const fallbackResult = await asanaAPI.updateTask(taskGid, fallbackData);
        console.log(`✅ Updated task description using plain text fallback: ${taskGid}`);
        return fallbackResult.permalink_url;
      } catch (fallbackError) {
        console.error('❌ Fallback to plain text also failed:', fallbackError.message);
        throw fallbackError;
      }
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
      
      // Fallback: Try updating with plain text notes instead of HTML
      if (content.html_notes) {
        console.log('⚠️  Falling back to plain text notes due to XML parsing error...');
        try {
          // Replace html_notes with notes in the content
          const fallbackContent = { ...content };
          delete fallbackContent.html_notes;
          fallbackContent.notes = content.notes || 'No content available';
          
          const fallbackData = {
            data: {
              ...fallbackContent,
              ...(Object.keys(customFields).length > 0 ? { custom_fields: customFields } : {})
            }
          };
          
          const fallbackResult = await asanaAPI.updateTask(task_gid, fallbackData);
          console.log(`✅ Updated task using plain text fallback: ${task_gid}`);
          return fallbackResult.permalink_url;
        } catch (fallbackError) {
          console.error('❌ Fallback to plain text also failed:', fallbackError.message);
          throw fallbackError;
        }
      }
    }
    
    throw error;
  }
}