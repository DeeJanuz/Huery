import type {
  ICodeUnitRepository,
  IFileDependencyRepository,
  IEnvVariableRepository,
  IFileSystem,
  ITypeFieldRepository,
  IEventFlowRepository,
  ISchemaModelRepository,
  IFunctionCallRepository,
  IFileClusterRepository,
  IPatternTemplateRepository,
} from '@/domain/ports/index.js';
import { allocateBudget } from './token-budgeter.js';
import { generateModulesManifest } from './modules-generator.js';
import { generatePatternsManifest } from './patterns-generator.js';
import { generateDependenciesManifest } from './dependencies-generator.js';
import { generateHotspotsManifest } from './hotspots-generator.js';
import { generateSchemaManifest } from './schema-generator.js';

const DEFAULT_TOKEN_BUDGET = 10000;

export interface ManifestDependencies {
  readonly codeUnitRepo: ICodeUnitRepository;
  readonly dependencyRepo: IFileDependencyRepository;
  readonly envVarRepo: IEnvVariableRepository;
  readonly fileSystem: IFileSystem;
  // Deep analysis (optional)
  readonly typeFieldRepo?: ITypeFieldRepository;
  readonly eventFlowRepo?: IEventFlowRepository;
  readonly schemaModelRepo?: ISchemaModelRepository;
  readonly functionCallRepo?: IFunctionCallRepository;
  readonly fileClusterRepo?: IFileClusterRepository;
  readonly patternTemplateRepo?: IPatternTemplateRepository;
}

export interface ManifestOptions {
  readonly outputDir: string;
  readonly totalTokenBudget?: number;
}

/**
 * Generate all manifest files and write them to the output directory.
 */
export async function generateManifests(
  deps: ManifestDependencies,
  options: ManifestOptions,
): Promise<void> {
  const totalBudget = options.totalTokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const budget = allocateBudget(totalBudget);
  const outputDir = options.outputDir;

  // Ensure output directory exists
  await deps.fileSystem.mkdir(outputDir);

  const modules = generateModulesManifest({
    codeUnitRepo: deps.codeUnitRepo,
    dependencyRepo: deps.dependencyRepo,
    maxTokens: budget.modules,
    typeFieldRepo: deps.typeFieldRepo,
    fileClusterRepo: deps.fileClusterRepo,
  });
  const patterns = generatePatternsManifest({
    codeUnitRepo: deps.codeUnitRepo,
    envVarRepo: deps.envVarRepo,
    maxTokens: budget.patterns,
    eventFlowRepo: deps.eventFlowRepo,
    patternTemplateRepo: deps.patternTemplateRepo,
  });
  const dependencies = generateDependenciesManifest(
    deps.dependencyRepo,
    budget.dependencies,
  );
  const hotspots = generateHotspotsManifest(
    deps.codeUnitRepo,
    budget.hotspots,
    deps.functionCallRepo,
  );

  const writePromises = [
    deps.fileSystem.writeFile(`${outputDir}/MODULES.md`, modules),
    deps.fileSystem.writeFile(`${outputDir}/PATTERNS.md`, patterns),
    deps.fileSystem.writeFile(`${outputDir}/DEPENDENCIES.md`, dependencies),
    deps.fileSystem.writeFile(`${outputDir}/HOTSPOTS.md`, hotspots),
  ];

  if (deps.schemaModelRepo) {
    const schema = generateSchemaManifest(deps.schemaModelRepo, budget.schema);
    writePromises.push(deps.fileSystem.writeFile(`${outputDir}/SCHEMA.md`, schema));
  }

  await Promise.all(writePromises);
}
