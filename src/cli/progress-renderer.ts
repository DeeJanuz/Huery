/**
 * Progress Renderer
 *
 * Renders live analysis progress to the terminal.
 * TTY mode: Uses ANSI escape codes to overwrite previous output.
 * Non-TTY mode: Single log line per phase transition.
 */

import type { ProgressCallback, AnalysisProgress } from '@/application/analysis-progress.js';

interface ProgressRenderer {
  readonly onProgress: ProgressCallback;
  readonly finish: () => void;
}

const PHASE_LABELS: Record<AnalysisProgress['phase'], string> = {
  'analyzing': 'Analyzing codebase...',
  'deep-analysis': 'Deep analysis...',
  'manifests': 'Generating manifests...',
};

function renderTtyBlock(progress: AnalysisProgress): string {
  const lines: string[] = [];
  const header = PHASE_LABELS[progress.phase];
  lines.push(header);

  if (progress.phase === 'manifests') {
    return lines.join('\n') + '\n';
  }

  if (progress.phase === 'deep-analysis' && progress.deepAnalysisStep) {
    const stepLine = progress.deepAnalysisProgress
      ? `  Step:          ${progress.deepAnalysisStep} (${progress.deepAnalysisProgress})`
      : `  Step:          ${progress.deepAnalysisStep}`;
    lines.push(stepLine);
  }

  const scanned = progress.filesProcessed + progress.filesSkipped;
  const pct = progress.totalFiles > 0
    ? Math.round((scanned / progress.totalFiles) * 100)
    : 0;
  lines.push(`  Scanning:      ${scanned}/${progress.totalFiles} (${pct}%)`);
  lines.push(`  Code files:    ${progress.filesProcessed} (${progress.filesSkipped} non-source skipped)`);
  lines.push(`  Code units:    ${progress.codeUnitsExtracted}`);
  lines.push(`  Patterns:      ${progress.patternsDetected}`);
  lines.push(`  Dependencies:  ${progress.dependenciesFound}`);

  if (progress.currentFile) {
    lines.push(`  Current:       ${progress.currentFile}`);
  }

  return lines.join('\n') + '\n';
}

function createTtyRenderer(): ProgressRenderer {
  let lastLineCount = 0;

  function clearPrevious(): string {
    if (lastLineCount === 0) return '';
    let clear = '';
    for (let i = 0; i < lastLineCount; i++) {
      clear += '\x1b[1A\x1b[2K';
    }
    return clear;
  }

  function onProgress(progress: AnalysisProgress): void {
    const clear = clearPrevious();
    const block = renderTtyBlock(progress);
    lastLineCount = block.split('\n').length - 1; // -1 for trailing newline
    process.stdout.write(clear + block);
  }

  function finish(): void {
    const clear = clearPrevious();
    if (clear) {
      process.stdout.write(clear);
    }
    lastLineCount = 0;
  }

  return { onProgress, finish };
}

function createNonTtyRenderer(): ProgressRenderer {
  let lastPhase: AnalysisProgress['phase'] | null = null;

  function onProgress(progress: AnalysisProgress): void {
    if (progress.phase !== lastPhase) {
      lastPhase = progress.phase;
      process.stdout.write(PHASE_LABELS[progress.phase] + '\n');
    }
  }

  function finish(): void {
    // No cleanup needed in non-TTY mode
  }

  return { onProgress, finish };
}

export function createProgressRenderer(): ProgressRenderer {
  if (process.stdout.isTTY) {
    return createTtyRenderer();
  }
  return createNonTtyRenderer();
}
