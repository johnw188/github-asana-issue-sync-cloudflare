// Fetch and format pull request file changes
export async function getPullRequestFiles(owner, repoName, number, githubToken) {
  if (!githubToken) {
    return '';
  }

  try {
    const filesUrl = `https://api.github.com/repos/${owner}/${repoName}/pulls/${number}/files`;
    const response = await fetch(filesUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cloudflare-github-asana-sync'
      }
    });
    
    if (!response.ok) {
      console.error("Error fetching PR files:", response.status, response.statusText);
      return `\n\n_Error fetching file changes from GitHub (${response.status}: ${response.statusText})_\n`;
    }

    const files = await response.json();
    
    if (files.length === 0) {
      return '';
    }

    let fileChangesText = `\n\n<hr><h2>Files Changed (${files.length})</h2>\n\n`;
    
    // Group files by status
    const addedFiles = files.filter(f => f.status === 'added');
    const modifiedFiles = files.filter(f => f.status === 'modified');
    const deletedFiles = files.filter(f => f.status === 'removed');
    const renamedFiles = files.filter(f => f.status === 'renamed');
    
    if (addedFiles.length > 0) {
      fileChangesText += `**Added (${addedFiles.length}):**\n`;
      addedFiles.forEach(file => {
        const fileLink = file.blob_url ? `[${file.filename}](${file.blob_url})` : `\`${file.filename}\``;
        fileChangesText += `- ${fileLink} (+${file.additions} lines)\n`;
      });
      fileChangesText += '\n';
    }
    
    if (modifiedFiles.length > 0) {
      fileChangesText += `**Modified (${modifiedFiles.length}):**\n`;
      modifiedFiles.forEach(file => {
        const fileLink = file.blob_url ? `[${file.filename}](${file.blob_url})` : `\`${file.filename}\``;
        fileChangesText += `- ${fileLink} (+${file.additions}/-${file.deletions} lines)\n`;
      });
      fileChangesText += '\n';
    }
    
    if (renamedFiles.length > 0) {
      fileChangesText += `**Renamed (${renamedFiles.length}):**\n`;
      renamedFiles.forEach(file => {
        const oldFileLink = file.blob_url ? `[${file.previous_filename}](${file.blob_url})` : `\`${file.previous_filename}\``;
        const newFileLink = file.blob_url ? `[${file.filename}](${file.blob_url})` : `\`${file.filename}\``;
        fileChangesText += `- ${oldFileLink} → ${newFileLink}\n`;
      });
      fileChangesText += '\n';
    }
    
    if (deletedFiles.length > 0) {
      fileChangesText += `**Deleted (${deletedFiles.length}):**\n`;
      deletedFiles.forEach(file => {
        // For deleted files, blob_url might not be available, so we'll use filename as fallback
        const fileLink = file.blob_url ? `[${file.filename}](${file.blob_url})` : `\`${file.filename}\``;
        fileChangesText += `- ${fileLink} (-${file.deletions} lines)\n`;
      });
      fileChangesText += '\n';
    }
    
    // Add summary
    const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
    const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
    fileChangesText += `**Summary:** +${totalAdditions}/-${totalDeletions} lines across ${files.length} files\n`;
    
    return fileChangesText;
    
  } catch (error) {
    console.error("Error fetching PR files:", error);
    return `\n\n_Error fetching file changes from GitHub_\n`;
  }
}