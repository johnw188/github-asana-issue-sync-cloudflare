// Mark Asana tasks as completed/incomplete

export async function markTaskComplete(asanaAPI, status, task_gid) {
  try {
    const result = await asanaAPI.updateTask(task_gid, {
      data: { completed: !!status }
    });

    console.log({ status, task_gid, result });
    return result;
  } catch (error) {
    console.log("error in markTaskComplete", error);
    console.error(error.message);
    throw error;
  }
}