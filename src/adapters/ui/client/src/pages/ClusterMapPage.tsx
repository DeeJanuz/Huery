import React, { useState, useEffect } from 'react';
import { ClusterGraph } from '../components/ClusterGraph';
import { CodeUnitCard } from '../components/CodeUnitCard';
import { useApi } from '../hooks/useApi';
import type { Cluster, ClusterDetail } from '../types';

interface ClusterMapPageProps {
  onNavigate: (hash: string) => void;
}

export const ClusterMapPage: React.FC<ClusterMapPageProps> = ({ onNavigate }) => {
  const { data: clusters, loading, error } = useApi<Cluster[]>('/api/clusters');
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [clusterDetails, setClusterDetails] = useState<Map<string, ClusterDetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedDetail = selectedClusterId ? clusterDetails.get(selectedClusterId) ?? null : null;

  useEffect(() => {
    if (!selectedClusterId || clusterDetails.has(selectedClusterId)) {
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    fetch(`/api/clusters/${selectedClusterId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((detail: ClusterDetail) => {
        if (!cancelled) {
          setClusterDetails((prev) => new Map(prev).set(selectedClusterId, detail));
          setDetailLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setDetailError(err.message);
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedClusterId, clusterDetails]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#999' }}>
        Loading clusters...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#e74c3c' }}>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>Failed to load clusters</div>
        <div style={{ color: '#999', fontSize: '13px' }}>{error}</div>
      </div>
    );
  }

  if (!clusters || clusters.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#999' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No clusters</div>
        <p>Run a codebase analysis to generate cluster data.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '24px', fontWeight: 700, color: '#1a1a2e' }}>
        Cluster Map
      </h2>

      <div style={{ display: 'flex', flex: 1, gap: '16px', minHeight: 0 }}>
        <div
          style={{
            flex: selectedDetail ? '1 1 60%' : '1 1 100%',
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            transition: 'flex 0.3s',
          }}
        >
          <ClusterGraph
            clusters={clusters}
            clusterDetails={clusterDetails}
            selectedClusterId={selectedClusterId}
            onClusterClick={setSelectedClusterId}
          />
        </div>

        {selectedClusterId && (
          <div
            style={{
              flex: '0 0 360px',
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              padding: '20px',
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Cluster Detail</h3>
              <button
                onClick={() => setSelectedClusterId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#999',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                x
              </button>
            </div>

            {detailLoading && <div style={{ color: '#999', fontSize: '13px' }}>Loading detail...</div>}
            {detailError && <div style={{ color: '#e74c3c', fontSize: '13px' }}>{detailError}</div>}

            {selectedDetail && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a2e', marginBottom: '4px' }}>
                    {selectedDetail.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666', display: 'flex', gap: '16px' }}>
                    <span>{selectedDetail.memberCount} members</span>
                    <span>{Math.round(selectedDetail.cohesion * 100)}% cohesion</span>
                  </div>
                  {selectedDetail.languages.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {selectedDetail.languages.map((lang) => (
                        <span
                          key={lang}
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#f0f0f0',
                            color: '#666',
                          }}
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {selectedDetail.members && selectedDetail.members.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#999', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Members
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedDetail.members.map((unit) => (
                        <CodeUnitCard
                          key={unit.id}
                          id={unit.id}
                          name={unit.name}
                          type={unit.type}
                          filePath={unit.filePath}
                          language={unit.language}
                          patterns={unit.patterns}
                          onClick={() => onNavigate(`#/code-units/${unit.id}`)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
