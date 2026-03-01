import React, { useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { PatternBadge } from '../components/PatternBadge';
import { useApi } from '../hooks/useApi';
import type { SearchResult } from '../types';

interface SearchPageProps {
  onNavigate: (hash: string) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onNavigate }) => {
  const [searchUrl, setSearchUrl] = useState<string | null>(null);
  const { data: results, loading, error } = useApi<SearchResult[]>(searchUrl);

  const handleSearch = (query: string, type: string) => {
    const params = new URLSearchParams({ q: query, limit: '50' });
    if (type) {
      params.set('type', type);
    }
    setSearchUrl(`/api/search?${params.toString()}`);
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 700, color: '#1a1a2e' }}>
        Search
      </h2>

      <SearchBar onSearch={handleSearch} />

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>Searching...</div>
      )}

      {error && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#e74c3c' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Search failed</div>
          <div style={{ color: '#999', fontSize: '13px' }}>{error}</div>
        </div>
      )}

      {!loading && !error && results && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          No results found. Try a different query.
        </div>
      )}

      {!loading && !error && !results && !searchUrl && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          Enter a search query to find code units, patterns, and files.
        </div>
      )}

      {results && results.length > 0 && (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>File Path</th>
                <th style={thStyle}>Language</th>
                <th style={thStyle}>Patterns</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr
                  key={result.id}
                  onClick={() => onNavigate(`#/code-units/${result.id}`)}
                  style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4361ee' }}>
                    {result.name}
                  </td>
                  <td style={tdStyle}>
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
                      {result.type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#666', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.filePath}
                  </td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: '#999' }}>{result.language}</td>
                  <td style={tdStyle}>
                    {result.patterns?.map((p) => (
                      <PatternBadge key={p} pattern={p} />
                    ))}
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

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '13px',
};
