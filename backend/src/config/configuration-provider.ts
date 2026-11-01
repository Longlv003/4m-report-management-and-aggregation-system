import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ConfigurationError } from '../errors/app-error.js';
import { logger } from '../logging/logger.js';
import { pathProvider } from './path-provider.js';

export interface DataMappingConfig {
  version: number;
  wcsRequiredColumns: string[];
  mappings: Record<string, {
    outputColumn: string;
    source: 'WCS' | 'PLUS' | 'CALCULATED' | 'PLUS_ERROR' | 'ITEM_MAPPING';
    sourceColumn?: string;
    sourceGroup?: string;
    storageColumn?: string;
    rule?: string;
    dataType: 'string' | 'integer' | 'float' | 'datetime';
    required: boolean;
  }>;
}

export interface CvrDataMappingConfig extends DataMappingConfig {
  plusErrorImport: {
    codeHeaderRow: number;
    dataStartRow: number;
    processTypes: string[];
    columns: Record<'itemCode' | 'batchNo' | 'productName' | 'inspectionDate' | 'totalNgQty' | 'inspectionQty' | 'ngRate', string>;
  };
  errorProcessTypes: {
    sideA: string[];
    sideB: string[];
  };
}

export interface LayerRulesConfig {
  version: number;
  rules: Array<{
    pattern: string;
    targetLayer: string;
    sourceHint?: string;
  }>;
  defaultLayer: string;
}

export interface SourceFilesConfig {
  version: number;
  sources: Record<string, {
    name: string;
    type: 'CSV' | 'EXCEL';
    directory: string;
    subDirectory?: string;
    pattern: string;
    encoding?: string;
    sheetName?: string;
    headerRow?: number;
    enabled: boolean;
  }>;
}

export interface ScannerConfig {
  version: number;
  scanner: {
    enabled: boolean;
    pollIntervalMs: number;
    stabilityCheckMs: number;
    stabilityChecks: number;
    maxConcurrentFiles: number;
    retryAttempts: number;
    retryDelayMs: number;
    backup: {
      enabled: boolean;
      intervalHours: number;
      maxRetentionCopies: number;
    };
  };
}

export interface CalculationRulesConfig {
  version: number;
  calculations: {
    totalTime: {
      unit: string;
      format: string;
      anomalyHandling: {
        condition: string;
        fallbackValue: string;
        anomalyFlag: string;
      };
    };
    op: {
      separator: string;
      innerSeparator: string;
      fields: Array<{ code: string; name: string }>;
    };
  };
}

export interface ValidationRulesConfig {
  version: number;
  requiredMatchingKeys: string[];
  rules: {
    shift: { allowedValues: string[] };
    airPressure: { min: number; max: number; unit: string };
    cpk: { minRecommended: number };
  };
}

export interface OutputSchemaConfig {
  version: number;
  sheetName: string;
  columns: Array<{
    index: number;
    key: string;
    header: string;
    width: number;
    format?: string;
  }>;
}

export interface AppConfig {
  version: number;
  app: {
    name: string;
    port: number;
    corsOrigins: string[];
    jwt: { expiresIn: string };
    environment: string;
  };
}

export class ConfigurationProvider {
  private static instance: ConfigurationProvider | null = null;
  private readonly configDir: string;
  private readonly ajv: Ajv;

  private dataMappingConfig!: DataMappingConfig;
  private cvrDataMappingConfig!: CvrDataMappingConfig;
  private layerRulesConfig!: LayerRulesConfig;
  private sourceFilesConfig!: SourceFilesConfig;
  private scannerConfig!: ScannerConfig;
  private calculationRulesConfig!: CalculationRulesConfig;
  private validationRulesConfig!: ValidationRulesConfig;
  private outputSchemaConfig!: OutputSchemaConfig;
  private cvrOutputSchemaConfig!: OutputSchemaConfig;
  private appConfig!: AppConfig;

  private constructor() {
    this.configDir = path.resolve(__dirname, '../../config');
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    this.loadAllConfigs();
  }

  public static getInstance(): ConfigurationProvider {
    if (!ConfigurationProvider.instance) {
      ConfigurationProvider.instance = new ConfigurationProvider();
    }
    return ConfigurationProvider.instance;
  }

