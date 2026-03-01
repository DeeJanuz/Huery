import React, { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string, type: string) => void;
  initialQuery?: string;
  initialType?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  initialQuery = '',
  initialType = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), type);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search code units, patterns, files..."
        style={{
          flex: 1,
          padding: '10px 16px',
          fontSize: '14px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{
          padding: '10px 16px',
          fontSize: '14px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          backgroundColor: '#fff',
          cursor: 'pointer',
        }}
      >
        <option value="">All types</option>
        <option value="code_unit">Code Units</option>
        <option value="pattern">Patterns</option>
        <option value="file">Files</option>
      </select>
      <button
        type="submit"
        style={{
          padding: '10px 24px',
          fontSize: '14px',
          fontWeight: 600,
          color: '#fff',
          backgroundColor: 'var(--color-accent)',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Search
      </button>
    </form>
  );
};
