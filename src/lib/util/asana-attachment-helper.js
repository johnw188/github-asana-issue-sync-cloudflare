// Helper functions for creating Asana attachments from external URLs

/**
 * Download an image and upload it as a file attachment to Asana
 * @param {Object} asanaAPI - Asana API client
 * @param {string} imageUrl - The URL of the image to download
 * @param {string} parentGid - The GID of the parent task
 * @param {string} imageName - Optional name for the image attachment
 * @returns {Promise<Object>} The created attachment object
 */
export async function createImageFileAttachment(asanaAPI, imageUrl, parentGid, imageName = null) {
  try {
    console.log(`📎 Downloading and uploading image: ${imageUrl}`);
    console.log(`   Parent: ${parentGid}`);
    
    // Step 1: Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    
    // Step 2: Extract filename and ensure it has proper extension
    const defaultName = imageName || extractImageNameFromUrl(imageUrl);
    const fileName = ensureImageExtension(defaultName, contentType);
    
    console.log(`   Downloaded ${imageBuffer.byteLength} bytes`);
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   File name: ${fileName}`);
    
    // Step 3: Upload as file attachment to Asana
    const attachment = await asanaAPI.createFileAttachment(parentGid, imageBuffer, fileName, contentType);
    
    console.log(`✅ Created file attachment: ${attachment.gid}`);
    return attachment;
    
  } catch (error) {
    console.error(`❌ Failed to create file attachment for ${imageUrl}:`, error.message);
    throw error;
  }
}

/**
 * Extract a reasonable filename from an image URL
 * @param {string} imageUrl - The image URL
 * @returns {string} A filename for the image
 */
function extractImageNameFromUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop();
    
    // If we get a proper filename with extension, use it
    if (filename && filename.includes('.') && filename.length > 1) {
      return filename;
    }
    
    // For GitHub user-content URLs or other complex URLs, create a descriptive name
    if (imageUrl.includes('github')) {
      return `github-image-${Date.now()}.png`;
    }
    
    // Generic fallback
    return `image-${Date.now()}.png`;
    
  } catch (error) {
    // If URL parsing fails, use a generic name
    return `image-${Date.now()}.png`;
  }
}

/**
 * Ensure filename has proper extension based on content type
 * @param {string} filename - Original filename
 * @param {string} contentType - MIME type of the image
 * @returns {string} Filename with proper extension
 */
function ensureImageExtension(filename, contentType) {
  const extensionMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg', 
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };
  
  const expectedExtension = extensionMap[contentType] || '.png';
  
  // If filename already has an extension, keep it
  if (filename.includes('.')) {
    return filename;
  }
  
  // Add the appropriate extension
  return filename + expectedExtension;
}

/**
 * Extract all image URLs from markdown content
 * @param {string} markdownContent - The markdown content
 * @returns {Array<Object>} Array of image objects with url and alt text
 */
export function extractImagesFromMarkdown(markdownContent) {
  const images = [];
  
  // Match markdown image syntax: ![alt text](url "optional title")
  const markdownImageRegex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
  
  let match;
  while ((match = markdownImageRegex.exec(markdownContent)) !== null) {
    const [, altText, url, title] = match;
    
    // Only process HTTP/HTTPS URLs (skip data URLs, relative paths, etc.)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      images.push({
        url: url,
        altText: altText || '',
        title: title || '',
        originalMatch: match[0]
      });
    }
  }
  
  console.log(`🖼️  Found ${images.length} images in markdown content`);
  return images;
}

/**
 * Check if an image is inside a table by examining the HTML context
 * @param {string} htmlContent - The full HTML content
 * @param {string} imageMatch - The full img tag match
 * @returns {boolean} True if image is inside a table
 */
function isImageInTable(htmlContent, imageMatch) {
  const imageIndex = htmlContent.indexOf(imageMatch);
  if (imageIndex === -1) return false;
  
  // Look backwards for opening table tag
  const beforeImage = htmlContent.substring(0, imageIndex);
  const afterImage = htmlContent.substring(imageIndex + imageMatch.length);
  
  // Find the last opening <table> tag before the image
  const lastTableStart = beforeImage.lastIndexOf('<table');
  if (lastTableStart === -1) return false;
  
  // Find the first closing </table> tag after the image  
  const nextTableEnd = afterImage.indexOf('</table>');
  if (nextTableEnd === -1) return false;
  
  // Check if there's a closing table tag between the last opening and the image
  const tableCloseBeforeImage = beforeImage.substring(lastTableStart).indexOf('</table>');
  
  // If no closing table tag found between opening and image, the image is inside the table
  return tableCloseBeforeImage === -1;
}

/**
 * Process images in content by creating attachments and updating HTML
 * @param {string} htmlContent - The HTML content with image tags
 * @param {Object} asanaAPI - Asana API client  
 * @param {string} parentGid - The GID of the parent task
 * @returns {Promise<string>} Updated HTML content with Asana attachment references
 */
export async function processImagesInHtml(htmlContent, asanaAPI, parentGid) {
  if (!htmlContent || !parentGid) {
    return htmlContent;
  }

  try {
    // Find all img tags with src attributes
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let match;
    
    while ((match = imgRegex.exec(htmlContent)) !== null) {
      const [fullMatch, src] = match;
      
      // Only process HTTP/HTTPS URLs
      if (src.startsWith('http://') || src.startsWith('https://')) {
        const isInTable = isImageInTable(htmlContent, fullMatch);
        images.push({
          fullMatch,
          src,
          alt: extractAltFromImgTag(fullMatch),
          isInTable
        });
      }
    }
    
    if (images.length === 0) {
      return htmlContent;
    }
    
    console.log(`🖼️  Processing ${images.length} images for Asana attachments`);
    
    let updatedContent = htmlContent;
    
    // Process each image
    for (const image of images) {
      try {
        if (image.isInTable) {
          // Convert images in tables to links (inline images don't work in <pre> blocks)
          console.log(`🔗 Converting table image to link: ${image.src}`);
          const linkText = image.alt || 'Image';
          const imageLink = `<a href="${image.src}">[${linkText}]</a>`;
          updatedContent = updatedContent.replace(image.fullMatch, imageLink);
          
        } else {
          // Download and upload regular images as file attachments
          const attachment = await createImageFileAttachment(
            asanaAPI, 
            image.src, 
            parentGid, 
            image.alt || null
          );
          
          // Replace img tag with Asana inline image reference
          const asanaImgTag = `<img data-asana-gid="${attachment.gid}">`;
          updatedContent = updatedContent.replace(image.fullMatch, asanaImgTag);
          
          console.log(`✅ Replaced image: ${image.src} -> attachment:${attachment.gid}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to process image ${image.src}:`, error.message);
        // Convert to text link if upload fails
        console.log(`   Converting to link for: ${image.src}`);
        const linkText = image.alt || 'Image';
        const imageLink = `<a href="${image.src}">[${linkText}]</a>`;
        updatedContent = updatedContent.replace(image.fullMatch, imageLink);
      }
    }
    
    // Add delay after image uploads to allow Asana to process dimensions
    if (images.length > 0) {
      console.log(`⏱️  Adding 1-second delay for Asana to process ${images.length} image dimensions...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return updatedContent;
    
  } catch (error) {
    console.error('❌ Error processing images:', error.message);
    return htmlContent; // Return original content if processing fails
  }
}

/**
 * Extract alt text from an img tag
 * @param {string} imgTag - The full img tag HTML
 * @returns {string} The alt text or empty string
 */
function extractAltFromImgTag(imgTag) {
  const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
  return altMatch ? altMatch[1] : '';
}