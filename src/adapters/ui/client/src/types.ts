export interface Stats {
  totalCodeUnits: number;
  totalFiles: number;
  totalDependencies: number;
  totalClusters: number;
  languageBreakdown: Record<string, number>;
}

export interface CodeUnit {
  id: string;
  name: string;
  type: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  patterns: string[];
}

export interface FunctionCall {
  id: string;
  name: string;
  filePath: string;
  type: string;
}

export interface EventFlow {
  id: string;
  name: string;
  type: string;
  direction: 'emit' | 'listen';
}

export interface Dependency {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface CodeUnitDetail extends CodeUnit {
  signature: string;
  complexity: number;
  callers: FunctionCall[];
  callees: FunctionCall[];
  typeFields: Array<{ name: string; type: string }>;
  eventFlows: EventFlow[];
  dependencies: Dependency[];
}

export interface SearchResult {
  id: string;
  name: string;
  type: string;
  filePath: string;
  language: string;
  score: number;
  patterns: string[];
}

export interface Cluster {
  id: string;
  name: string;
  memberCount: number;
  cohesion: number;
  languages: string[];
}

export interface ClusterDetail extends Cluster {
  members: CodeUnit[];
  internalDependencies: Dependency[];
  externalDependencies: Dependency[];
}
