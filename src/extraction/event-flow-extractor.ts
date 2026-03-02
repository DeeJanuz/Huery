/**
 * Event Flow Extractor
 *
 * Extracts event emissions and subscriptions from JavaScript/TypeScript code.
 * Works heuristically using regex pattern matching for speed.
 *
 * Detects:
 * - Node.js EventEmitter patterns (.emit, .on, .once, .addListener)
 * - Socket.io patterns (socket.emit, socket.on)
 * - DOM events (.addEventListener, .dispatchEvent with CustomEvent)
 * - RxJS patterns (.subscribe, .next)
 * - Pub/sub patterns (.publish)
 * - Redux patterns (.dispatch)
 */

import { getLineNumber } from './extraction-utils.js';

/**
 * Represents a detected event flow in source code.
 */
export interface ExtractedEventFlow {
  /** The name of the event, extracted from the first string argument */
  readonly eventName: string;
  /** Whether the code emits or subscribes to the event */
  readonly direction: 'emit' | 'subscribe';
  /** The detected framework or event system */
  readonly framework: string;
  /** The 1-based line number where the event flow was found */
  readonly lineNumber: number;
}

/**
 * Patterns for detecting event flows.
 *
 * Each pattern captures:
 * - An optional receiver (for socket.io detection)
 * - The method name
 * - The first string argument (event name), if present
 */
const EVENT_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly getFramework: (receiver: string) => string;
  readonly direction: 'emit' | 'subscribe';
  readonly extractEventName: (match: RegExpExecArray) => string;
}> = [
  // .dispatchEvent(new CustomEvent('name' — must come before generic .dispatch
  {
    pattern: /(\w+)\.dispatchEvent\(\s*new\s+CustomEvent\(\s*(['"])([^'"]*)\2/g,
    getFramework: () => 'dom-events',
    direction: 'emit',
    extractEventName: (match) => match[3],
  },
  // .dispatch( — Redux (must come after dispatchEvent to avoid conflicts)
  {
    pattern: /(\w+)\.dispatch\(/g,
    getFramework: () => 'redux',
    direction: 'emit',
    extractEventName: () => '',
  },
  // .emit('eventName'
  {
    pattern: /(\w+)\.emit\(\s*(['"])([^'"]*)\2/g,
    getFramework: (receiver) => (receiver === 'socket' ? 'socket.io' : 'node-events'),
    direction: 'emit',
    extractEventName: (match) => match[3],
  },
  // .addEventListener('eventName'
  {
    pattern: /(\w+)\.addEventListener\(\s*(['"])([^'"]*)\2/g,
    getFramework: () => 'dom-events',
    direction: 'subscribe',
    extractEventName: (match) => match[3],
  },
  // .addListener('eventName'
  {
    pattern: /(\w+)\.addListener\(\s*(['"])([^'"]*)\2/g,
    getFramework: () => 'node-events',
    direction: 'subscribe',
    extractEventName: (match) => match[3],
  },
  // .once('eventName'
  {
    pattern: /(\w+)\.once\(\s*(['"])([^'"]*)\2/g,
    getFramework: (receiver) => (receiver === 'socket' ? 'socket.io' : 'node-events'),
    direction: 'subscribe',
    extractEventName: (match) => match[3],
  },
  // .on('eventName'
  {
    pattern: /(\w+)\.on\(\s*(['"])([^'"]*)\2/g,
    getFramework: (receiver) => (receiver === 'socket' ? 'socket.io' : 'node-events'),
    direction: 'subscribe',
    extractEventName: (match) => match[3],
  },
  // .subscribe(
  {
    pattern: /(\w+)\.subscribe\(/g,
    getFramework: () => 'rxjs',
    direction: 'subscribe',
    extractEventName: () => '',
  },
  // .next(
  {
    pattern: /(\w+)\.next\(/g,
    getFramework: () => 'rxjs',
    direction: 'emit',
    extractEventName: () => '',
  },
  // .publish('topic'
  {
    pattern: /(\w+)\.publish\(\s*(['"])([^'"]*)\2/g,
    getFramework: () => 'pub-sub',
    direction: 'emit',
    extractEventName: (match) => match[3],
  },
];

/**
 * Check whether a line is a comment line (starts with // or is within a block comment marker).
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

/**
 * Extract event flows from JavaScript/TypeScript source code.
 *
 * Scans for emit and subscribe patterns across multiple event frameworks
 * (Node.js EventEmitter, Socket.io, DOM events, RxJS, pub/sub, Redux).
 *
 * @param body - The source code to analyze
 * @returns Array of detected event flows
 */
export function extractEventFlows(body: string): ExtractedEventFlow[] {
  if (!body) {
    return [];
  }

  const flows: ExtractedEventFlow[] = [];
  const lines = body.split('\n');

  // Build a set of line numbers that are comment lines (1-based)
  const commentLineNumbers = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) {
      commentLineNumbers.add(i + 1);
    }
  }

  for (const eventPattern of EVENT_PATTERNS) {
    const regex = new RegExp(eventPattern.pattern.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(body)) !== null) {
      const lineNumber = getLineNumber(body, match.index);

      // Skip matches on comment lines
      if (commentLineNumbers.has(lineNumber)) {
        continue;
      }

      const receiver = match[1];
      const framework = eventPattern.getFramework(receiver);
      const eventName = eventPattern.extractEventName(match);

      flows.push({
        eventName,
        direction: eventPattern.direction,
        framework,
        lineNumber,
      });
    }
  }

  // Sort by line number for deterministic output
  flows.sort((a, b) => a.lineNumber - b.lineNumber);

  return flows;
}
