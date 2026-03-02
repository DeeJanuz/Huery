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
