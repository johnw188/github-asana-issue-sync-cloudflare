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
    
    // Log the first file to see what fields are available
    if (files.length > 0) {
      console.log('Sample PR file data:', JSON.stringify(files[0], null, 2));
    }
    
    if (files.length === 0) {
      return '';
    }

    let fileChangesText = `\n\n<hr><h2>Files Changed (${files.length})</h2>\n\n`;
    
    // Group files by status
    const addedFiles = files.filter(f => f.status === 'added');
    const modifiedFiles = files.filter(f => f.status === 'modified');
    const deletedFiles = files.filter(f => f.status === 'removed');
    const renamedFiles = files.filter(f => f.status === 'renamed');
    
    // Helper function to create PR diff link with SHA256 hash of filename
    const createPRDiffLink = async (filename) => {
      try {
        // Calculate SHA256 hash of the filename for the diff anchor
        const encoder = new TextEncoder();
        const data = encoder.encode(filename);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return `https://github.com/${owner}/${repoName}/pull/${number}/files#diff-${hashHex}`;
      } catch (error) {
        console.error('Error creating diff hash:', error);
        // Fallback to general PR files view
        return `https://github.com/${owner}/${repoName}/pull/${number}/files`;
      }
    };

    if (addedFiles.length > 0) {
      fileChangesText += `**Added (${addedFiles.length}):**\n`;
      for (const file of addedFiles) {
        const fileLink = `[${file.filename}](${await createPRDiffLink(file.filename)})`;
        fileChangesText += `- ${fileLink} (+${file.additions} lines)\n`;
      }
      fileChangesText += '\n';
    }
    
    if (modifiedFiles.length > 0) {
      fileChangesText += `**Modified (${modifiedFiles.length}):**\n`;
      for (const file of modifiedFiles) {
        const fileLink = `[${file.filename}](${await createPRDiffLink(file.filename)})`;
        fileChangesText += `- ${fileLink} (+${file.additions}/-${file.deletions} lines)\n`;
      }
      fileChangesText += '\n';
    }
    
    if (renamedFiles.length > 0) {
      fileChangesText += `**Renamed (${renamedFiles.length}):**\n`;
      for (const file of renamedFiles) {
        const oldFileLink = `[${file.previous_filename}](${await createPRDiffLink(file.previous_filename)})`;
        const newFileLink = `[${file.filename}](${await createPRDiffLink(file.filename)})`;
        fileChangesText += `- ${oldFileLink} → ${newFileLink}\n`;
      }
      fileChangesText += '\n';
    }
    
    if (deletedFiles.length > 0) {
      fileChangesText += `**Deleted (${deletedFiles.length}):**\n`;
      for (const file of deletedFiles) {
        const fileLink = `[${file.filename}](${await createPRDiffLink(file.filename)})`;
        fileChangesText += `- ${fileLink} (-${file.deletions} lines)\n`;
      }
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