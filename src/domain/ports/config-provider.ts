export interface HeuryConfig {
  rootDir: string;
  outputDir: string;
  include: string[];
  exclude: string[];
  embedding: {
    provider: 'local' | 'openai';
    model?: string;
    apiKey?: string;
  };
  enrichment?: {
    provider: 'anthropic' | 'openai' | 'gemini';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  manifestTokenBudget?: number;
}

export interface IConfigProvider {
  load(): Promise<HeuryConfig>;
  save(config: HeuryConfig): Promise<void>;
  getDefault(): HeuryConfig;
}
