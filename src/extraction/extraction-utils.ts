/**
 * Shared utilities for extraction modules.
 */

/**
 * Get the 1-based line number for a character offset in source text.
 *
 * Counts newline characters from the beginning of `content` up to `offset`
 * and returns the corresponding line number (starting at 1).
 */
export function getLineNumber(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') {
      line++;
    }
  }
  return line;
}

/**
 * Check whether the character at `index` is inside a line comment (// ...).
 * Only handles single-line comments.
 */
export function isLineCommented(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1;
  const linePrefix = content.slice(lineStart, index);
  return /\/\//.test(linePrefix);
}

/**
 * Extract the content between the opening brace at the given index and its matching closing brace.
 * Returns the content between the braces (exclusive), or null if no matching brace is found.
 */
export function extractBracedBlock(content: string, openBraceIndex: number): string | null {
  if (content[openBraceIndex] !== '{') return null;

  let depth = 0;
  for (let i = openBraceIndex; i < content.length; i++) {
    if (content[i] === '{') {
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i);
      }
    }
  }
  return null;
}
