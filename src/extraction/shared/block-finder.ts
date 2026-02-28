/**
 * Shared Block-Finding Utilities
 *
 * Provides reusable utilities for finding code block boundaries.
 * Used by language extractors to determine where functions, classes,
 * and other code blocks start and end.
 */

/**
 * Comment syntax configuration for a language.
 */
export interface CommentSyntax {
  /** Single-line comment prefix (e.g., '//' for JS, '#' for Python) */
  readonly lineComment: string;
  /** Block comment start delimiter (e.g., '/*') */
  readonly blockCommentStart: string;
  /** Block comment end delimiter (e.g., '*​/') */
  readonly blockCommentEnd: string;
}

/**
 * JavaScript/TypeScript comment syntax.
 */
export const JS_COMMENT_SYNTAX: CommentSyntax = {
  lineComment: '//',
  blockCommentStart: '/*',
  blockCommentEnd: '*/',
};

/**
 * Result of finding a closing brace, containing both the character index
 * and line number of the match.
 */
interface BlockEndResult {
  /** Character index of the closing brace, or -1 if not found */
  readonly charIndex: number;
  /** 1-indexed line number of the closing brace, or estimated line if not found */
  readonly lineNumber: number;
}

/**
 * Core traversal logic for finding the closing brace of a brace-delimited block.
 * Tracks brace depth while skipping comments, string literals, and regex literals.
 *
 * @param content - Full file content
 * @param startIndex - Character index to start searching from (should be at or before the opening brace)
 * @returns Both the character index and line number of the closing brace
 */
function findClosingBrace(content: string, startIndex: number): BlockEndResult {
  let depth = 0;
  let foundOpenBrace = false;
  let lineNumber = content.slice(0, startIndex).split('\n').length;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];

    if (char === '\n') {
      lineNumber++;
      continue;
    }

    // Skip single-line comments
    if (char === '/' && content[i + 1] === '/') {
      const newlineIdx = content.indexOf('\n', i);
      if (newlineIdx === -1) break;
      i = newlineIdx - 1; // will be incremented by for loop
      continue;
    }

    // Skip multi-line comments
    if (char === '/' && content[i + 1] === '*') {
      const endIdx = content.indexOf('*/', i + 2);
      if (endIdx === -1) break;
      // Count newlines inside the comment
      for (let j = i; j < endIdx + 2; j++) {
        if (content[j] === '\n') lineNumber++;
      }
      i = endIdx + 1; // skip past */
      continue;
    }

    // Skip string literals (single-quoted, double-quoted, template literals)
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      i++;
      while (i < content.length) {
        if (content[i] === '\\') {
          i++; // skip escaped character
        } else if (content[i] === quote) {
          break;
        } else if (content[i] === '\n') {
          lineNumber++;
        }
        i++;
      }
      continue;
    }

    // Skip regex literals
    if (char === '/' && isRegexStart(content, i)) {
      i++;
      while (i < content.length) {
        if (content[i] === '\\') {
          i++; // skip escaped character
        } else if (content[i] === '/') {
          break;
        } else if (content[i] === '\n') {
          // Regex can't span lines; this isn't a regex
          break;
        }
        i++;
      }
      continue;
    }

    if (char === '{') {
      depth++;
      foundOpenBrace = true;
    } else if (char === '}') {
      depth--;
      if (foundOpenBrace && depth === 0) {
        return { charIndex: i, lineNumber };
      }
    }
  }

  // Not found
  return { charIndex: -1, lineNumber };
}

/**
 * Find the end line of a brace-delimited code block starting at a given position
 * by tracking brace depth. Works for brace-based languages (JS, Go, Java, Rust, C#).
 *
 * @param content - Full file content
 * @param startIndex - Character index to start searching from (should be at or before the opening brace)
 * @returns The 1-indexed line number where the block ends
 */
export function findBlockEnd(content: string, startIndex: number): number {
  const result = findClosingBrace(content, startIndex);
  if (result.charIndex === -1) {
    // If we couldn't find the end, estimate based on content length
    return result.lineNumber + 10;
  }
  return result.lineNumber;
}

