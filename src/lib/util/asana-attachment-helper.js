// Helper functions for creating Asana attachments from external URLs

/**
 * Generate a hash-based filename for an image URL to enable deduplication
 * @param {string} imageUrl - The URL of the image
 * @param {string} contentType - MIME type of the image
 * @param {string} altText - Optional alt text for the image
 * @returns {string} Hash-based filename
 */
function generateHashedFilename(imageUrl, contentType, altText = '') {
  // Create a simple hash of the URL (not cryptographically secure, just for deduplication)
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i++) {
    const char = imageUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive hex string
  const hashString = Math.abs(hash).toString(16).padStart(8, '0');
  
  // Use alt text if provided, otherwise use "image"
  const baseName = altText ? altText.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() : 'image';
  
  // Get file extension from content type
  const extensionMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg', 
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };
  
  const extension = extensionMap[contentType] || '.png';
  
  return `${baseName}-${hashString}${extension}`;
}

/**
 * Check if an image with the same URL hash already exists as an attachment
 * @param {Object} asanaAPI - Asana API client
 * @param {string} parentGid - The GID of the parent task
 * @param {string} hashedFilename - The hash-based filename to look for
 * @returns {Promise<Object|null>} Existing attachment or null if not found
 */
async function findExistingImageAttachment(asanaAPI, parentGid, hashedFilename) {
  try {
    console.log(`🔍 Checking for existing attachment: ${hashedFilename}`);
    
    // Get existing attachments for this task
    const attachment_opts = {
      'parent': parentGid,
      'opt_fields': 'gid,name,resource_subtype'
    };
    
    const attachments_response = await asanaAPI.getAttachmentsForObject(parentGid, attachment_opts);
    const existing_attachments = attachments_response.data || [];
    
    // Look for an attachment with the same hashed filename
    const existingAttachment = existing_attachments.find(att => 
      att.name === hashedFilename && att.resource_subtype === 'asana'
    );
    
    if (existingAttachment) {
      console.log(`✅ Found existing attachment: ${existingAttachment.gid}`);
      return existingAttachment;
    }
    
    console.log(`📝 No existing attachment found for: ${hashedFilename}`);
    return null;
    
  } catch (error) {
    console.error(`❌ Error checking existing attachments:`, error.message);
    return null; // Continue with upload if check fails
  }
}

/**
 * Download an image and upload it as a file attachment to Asana (with deduplication)
 * @param {Object} asanaAPI - Asana API client
 * @param {string} imageUrl - The URL of the image to download
 * @param {string} parentGid - The GID of the parent task
 * @param {string} imageName - Optional name for the image attachment
 * @returns {Promise<Object>} The created or existing attachment object
 */
export async function createImageFileAttachment(asanaAPI, imageUrl, parentGid, imageName = null) {
  try {
    console.log(`📎 Processing image: ${imageUrl}`);
    console.log(`   Parent: ${parentGid}`);
    
    // Step 1: Download the image to get content type
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    
    // Step 2: Generate hash-based filename for deduplication
    const hashedFilename = generateHashedFilename(imageUrl, contentType, imageName);
    
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Hash-based filename: ${hashedFilename}`);
    
    // Step 3: Check if we already have this image as an attachment
    const existingAttachment = await findExistingImageAttachment(asanaAPI, parentGid, hashedFilename);
    
    if (existingAttachment) {
      console.log(`♻️  Reusing existing attachment: ${existingAttachment.gid}`);
      return { attachment: existingAttachment, wasCreated: false, filename: hashedFilename };
    }
    
    // Step 4: Upload as new file attachment
    console.log(`   Downloaded ${imageBuffer.byteLength} bytes`);
    console.log(`   Uploading new attachment...`);
    
    const attachment = await asanaAPI.createFileAttachment(parentGid, imageBuffer, hashedFilename, contentType);
    
    console.log(`✅ Created new file attachment: ${attachment.gid}`);
    return { attachment, wasCreated: true, filename: hashedFilename };
    
  } catch (error) {
    console.error(`❌ Failed to process image attachment for ${imageUrl}:`, error.message);
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
    const createdAttachmentGids = []; // Track newly created attachments
    const createdAttachmentFilenames = []; // Track filenames for story cleanup
    
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
          const attachmentResult = await createImageFileAttachment(
            asanaAPI, 
            image.src, 
            parentGid, 
            image.alt || null
          );
          
          // Track if this was a newly created attachment
          if (attachmentResult.wasCreated) {
            createdAttachmentGids.push(attachmentResult.attachment.gid);
            createdAttachmentFilenames.push(attachmentResult.filename);
          }
          
          // Replace img tag with Asana inline image reference
          const asanaImgTag = `<img data-asana-gid="${attachmentResult.attachment.gid}">`;
          updatedContent = updatedContent.replace(image.fullMatch, asanaImgTag);
          
          console.log(`✅ Replaced image: ${image.src} -> attachment:${attachmentResult.attachment.gid}`);
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
      
      // Clean up attachment stories only for newly created attachments
      if (createdAttachmentGids.length > 0) {
        await cleanupAttachmentStories(asanaAPI, parentGid, createdAttachmentGids, createdAttachmentFilenames);
      }
    }
    
    return updatedContent;
    
  } catch (error) {
    console.error('❌ Error processing images:', error.message);
    return htmlContent; // Return original content if processing fails
  }
}

/**
 * Clean up attachment stories for specific newly created attachments
 * @param {Object} asanaAPI - Asana API client
 * @param {string} taskGid - The GID of the task
 * @param {Array<string>} attachmentGids - Array of attachment GIDs to clean up stories for
 * @param {Array<string>} attachmentFilenames - Array of hashed filenames to match in story text
 * @returns {Promise<void>}
 */
async function cleanupAttachmentStories(asanaAPI, taskGid, attachmentGids, attachmentFilenames = []) {
  try {
    console.log(`🧹 Cleaning up attachment stories for ${attachmentGids.length} newly created attachments`);
    
    // Get stories for the task
    const storiesOpts = {
      'opt_fields': 'gid,resource_subtype,text,type,target'
    };
    
    const storiesResponse = await asanaAPI.getStoriesForTask(taskGid, storiesOpts);
    const stories = storiesResponse.data || [];
    
    // Debug: Log all stories to see what we have
    console.log(`   Found ${stories.length} total stories:`);
    stories.forEach((story, index) => {
      console.log(`     ${index + 1}. ${story.resource_subtype || 'unknown'} - "${story.text || 'no text'}" - target: ${story.target?.gid || 'none'}`);
    });
    
    // Filter for attachment stories that match our newly created attachments
    const targetStories = stories.filter(story => {
      // Check if it's an attachment story
      if (story.resource_subtype !== 'attachment_added') {
        return false;
      }
      
      // Check if any of our hashed filenames appear in the story text
      if (story.text && attachmentFilenames.length > 0) {
        for (const filename of attachmentFilenames) {
          if (story.text.includes(filename)) {
            return true;
          }
        }
      }
      
      return false;
    });
    
    console.log(`   Found ${targetStories.length} attachment stories to delete for newly created attachments`);
    
    // Delete targeted attachment stories
    for (const story of targetStories) {
      try {
        await asanaAPI.deleteStory(story.gid);
        console.log(`   ✅ Deleted attachment story: ${story.gid} (for attachment: ${story.target.gid})`);
      } catch (error) {
        console.error(`   ❌ Failed to delete story ${story.gid}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error cleaning up attachment stories:`, error.message);
    // Don't throw - this is cleanup, not critical functionality
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