import React from 'react';
import { useApi } from '../hooks/useApi';
import { PatternBadge } from '../components/PatternBadge';
import type { CodeUnitDetail } from '../types';

interface CodeUnitPageProps {
  id: string;
  onNavigate: (hash: string) => void;
}

export const CodeUnitPage: React.FC<CodeUnitPageProps> = ({ id, onNavigate }) => {
  const { data: unit, loading, error } = useApi<CodeUnitDetail>(`/api/code-units/${id}`);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#999' }}>
        Loading code unit...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#e74c3c' }}>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Failed to load code unit</div>
        <div style={{ color: '#999', fontSize: '13px' }}>{error}</div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#999' }}>
        Code unit not found.
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => window.history.back()}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-accent)',
          cursor: 'pointer',
          fontSize: '13px',
          padding: 0,
          marginBottom: '16px',
          fontWeight: 600,
        }}
      >
        &larr; Back
      </button>

      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#1a1a2e' }}>
              {unit.name}
            </h2>
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
              {unit.type}
            </span>
          </div>
          {unit.complexity !== undefined && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: 600 }}>
                Complexity
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: unit.complexity > 20 ? '#e74c3c' : unit.complexity > 10 ? '#f59e0b' : '#22c55e',
                }}
              >
                {unit.complexity}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <InfoRow label="File" value={unit.filePath} mono />
          <InfoRow label="Language" value={unit.language} />
          <InfoRow label="Lines" value={`${unit.startLine} - ${unit.endLine}`} mono />
        </div>

        {unit.signature && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
              Signature
            </div>
            <code
              style={{
                display: 'block',
                padding: '12px',
                backgroundColor: '#f8f8f8',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: '#333',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {unit.signature}
            </code>
          </div>
        )}

        {unit.patterns && unit.patterns.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
              Patterns
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {unit.patterns.map((p) => (
                <PatternBadge key={p} pattern={p} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {unit.callers && unit.callers.length > 0 && (
          <ReferenceList
            title="Callers"
            items={unit.callers}
            onNavigate={onNavigate}
          />
        )}

        {unit.callees && unit.callees.length > 0 && (
          <ReferenceList
            title="Callees"
            items={unit.callees}
            onNavigate={onNavigate}
          />
        )}
      </div>

      {unit.typeFields && unit.typeFields.length > 0 && (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            marginTop: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>
            Type Fields
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
              </tr>
            </thead>
            <tbody>
              {unit.typeFields.map((field, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    {field.name}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#666' }}>
                    {field.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>
      {label}
    </div>
    <div
      style={{
        fontSize: '13px',
        color: '#333',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </div>
  </div>
);

interface ReferenceListProps {
  title: string;
  items: Array<{ id: string; name: string; filePath: string; type: string }>;
  onNavigate: (hash: string) => void;
}

const ReferenceList: React.FC<ReferenceListProps> = ({ title, items, onNavigate }) => (
  <div
    style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}
  >
    <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>
      {title} ({items.length})
    </h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#/code-units/${item.id}`}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(`#/code-units/${item.id}`);
          }}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '6px',
            textDecoration: 'none',
            color: '#333',
            backgroundColor: '#f8f8f8',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e8eaf6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8f8f8'; }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: '#4361ee' }}>
            {item.name}
          </span>
          <span style={{ fontSize: '11px', color: '#999' }}>{item.type}</span>
        </a>
      ))}
    </div>
  </div>
);

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
};