/**
 * Find the character index of the closing brace of a brace-delimited code block.
 * Similar to findBlockEnd but returns the character index instead of the line number.
 *
 * @param content - Full file content
 * @param startIndex - Character index to start searching from (should be at or before the opening brace)
 * @returns The character index of the closing brace, or -1 if not found
 */
export function findBlockEndIndex(content: string, startIndex: number): number {
  return findClosingBrace(content, startIndex).charIndex;
}

/**
 * Heuristic to determine if a '/' at the given position starts a regex literal.
 * Returns true if the '/' is preceded by a token that cannot end an expression
 * (e.g., operator, punctuation, keyword, or start of line).
 */
function isRegexStart(content: string, index: number): boolean {
  // Look backwards past whitespace to find the preceding non-whitespace character
  let j = index - 1;
  while (j >= 0 && (content[j] === ' ' || content[j] === '\t')) {
    j--;
  }
  if (j < 0) return true; // start of content

  const prevChar = content[j];

  // After these characters, '/' starts a regex (operators, punctuation)
  if ('=({[;,!&|?:+->~^%*/\n'.includes(prevChar)) {
    return true;
  }

  // After 'return', 'typeof', etc. it's also a regex, but for our purposes
  // the simple character check covers the common cases.
  return false;
}

/**
 * Get 1-indexed line number from a character index.
 *
 * @param content - Full file content
 * @param index - Character index
 * @returns 1-indexed line number
 */
export function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/**
 * Check if a character position is inside a string literal or comment.
 *
 * @param content - Full file content
 * @param index - Character index to check
 * @param commentSyntax - Comment syntax for the language (defaults to JS/TS)
 * @returns true if the position is inside a comment
 */
export function isInsideStringOrComment(
  content: string,
  index: number,
  commentSyntax: CommentSyntax = JS_COMMENT_SYNTAX,
): boolean {
  const beforeIndex = content.slice(0, index);

  // Check for single-line comment
  const lastNewline = beforeIndex.lastIndexOf('\n');
  const lineContent = beforeIndex.slice(lastNewline + 1);
  if (lineContent.includes(commentSyntax.lineComment)) {
    const commentStart = lineContent.indexOf(commentSyntax.lineComment);
    const positionInLine = index - lastNewline - 1;
    if (positionInLine > commentStart) {
      return true;
    }
  }

  // Multi-line comment check
  if (commentSyntax.blockCommentStart && commentSyntax.blockCommentEnd) {
    const lastCommentStart = beforeIndex.lastIndexOf(commentSyntax.blockCommentStart);
    const lastCommentEnd = beforeIndex.lastIndexOf(commentSyntax.blockCommentEnd);
    if (lastCommentStart > lastCommentEnd) {
      return true;
    }
  }

  return false;
}

/**
 * Find the end of an indentation-based block (for Python).
 * Returns the 1-indexed line number where the block ends.
 *
 * The block ends when a non-empty, non-comment line has indentation
 * at or below the starting level.
 *
 * @param content - Full file content
 * @param startIndex - Character index of the block's definition line
 * @returns 1-indexed line number of the last line in the block
 */
export function findIndentationBlockEnd(content: string, startIndex: number): number {
  const lines = content.split('\n');
  const startLine = content.slice(0, startIndex).split('\n').length - 1;

  // Get the indentation of the definition line
  const defLine = lines[startLine] || '';
  const defIndent = defLine.match(/^(\s*)/)?.[1].length ?? 0;

  // Look for the first non-empty line with indentation <= defIndent after the def line
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines and comment-only lines
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (lineIndent <= defIndent) {
      // The block ended at the previous non-empty line
      for (let j = i - 1; j > startLine; j--) {
        if (lines[j].trim() !== '') {
          return j + 1; // 1-indexed
        }
      }
      return startLine + 2; // At minimum, one line after start
    }
  }

  // Block extends to end of file - find last non-empty line
  for (let i = lines.length - 1; i > startLine; i--) {
    if (lines[i].trim() !== '') {
      return i + 1; // 1-indexed
    }
  }
  return lines.length;
}
