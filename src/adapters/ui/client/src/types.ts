export interface Stats {
  total_code_units: number;
  total_files: number;
  total_patterns: number;
  total_dependencies: number;
  total_env_variables: number;
  languages: Record<string, number>;
  total_clusters: number;
}

export interface Pattern {
  readonly id: string;
  readonly codeUnitId: string;
  readonly patternType: string;
  readonly patternValue: string;
  readonly lineNumber: number;
}

export interface CodeUnit {
  readonly id: string;
  readonly filePath: string;
  readonly name: string;
  readonly unitType: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly signature: string;
  readonly isAsync: boolean;
  readonly isExported: boolean;
  readonly language: string;
  readonly complexity: Record<string, number> | number;
  readonly complexityScore: number;
  readonly patterns: Pattern[];
  readonly children: CodeUnit[];
}

export interface CodeUnitListResponse {
  readonly total: number;
  readonly items: CodeUnit[];
}

export interface FunctionCallRef {
  readonly id: string;
  readonly callerUnitId: string;
  readonly callerName: string;
  readonly callerFilePath: string;
  readonly calleeName: string;
  readonly calleeUnitId: string | null;
  readonly calleeFilePath: string;
  readonly lineNumber: number;
}

export interface TypeField {
  readonly id: string;
  readonly parentUnitId: string;
  readonly fieldName: string;
  readonly fieldType: string;
  readonly isOptional: boolean;
}

export interface CodeUnitDetail extends CodeUnit {
  readonly functionCalls: {
    readonly callers: FunctionCallRef[];
    readonly callees: FunctionCallRef[];
  };
  readonly typeFields: TypeField[];
  readonly extractedCode: string | null;
}

export interface SearchResult {
  readonly id: string;
  readonly name: string;
  readonly unitType: string;
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly language: string;
  readonly signature: string;
}

export interface SearchResponse {
  readonly total: number;
  readonly items: SearchResult[];
}

export interface Cluster {
  readonly id: string;
  readonly name: string;
  readonly cohesion: number;
  readonly internalEdges: number;
  readonly externalEdges: number;
  readonly memberCount: number;
}

export interface ClusterMember {
  readonly clusterId: string;
  readonly filePath: string;
  readonly isEntryPoint: boolean;
}

export interface ClusterCodeUnit {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly unitType: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly signature: string;
  readonly complexity: number;
  readonly patterns: Array<{ readonly patternType: string; readonly patternValue: string }>;
}

export interface ClusterDep {
  readonly source: string;
  readonly target: string;
}

export interface ClusterExternalDep {
  readonly source: string;
  readonly target: string;
  readonly direction: 'inbound' | 'outbound';
}

export interface ClusterDetail {
  readonly cluster: {
    readonly id: string;
    readonly name: string;
    readonly cohesion: number;
    readonly internalEdges: number;
    readonly externalEdges: number;
    readonly files: string[];
    readonly entryPoints: string[];
  };
  readonly members: ClusterMember[];
  readonly codeUnits: ClusterCodeUnit[];
  readonly internalDeps: ClusterDep[];
  readonly externalDeps: ClusterExternalDep[];
}

export interface EventFlow {
  readonly id: string;
  readonly codeUnitId: string;
  readonly eventName: string;
  readonly direction: 'emit' | 'listen';
  readonly filePath: string;
  readonly lineNumber: number;
}

export interface Dependency {
  readonly id: string;
  readonly sourceFile: string;
  readonly targetFile: string;
  readonly importType: string;
  readonly importedNames: string[];
}

export interface ClusterRelationshipEdge {
  readonly sourceClusterId: string;
  readonly targetClusterId: string;
  readonly weight: number;
}

export interface ClusterRelationships {
  readonly edges: ClusterRelationshipEdge[];
}
