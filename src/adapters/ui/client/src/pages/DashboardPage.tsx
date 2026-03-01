import React from 'react';
import { useApi } from '../hooks/useApi';
import type { Stats } from '../types';

export const DashboardPage: React.FC = () => {
  const { data: stats, loading, error } = useApi<Stats>('/api/stats');

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!stats) {
    return <EmptyState />;
  }

  const cards = [
    { label: 'Code Units', value: stats.totalCodeUnits, color: '#4361ee' },
    { label: 'Files', value: stats.totalFiles, color: '#2ecc71' },
    { label: 'Dependencies', value: stats.totalDependencies, color: '#e67e22' },
    { label: 'Clusters', value: stats.totalClusters, color: '#9b59b6' },
  ];

  const languages = Object.entries(stats.languageBreakdown).sort(([, a], [, b]) => b - a);
  const totalLangCount = languages.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 700, color: '#1a1a2e' }}>
        Dashboard
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderTop: `3px solid ${card.color}`,
            }}
          >
            <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a2e', fontFamily: 'var(--font-mono)' }}>
              {card.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {languages.length > 0 && (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: '#1a1a2e' }}>
            Language Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {languages.map(([lang, count]) => {
              const pct = totalLangCount > 0 ? (count / totalLangCount) * 100 : 0;
              return (
                <div key={lang}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{lang}</span>
                    <span style={{ fontSize: '13px', color: '#999' }}>
                      {count} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      backgroundColor: '#eee',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        backgroundColor: '#4361ee',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const LoadingState: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '64px 0', color: '#999' }}>
    <div style={{ fontSize: '24px', marginBottom: '8px' }}>Loading...</div>
    <p>Fetching dashboard stats</p>
  </div>
);

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ textAlign: 'center', padding: '64px 0', color: '#e74c3c' }}>
    <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Error loading stats</div>
    <p style={{ color: '#999' }}>{message}</p>
  </div>
);

const EmptyState: React.FC = () => (
  <div style={{ textAlign: 'center', padding: '64px 0', color: '#999' }}>
    <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No data yet</div>
    <p>Run a codebase analysis to populate the dashboard.</p>
  </div>
);
