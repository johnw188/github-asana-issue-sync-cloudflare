// Simplified markdown to HTML conversion for Cloudflare Workers
// Since micromark may not work in Workers environment, we'll use a basic implementation

export function renderMarkdown(rawMd) {
  // Basic markdown to HTML conversion
  let html = rawMd
    // Headers
    .replace(/^### (.*$)/gim, '<h2>$1</h2>')
    .replace(/^## (.*$)/gim, '<h1>$1</h1>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    
    // Code blocks (simplified)
    .replace(/```([^`]+)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    
    // Horizontal rules
    .replace(/^---$/gim, '<hr>')
    .replace(/^<hr>$/gim, '<hr>')
    
    // Line breaks
    .replace(/\n\n/g, '\n')
    .replace(/\n/g, '<br>');

  // Clean up for Asana compatibility
  const cleaned = html
    .replace(/<\/p>\s*/g, "\n\n")
    .replace(/<br>\s*/g, "\n")
    .replace(/<p>/g, "")
    .replace(/<(\/?)h[123]>\s*/g, "<$1h1>")
    .replace(/<(\/?)h[456]>\s*/g, "<$1h2>")
    .replace(/href="((?!https?:\/\/)[^"]+)"/g, 'href="https://$1"')
    .trim();

  return `<body>${cleaned}</body>`;
}