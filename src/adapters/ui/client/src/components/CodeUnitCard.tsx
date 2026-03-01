import React from 'react';
import { PatternBadge } from './PatternBadge';

interface CodeUnitCardProps {
  id: string;
  name: string;
  type: string;
  filePath: string;
  language?: string;
  patterns?: string[];
  onClick?: () => void;
}

export const CodeUnitCard: React.FC<CodeUnitCardProps> = ({
  name,
  type,
  filePath,
  language,
  patterns = [],
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s, transform 0.1s',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontFamily: 'var(--font-mono)', color: '#1a1a2e' }}>
          {name}
        </h4>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: '#e8eaf6',
            color: '#3949ab',
            textTransform: 'uppercase',
          }}
        >
          {type}
        </span>
      </div>
      <div
        style={{
          fontSize: '12px',
          color: '#666',
          fontFamily: 'var(--font-mono)',
          marginBottom: '8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {filePath}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {language && (
          <span style={{ fontSize: '11px', color: '#999' }}>{language}</span>
        )}
        {patterns.map((p) => (
          <PatternBadge key={p} pattern={p} />
        ))}
      </div>
    </div>
  );
};
