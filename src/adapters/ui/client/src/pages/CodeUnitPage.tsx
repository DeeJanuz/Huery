import React from 'react';
import { useApi } from '../hooks/useApi';
import { PatternBadge } from '../components/PatternBadge';
import type { CodeUnitDetail, FunctionCallRef } from '../types';

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

  const callers = unit.functionCalls?.callers ?? [];
  const callees = unit.functionCalls?.callees ?? [];

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
              {unit.unitType}
            </span>
          </div>
          {unit.complexityScore !== undefined && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', fontWeight: 600 }}>
                Complexity
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: unit.complexityScore > 20 ? '#e74c3c' : unit.complexityScore > 10 ? '#f59e0b' : '#22c55e',
                }}
              >
                {unit.complexityScore}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <InfoRow label="File" value={unit.filePath} mono />
          <InfoRow label="Language" value={unit.language} />
          <InfoRow label="Lines" value={`${unit.lineStart} - ${unit.lineEnd}`} mono />
          <InfoRow label="Exported" value={unit.isExported ? 'Yes' : 'No'} />
          <InfoRow label="Async" value={unit.isAsync ? 'Yes' : 'No'} />
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
                <PatternBadge key={p.id} pattern={`${p.patternType}: ${p.patternValue}`} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {callers.length > 0 && (
            <ReferenceList
              title="Callers"
              items={callers}
              onNavigate={onNavigate}
              getUnitId={(item) => item.callerUnitId}
              getName={(item) => item.callerName}
              getFilePath={(item) => item.callerFilePath}
            />
          )}

          {callees.length > 0 && (
            <ReferenceList
              title="Callees"
              items={callees}
              onNavigate={onNavigate}
              getUnitId={(item) => item.calleeUnitId}
              getName={(item) => item.calleeName}
              getFilePath={(item) => item.calleeFilePath}
            />
          )}
        </div>

        <SourceCodePanel
          extractedCode={unit.extractedCode}
          filePath={unit.filePath}
          lineStart={unit.lineStart}
          lineEnd={unit.lineEnd}
        />
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
                <th style={thStyle}>Optional</th>
              </tr>
            </thead>
            <tbody>
              {unit.typeFields.map((field) => (
                <tr key={field.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    {field.fieldName}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#666' }}>
                    {field.fieldType}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: '13px', color: '#999' }}>
                    {field.isOptional ? 'Yes' : 'No'}
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
  items: FunctionCallRef[];
  onNavigate: (hash: string) => void;
  getUnitId: (item: FunctionCallRef) => string | null;
  getName: (item: FunctionCallRef) => string;
  getFilePath: (item: FunctionCallRef) => string;
}

const ReferenceList: React.FC<ReferenceListProps> = ({ title, items, onNavigate, getUnitId, getName, getFilePath }) => (
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
      {items.map((item) => {
        const unitId = getUnitId(item);
        const name = getName(item);
        const filePath = getFilePath(item);
        const canNavigate = unitId !== null;

        return (
          <a
            key={item.id}
            href={canNavigate ? `#/code-units/${unitId}` : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (canNavigate) {
                onNavigate(`#/code-units/${unitId}`);
              }
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
              cursor: canNavigate ? 'pointer' : 'default',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => { if (canNavigate) e.currentTarget.style.backgroundColor = '#e8eaf6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8f8f8'; }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: canNavigate ? '#4361ee' : '#666' }}>
              {name}
            </span>
            <span style={{ fontSize: '11px', color: '#999', fontFamily: 'var(--font-mono)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filePath}
            </span>
          </a>
        );
      })}
    </div>
  </div>
);

interface SourceCodePanelProps {
  extractedCode: string | null;
  filePath: string;
  lineStart: number;
  lineEnd: number;
}

const SourceCodePanel: React.FC<SourceCodePanelProps> = ({ extractedCode, filePath, lineStart, lineEnd }) => (
  <div
    style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}
  >
    <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>
      Source Code
    </h3>
    <div style={{ fontSize: '11px', color: '#999', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>
      {filePath} : {lineStart}-{lineEnd}
    </div>
    {extractedCode !== null ? (
      <div
        style={{
          backgroundColor: '#1e1e2e',
          borderRadius: '6px',
          padding: '16px',
          overflow: 'auto',
          maxHeight: '600px',
        }}
      >
        <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.6' }}>
          {extractedCode.split('\n').map((line, i) => (
            <div key={i} style={{ display: 'flex' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '48px',
                  flexShrink: 0,
                  textAlign: 'right',
                  paddingRight: '16px',
                  color: '#6c7086',
                  userSelect: 'none',
                }}
              >
                {lineStart + i}
              </span>
              <span style={{ color: '#cdd6f4', whiteSpace: 'pre' }}>{line}</span>
            </div>
          ))}
        </pre>
      </div>
    ) : (
      <div style={{ color: '#999', fontSize: '13px', fontStyle: 'italic' }}>
        Source not available
      </div>
    )}
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
