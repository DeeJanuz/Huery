import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  currentRoute: string;
  onNavigate: (hash: string) => void;
}

interface NavItem {
  hash: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { hash: '#/', label: 'Dashboard', icon: '\u25A6' },
  { hash: '#/search', label: 'Search', icon: '\u2315' },
  { hash: '#/clusters', label: 'Clusters', icon: '\u2B21' },
];

export const Layout: React.FC<LayoutProps> = ({ children, currentRoute, onNavigate }) => {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: '240px',
          backgroundColor: 'var(--color-sidebar)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: 'var(--color-accent)' }}>&gt;</span> Heury
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
            Codebase Analysis
          </p>
        </div>

        <nav style={{ padding: '16px 0', flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isActive =
              currentRoute === item.hash ||
              (item.hash === '#/' && currentRoute === '') ||
              (item.hash !== '#/' && currentRoute.startsWith(item.hash));

            return (
              <a
                key={item.hash}
                href={item.hash}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.hash);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 20px',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'rgba(67, 97, 238, 0.3)' : 'transparent',
                  borderRight: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                  }
                }}
              >
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                {item.label}
              </a>
            );
          })}
        </nav>

        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          Local-first analysis
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          backgroundColor: 'var(--color-bg)',
          overflow: 'auto',
        }}
      >
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  );
};
