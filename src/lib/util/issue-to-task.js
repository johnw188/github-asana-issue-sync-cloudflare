// Convert GitHub Issue to Asana Task format
import { renderMarkdown } from "./markdown-to-asana-html.js";

export async function issueToTask(payload, env) {
  const { title, number, body, html_url, user, created_at } = payload.issue;
  const repository = payload.repository;
  const owner = repository.owner;
  const repoName = repository.name;

  const name = title;
  
  // Build the conversation text
  const createdDate = new Date(created_at);
  const pstDate = createdDate.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
  const pstTime = createdDate.toLocaleTimeString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  const ukTime = createdDate.toLocaleTimeString('en-GB', { 
    timeZone: 'Europe/London', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  let conversationText = `**Created by:** [@${user.login}](${user.html_url}) • ${pstDate} at ${pstTime} PST (${ukTime} GMT)\n`;
  conversationText += `**GitHub:** [${html_url}](${html_url})<hr>\n\n`;
  conversationText += `${body || '_No description provided_'}`;

  // Get all comments if this is not an issue creation
  if (payload.action !== "opened") {
    try {
      // Use GitHub API to fetch comments
      if (env.GITHUB_TOKEN) {
        const commentsUrl = `https://api.github.com/repos/${owner.login}/${repoName}/issues/${number}/comments`;
        const response = await fetch(commentsUrl, {
          headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'cloudflare-github-asana-sync'
          }
        });
        
        if (response.ok) {
          const comments = await response.json();
          
          if (comments.length > 0) {
            conversationText += `<hr><h2>Comments</h2>\n\n`;
            
            for (const comment of comments) {
              const username = comment.user?.login || 'ghost';
              const userUrl = comment.user?.html_url || `https://github.com/${username}`;
              
              const commentDateTime = new Date(comment.created_at);
              const commentPstDate = commentDateTime.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
              const commentPstTime = commentDateTime.toLocaleTimeString('en-US', { 
                timeZone: 'America/Los_Angeles', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              });
              const commentUkTime = commentDateTime.toLocaleTimeString('en-GB', { 
                timeZone: 'Europe/London', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              });
              
              conversationText += `**[@${username}](${comment.html_url})** • ${commentPstDate} at ${commentPstTime} PST (${commentUkTime} GMT)\n`;
              conversationText += `${comment.body}\n\n`;
            }
          }
        } else {
          console.error("Error fetching comments:", response.status, response.statusText);
          conversationText += `\n\n_Error fetching comments from GitHub (${response.status}: ${response.statusText})_\n`;
        }
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      conversationText += `\n\n_Error fetching comments from GitHub_\n`;
    }
  }
  
  const html_notes = renderMarkdown(conversationText);

  return { name, html_notes };
}