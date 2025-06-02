// @ts-check

import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * HTML in Asana is extremely limited. If a rich text string contains any <p> or <br> tags,
 * the request will fail.
 *
 * Only H1 and H2 tags are supported, so we map h1-h3 => h1 and h4-h6 => h2
 *
 * @link https://forum.asana.com/t/changes-are-coming-to-rich-text-html-notes-and-html-text-in-asana/113434/9
 *
 * @param {string} rawMd Markdown source
 * @returns {string} Rendered HTML string, with Asana-unsafe tags removed
 */
export function renderMarkdown(rawMd) {
  const rendered = micromark(rawMd, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });

  const cleaned = rendered
    .replace(/<\/p>\s*/g, "\n\n")
    .replace(/<br>\s*/g, "\n")
    .replace(/<p>/g, "")
    .replace(/<(\/?)h[123]>\s*/g, "<$1h1>")
    .replace(/<(\/?)h[456]>\s*/g, "<$1h2>")
    .replace(/<input\s+type="checkbox"\s+disabled=""\s+checked=""\s*\/>/g, "[x]") // Replace checked checkboxes
    .replace(/<input\s+type="checkbox"\s+disabled=""\s*\/>/g, "[ ]") // Replace unchecked checkboxes
    .replace(/href="((?!https?:\/\/)[^"]+)"/g, 'href="https://$1"') // Add https:// to links without protocol
    // Convert <pre><code> to just <pre> (Asana doesn't support nested code in pre)
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
      // Remove trailing newline if present
      const trimmedCode = code.replace(/\n$/, '');
      return `<pre>${trimmedCode}</pre>`;
    })
    // Clean up extra newlines inside blockquotes
    .replace(/<blockquote>\n/g, '<blockquote>')
    .replace(/\n<\/blockquote>/g, '</blockquote>')
    .trim();

  // Final cleanup pass
  const final = `<body>${cleaned}</body>`
    // Remove newlines after <hr> tags
    .replace(/<hr>\n+/g, '<hr>');

  return final;
}