  private loadJson<T>(filename: string): T {
    const fullPath = path.join(this.configDir, filename);
    if (!fs.existsSync(fullPath)) {
      throw new ConfigurationError(`Missing configuration file: ${filename} at ${fullPath}`);
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      return JSON.parse(content) as T;
    } catch (err) {
      throw new ConfigurationError(`Syntax error in ${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public loadAllConfigs(): void {
    logger.info('Loading configuration files...', { module: 'ConfigurationProvider' });
    
    this.dataMappingConfig = this.loadJson<DataMappingConfig>('scan-data-mapping.json');
    this.cvrDataMappingConfig = this.loadJson<CvrDataMappingConfig>('cvr-data-mapping.json');
    this.layerRulesConfig = this.loadJson<LayerRulesConfig>('layer-rules.json');
    this.sourceFilesConfig = this.loadJson<SourceFilesConfig>('source-files.json');
    this.scannerConfig = this.loadJson<ScannerConfig>('scanner.json');
    this.calculationRulesConfig = this.loadJson<CalculationRulesConfig>('calculation-rules.json');
    this.validationRulesConfig = this.loadJson<ValidationRulesConfig>('validation-rules.json');
    this.outputSchemaConfig = this.loadJson<OutputSchemaConfig>('scan-output-schema.json');
    this.cvrOutputSchemaConfig = this.loadJson<OutputSchemaConfig>('cvr-output-schema.json');
    this.appConfig = this.loadJson<AppConfig>('app.json');

    this.validateConfigs();
    logger.info('All configuration files loaded and validated successfully.', { module: 'ConfigurationProvider' });
  }

  private validateConfigs(): void {
    const cvrSchema = this.cvrOutputSchemaConfig;
    if (!cvrSchema.sheetName?.trim() || !Array.isArray(cvrSchema.columns) || !cvrSchema.columns.length ||
        cvrSchema.columns.some((column, index) => !column || column.index !== index || !column.key?.trim() ||
          !column.header?.trim() || !Number.isFinite(column.width) || column.width <= 0 ||
          (column.format !== undefined && (typeof column.format !== 'string' || !column.format.trim()))) ||
        new Set(cvrSchema.columns.map(column => column.key)).size !== cvrSchema.columns.length) {
      throw new ConfigurationError('cvr-output-schema.json requires a sheetName and ordered columns with unique keys, headers and positive widths');
    }
    const cvr = this.cvrDataMappingConfig;
    if (!cvr.mappings || !Array.isArray(cvr.wcsRequiredColumns) || !cvr.wcsRequiredColumns.length) {
      throw new ConfigurationError('cvr-data-mapping.json must define mappings and wcsRequiredColumns');
    }
    const wcsFields = ['processName', 'machineCode', 'machine', 'date', 'shift', 'operationTime',
      'opCode', 'opName', 'opCode2', 'opName2', 'itemName', 'itemCode', 'totalSheetVrf',
      'lotNo', 'okQty', 'seqNo', 'wcsNgQty', 'programName', 'startTime', 'finishTime',
      'verifyZoom', 'verifyZoomA', 'verifyZoomB', 'airPressure'];
    for (const key of wcsFields) {
      if (cvr.mappings[key]?.source !== 'WCS' || !cvr.mappings[key].sourceColumn?.trim()) {
        throw new ConfigurationError(`cvr-data-mapping.json requires a WCS sourceColumn for ${key}`);
      }
    }
    for (const side of ['A', 'B']) {
      for (const field of ['discoloration', 'fm', 'copperResidue', 'brokenHole', 'bvhShift',
        'missingHole', 'extraHole', 'dfrSeepage', 'other', 'dfrRemain']) {
        const entry = cvr.mappings[field + side];
        if (entry?.source !== 'PLUS_ERROR' || !/^d(?:[1-9]|10)$/.test(entry.storageColumn || '') ||
            !/^\{processType\}(?:[1-9]|10)$/.test(entry.sourceColumn || '')) {
          throw new ConfigurationError(`Invalid CVR defect sourceColumn: ${field + side}`);
        }
      }
    }
    const errorImport = cvr.plusErrorImport;
    if (!Number.isInteger(errorImport?.codeHeaderRow) || errorImport.codeHeaderRow < 1 ||
        !Number.isInteger(errorImport.dataStartRow) || errorImport.dataStartRow <= errorImport.codeHeaderRow ||
        !errorImport.processTypes?.length || !errorImport.processTypes.every(type => /^[A-Z]+$/.test(type)) ||
        !['itemCode', 'batchNo', 'productName', 'inspectionDate', 'totalNgQty', 'inspectionQty', 'ngRate']
          .every(key => /^[A-Z]+$/.test(errorImport.columns?.[key as keyof typeof errorImport.columns] || ''))) {
      throw new ConfigurationError('cvr-data-mapping.json must define valid plusErrorImport rows, processTypes and Excel columns');
    }
    const types = cvr.errorProcessTypes;
    if (!['totalPcs', 'totalPatternNg', 'ngRate', 'ngRateA', 'ngRateB'].every(key =>
        cvr.mappings[key]?.source === 'CALCULATED' && cvr.mappings[key].rule)) {
      throw new ConfigurationError('CVR totals and NG percentages must define calculated mappings');
    }
    if (![types?.sideA, types?.sideB].every(groups => Array.isArray(groups) && groups.length > 0 &&
        groups.every(group => errorImport.processTypes.includes(group)))) {
      throw new ConfigurationError('cvr-data-mapping.json must define errorProcessTypes');
    }
    if (!this.dataMappingConfig.mappings || typeof this.dataMappingConfig.mappings !== 'object') {
      throw new ConfigurationError('data-mapping.json is missing "mappings" object');
    }
    if (!Array.isArray(this.dataMappingConfig.wcsRequiredColumns) || this.dataMappingConfig.wcsRequiredColumns.length === 0) {
      throw new ConfigurationError('data-mapping.json must define "wcsRequiredColumns" array');
    }
    if (!Array.isArray(this.layerRulesConfig.rules) || this.layerRulesConfig.rules.length === 0) {
      throw new ConfigurationError('layer-rules.json must define "rules" array');
    }
    if (!this.sourceFilesConfig.sources || typeof this.sourceFilesConfig.sources !== 'object') {
      throw new ConfigurationError('source-files.json must define "sources" object');
    }
    const scanner = this.scannerConfig.scanner;
    if (typeof scanner?.enabled !== 'boolean' ||
        !Number.isInteger(scanner.maxConcurrentFiles) || scanner.maxConcurrentFiles < 1 ||
        !Number.isInteger(scanner.retryAttempts) || scanner.retryAttempts < 0 ||
        !Number.isFinite(scanner.retryDelayMs) || scanner.retryDelayMs < 0 ||
        !Number.isFinite(scanner.stabilityCheckMs) || scanner.stabilityCheckMs < 0 ||
        !Number.isInteger(scanner.stabilityChecks) || scanner.stabilityChecks < 1 ||
        !Number.isFinite(scanner.pollIntervalMs) || scanner.pollIntervalMs <= 0) {
      throw new ConfigurationError('Invalid scanner timing, retry or concurrency configuration');
    }
    const app = this.appConfig.app;
    if (!Array.isArray(app?.corsOrigins) || !app.corsOrigins.every(origin => typeof origin === 'string') ||
        !/^\d+(?:ms|s|m|h|d|w|y)$/.test(app.jwt?.expiresIn || '')) {
      throw new ConfigurationError('Invalid CORS origins or JWT expiresIn');
    }
    const calc = this.calculationRulesConfig.calculations;
    if (calc?.totalTime?.unit !== 'minute' || calc.totalTime.format !== 'integer' ||
        calc.totalTime.anomalyHandling?.condition !== 'finishBeforeStart' ||
        typeof calc.totalTime.anomalyHandling.fallbackValue !== 'string' ||
        typeof calc.totalTime.anomalyHandling.anomalyFlag !== 'string' ||
        typeof calc.op?.separator !== 'string' || typeof calc.op.innerSeparator !== 'string' || !calc.op.fields?.length) {
      throw new ConfigurationError('Invalid calculation rules: supported duration is integer minutes');
    }
    const validation = this.validationRulesConfig;
    if (!validation.requiredMatchingKeys?.length ||
        !validation.requiredMatchingKeys.every(key => ['itemCode','lotNo','seqNo'].includes(key)) ||
        !validation.rules?.shift?.allowedValues?.length ||
        !Number.isFinite(validation.rules.airPressure?.min) || !Number.isFinite(validation.rules.airPressure?.max) ||
        validation.rules.airPressure.min > validation.rules.airPressure.max || !Number.isFinite(validation.rules.cpk?.minRecommended)) {
      throw new ConfigurationError('Invalid validation rules');
    }
    if (!this.scannerConfig.scanner?.pollIntervalMs) {
      throw new ConfigurationError('scanner.json must specify "pollIntervalMs"');
    }
    if (!this.outputSchemaConfig.columns || this.outputSchemaConfig.columns.length !== 30) {
      throw new ConfigurationError(`output-schema.json must define exactly 30 columns. Current: ${this.outputSchemaConfig.columns?.length}`);
    }
  }

  public backupConfig(filename: string): void {
    const backupDir = pathProvider.getConfigBackupDir();
    const sourceFile = path.join(this.configDir, filename);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targetFile = path.join(backupDir, `${filename}.${timestamp}.bak`);
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, targetFile);
    }
  }

  // Getters
  public getDataMapping(): DataMappingConfig {
    return this.dataMappingConfig;
  }

  public getCvrDataMapping(): CvrDataMappingConfig {
    return this.cvrDataMappingConfig;
  }

  public getLayerRules(): LayerRulesConfig {
    return this.layerRulesConfig;
  }

  public getSourceFiles(): SourceFilesConfig {
    return this.sourceFilesConfig;
  }

  public getScannerConfig(): ScannerConfig {
    return this.scannerConfig;
  }

  public getCalculationRules(): CalculationRulesConfig {
    return this.calculationRulesConfig;
  }

  public getValidationRules(): ValidationRulesConfig {
    return this.validationRulesConfig;
  }

  public getOutputSchema(): OutputSchemaConfig {
    return this.outputSchemaConfig;
  }

  public getCvrOutputSchema(): OutputSchemaConfig {
    return this.cvrOutputSchemaConfig;
  }

  public getAppConfig(): AppConfig {
    return this.appConfig;
  }
}

export const configurationProvider = ConfigurationProvider.getInstance();
