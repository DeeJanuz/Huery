import React from 'react';

const PATTERN_COLORS: Record<string, string> = {
  singleton: '#e74c3c',
  factory: '#3498db',
  observer: '#2ecc71',
  strategy: '#9b59b6',
  decorator: '#e67e22',
  adapter: '#1abc9c',
  facade: '#f39c12',
  middleware: '#e91e63',
  repository: '#00bcd4',
  service: '#4361ee',
  controller: '#ff5722',
  handler: '#607d8b',
  utility: '#795548',
  model: '#8bc34a',
  config: '#ff9800',
  test: '#9e9e9e',
};

function getPatternColor(pattern: string): string {
  const key = pattern.toLowerCase();
  return PATTERN_COLORS[key] || '#6c757d';
}

interface PatternBadgeProps {
  pattern: string;
}

export const PatternBadge: React.FC<PatternBadgeProps> = ({ pattern }) => {
  const color = getPatternColor(pattern);

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#fff',
        backgroundColor: color,
        marginRight: '4px',
        marginBottom: '4px',
        textTransform: 'lowercase',
      }}
    >
      {pattern}
    </span>
  );
};
