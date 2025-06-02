// Update Asana task descriptions

export async function updateTaskDescription(asanaAPI, task_gid, content) {
  try {
    const result = await asanaAPI.updateTask(task_gid, { data: content });
    console.log({ result });
    return result.permalink_url;
  } catch (error) {
    console.error('Error updating task description:', error.message);
    throw error;
  }
}