// Find existing Asana tasks by GitHub issue URL

export async function findTaskContaining(asanaAPI, needle, projectId, env) {
  // Full project scan for GitHub issue URL
  console.log("Using full project scan to find task");
  
  let taskRequests = 1;
  let tasksSearched = 0;
  let foundTask = false;

  const opts = {
    limit: 10,
    opt_fields: "name,created_at,modified_at,notes,html_notes,permalink_url,gid",
  };
  
  try {
    console.log('Getting tasks for project:', projectId);
    let query = await asanaAPI.getTasksForProject(projectId, opts);
    console.log('Query result:', query ? 'success' : 'failed');
    let tasks = query?.data || [];

    while (!foundTask && tasks && tasks.length > 0) {
      for (let n = 0; n < tasks.length; n++) {
        // Look for the specific pattern "GitHub:</strong> <a href="[needle]">[needle]</a>"
        // This ensures we only match the header link, not comment links
        const pattern = `GitHub:</strong> <a href="${needle}">${needle}</a>`;
        const search = tasks[n].html_notes?.indexOf(pattern) || -1;
        tasksSearched++;
        
        if (search > -1) {
          foundTask = tasks[n];
          break;
        }
      }

      if (foundTask) {
        break;
      }

      // Get next page
      if (query.next_page && query.next_page.uri) {
        try {
          query = await query.nextPage();
          tasks = query?.data || null;
          taskRequests++;
        } catch (pageError) {
          console.error('Error getting next page:', pageError.message);
          break;
        }
      } else {
        break;
      }
    }

    console.log(
      "Done! Searched",
      tasksSearched,
      "tasks across",
      taskRequests,
      "requests."
    );

    return foundTask;
  } catch (error) {
    console.error('Error searching for task:', error.message);
    throw error;
  }
}