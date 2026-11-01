"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurationProvider = exports.ConfigurationProvider = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const app_error_js_1 = require("../errors/app-error.js");
const logger_js_1 = require("../logging/logger.js");
const path_provider_js_1 = require("./path-provider.js");
class ConfigurationProvider {
    static instance = null;
    configDir;
    ajv;
    dataMappingConfig;
    cvrDataMappingConfig;
    layerRulesConfig;
    sourceFilesConfig;
    scannerConfig;
    calculationRulesConfig;
    validationRulesConfig;
    outputSchemaConfig;
    cvrOutputSchemaConfig;
    appConfig;
    constructor() {
        this.configDir = path_1.default.resolve(__dirname, '../../config');
        this.ajv = new ajv_1.default({ allErrors: true });
        (0, ajv_formats_1.default)(this.ajv);
        this.loadAllConfigs();
    }
    static getInstance() {
        if (!ConfigurationProvider.instance) {
            ConfigurationProvider.instance = new ConfigurationProvider();
        }
        return ConfigurationProvider.instance;
    }
    loadJson(filename) {
        const fullPath = path_1.default.join(this.configDir, filename);
        if (!fs_1.default.existsSync(fullPath)) {
            throw new app_error_js_1.ConfigurationError(`Missing configuration file: ${filename} at ${fullPath}`);
        }
        try {
            const content = fs_1.default.readFileSync(fullPath, 'utf8');
            return JSON.parse(content);
        }
        catch (err) {
            throw new app_error_js_1.ConfigurationError(`Syntax error in ${filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    loadAllConfigs() {
        logger_js_1.logger.info('Loading configuration files...', { module: 'ConfigurationProvider' });
        this.dataMappingConfig = this.loadJson('scan-data-mapping.json');
        this.cvrDataMappingConfig = this.loadJson('cvr-data-mapping.json');
        this.layerRulesConfig = this.loadJson('layer-rules.json');
        this.sourceFilesConfig = this.loadJson('source-files.json');
        this.scannerConfig = this.loadJson('scanner.json');
        this.calculationRulesConfig = this.loadJson('calculation-rules.json');
        this.validationRulesConfig = this.loadJson('validation-rules.json');
        this.outputSchemaConfig = this.loadJson('scan-output-schema.json');
        this.cvrOutputSchemaConfig = this.loadJson('cvr-output-schema.json');
        this.appConfig = this.loadJson('app.json');
        this.validateConfigs();
        logger_js_1.logger.info('All configuration files loaded and validated successfully.', { module: 'ConfigurationProvider' });
    }
    validateConfigs() {
        const cvrSchema = this.cvrOutputSchemaConfig;
        if (!cvrSchema.sheetName?.trim() || !Array.isArray(cvrSchema.columns) || !cvrSchema.columns.length ||
            cvrSchema.columns.some((column, index) => !column || column.index !== index || !column.key?.trim() ||
                !column.header?.trim() || !Number.isFinite(column.width) || column.width <= 0 ||
                (column.format !== undefined && (typeof column.format !== 'string' || !column.format.trim()))) ||
            new Set(cvrSchema.columns.map(column => column.key)).size !== cvrSchema.columns.length) {
            throw new app_error_js_1.ConfigurationError('cvr-output-schema.json requires a sheetName and ordered columns with unique keys, headers and positive widths');
        }
        const cvr = this.cvrDataMappingConfig;
        if (!cvr.mappings || !Array.isArray(cvr.wcsRequiredColumns) || !cvr.wcsRequiredColumns.length) {
            throw new app_error_js_1.ConfigurationError('cvr-data-mapping.json must define mappings and wcsRequiredColumns');
        }
        const wcsFields = ['processName', 'machineCode', 'machine', 'date', 'shift', 'operationTime',
            'opCode', 'opName', 'opCode2', 'opName2', 'itemName', 'itemCode', 'totalSheetVrf',
            'lotNo', 'okQty', 'seqNo', 'wcsNgQty', 'programName', 'startTime', 'finishTime',
            'verifyZoom', 'verifyZoomA', 'verifyZoomB', 'airPressure'];
        for (const key of wcsFields) {
            if (cvr.mappings[key]?.source !== 'WCS' || !cvr.mappings[key].sourceColumn?.trim()) {
                throw new app_error_js_1.ConfigurationError(`cvr-data-mapping.json requires a WCS sourceColumn for ${key}`);
            }
        }
        for (const side of ['A', 'B']) {
            for (const field of ['discoloration', 'fm', 'copperResidue', 'brokenHole', 'bvhShift',
                'missingHole', 'extraHole', 'dfrSeepage', 'other', 'dfrRemain']) {
                const entry = cvr.mappings[field + side];
                if (entry?.source !== 'PLUS_ERROR' || !/^d(?:[1-9]|10)$/.test(entry.storageColumn || '') ||
                    !/^\{processType\}(?:[1-9]|10)$/.test(entry.sourceColumn || '')) {
                    throw new app_error_js_1.ConfigurationError(`Invalid CVR defect sourceColumn: ${field + side}`);
                }
            }
        }
        const errorImport = cvr.plusErrorImport;
        if (!Number.isInteger(errorImport?.codeHeaderRow) || errorImport.codeHeaderRow < 1 ||
            !Number.isInteger(errorImport.dataStartRow) || errorImport.dataStartRow <= errorImport.codeHeaderRow ||
            !errorImport.processTypes?.length || !errorImport.processTypes.every(type => /^[A-Z]+$/.test(type)) ||
            !['itemCode', 'batchNo', 'productName', 'inspectionDate', 'totalNgQty', 'inspectionQty', 'ngRate']
                .every(key => /^[A-Z]+$/.test(errorImport.columns?.[key] || ''))) {
            throw new app_error_js_1.ConfigurationError('cvr-data-mapping.json must define valid plusErrorImport rows, processTypes and Excel columns');
        }
        const types = cvr.errorProcessTypes;
        if (!['totalPcs', 'totalPatternNg', 'ngRate', 'ngRateA', 'ngRateB'].every(key => cvr.mappings[key]?.source === 'CALCULATED' && cvr.mappings[key].rule)) {
            throw new app_error_js_1.ConfigurationError('CVR totals and NG percentages must define calculated mappings');
        }
        if (![types?.sideA, types?.sideB].every(groups => Array.isArray(groups) && groups.length > 0 &&
            groups.every(group => errorImport.processTypes.includes(group)))) {
            throw new app_error_js_1.ConfigurationError('cvr-data-mapping.json must define errorProcessTypes');
        }
        if (!this.dataMappingConfig.mappings || typeof this.dataMappingConfig.mappings !== 'object') {
            throw new app_error_js_1.ConfigurationError('data-mapping.json is missing "mappings" object');
        }
        if (!Array.isArray(this.dataMappingConfig.wcsRequiredColumns) || this.dataMappingConfig.wcsRequiredColumns.length === 0) {
            throw new app_error_js_1.ConfigurationError('data-mapping.json must define "wcsRequiredColumns" array');
        }
        if (!Array.isArray(this.layerRulesConfig.rules) || this.layerRulesConfig.rules.length === 0) {
            throw new app_error_js_1.ConfigurationError('layer-rules.json must define "rules" array');
        }
        if (!this.sourceFilesConfig.sources || typeof this.sourceFilesConfig.sources !== 'object') {
            throw new app_error_js_1.ConfigurationError('source-files.json must define "sources" object');
        }
        const scanner = this.scannerConfig.scanner;
        if (typeof scanner?.enabled !== 'boolean' ||
            !Number.isInteger(scanner.maxConcurrentFiles) || scanner.maxConcurrentFiles < 1 ||
            !Number.isInteger(scanner.retryAttempts) || scanner.retryAttempts < 0 ||
            !Number.isFinite(scanner.retryDelayMs) || scanner.retryDelayMs < 0 ||
            !Number.isFinite(scanner.stabilityCheckMs) || scanner.stabilityCheckMs < 0 ||
            !Number.isInteger(scanner.stabilityChecks) || scanner.stabilityChecks < 1 ||
            !Number.isFinite(scanner.pollIntervalMs) || scanner.pollIntervalMs <= 0) {
            throw new app_error_js_1.ConfigurationError('Invalid scanner timing, retry or concurrency configuration');
        }
        const app = this.appConfig.app;
        if (!Array.isArray(app?.corsOrigins) || !app.corsOrigins.every(origin => typeof origin === 'string') ||
            !/^\d+(?:ms|s|m|h|d|w|y)$/.test(app.jwt?.expiresIn || '')) {
            throw new app_error_js_1.ConfigurationError('Invalid CORS origins or JWT expiresIn');
        }
        const calc = this.calculationRulesConfig.calculations;
        if (calc?.totalTime?.unit !== 'minute' || calc.totalTime.format !== 'integer' ||
            calc.totalTime.anomalyHandling?.condition !== 'finishBeforeStart' ||
            typeof calc.totalTime.anomalyHandling.fallbackValue !== 'string' ||
            typeof calc.totalTime.anomalyHandling.anomalyFlag !== 'string' ||
            typeof calc.op?.separator !== 'string' || typeof calc.op.innerSeparator !== 'string' || !calc.op.fields?.length) {
            throw new app_error_js_1.ConfigurationError('Invalid calculation rules: supported duration is integer minutes');
        }
        const validation = this.validationRulesConfig;
        if (!validation.requiredMatchingKeys?.length ||
            !validation.requiredMatchingKeys.every(key => ['itemCode', 'lotNo', 'seqNo'].includes(key)) ||
            !validation.rules?.shift?.allowedValues?.length ||
            !Number.isFinite(validation.rules.airPressure?.min) || !Number.isFinite(validation.rules.airPressure?.max) ||
            validation.rules.airPressure.min > validation.rules.airPressure.max || !Number.isFinite(validation.rules.cpk?.minRecommended)) {
            throw new app_error_js_1.ConfigurationError('Invalid validation rules');
        }
        if (!this.scannerConfig.scanner?.pollIntervalMs) {
            throw new app_error_js_1.ConfigurationError('scanner.json must specify "pollIntervalMs"');
        }
        if (!this.outputSchemaConfig.columns || this.outputSchemaConfig.columns.length !== 30) {
            throw new app_error_js_1.ConfigurationError(`output-schema.json must define exactly 30 columns. Current: ${this.outputSchemaConfig.columns?.length}`);
        }
    }
    backupConfig(filename) {
        const backupDir = path_provider_js_1.pathProvider.getConfigBackupDir();
        const sourceFile = path_1.default.join(this.configDir, filename);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const targetFile = path_1.default.join(backupDir, `${filename}.${timestamp}.bak`);
        if (fs_1.default.existsSync(sourceFile)) {
            fs_1.default.copyFileSync(sourceFile, targetFile);
        }
    }
    // Getters
    getDataMapping() {
        return this.dataMappingConfig;
    }
    getCvrDataMapping() {
        return this.cvrDataMappingConfig;
    }
    getLayerRules() {
        return this.layerRulesConfig;
    }
    getSourceFiles() {
        return this.sourceFilesConfig;
    }
    getScannerConfig() {
        return this.scannerConfig;
    }
    getCalculationRules() {
        return this.calculationRulesConfig;
    }
    getValidationRules() {
        return this.validationRulesConfig;
    }
    getOutputSchema() {
        return this.outputSchemaConfig;
    }
    getCvrOutputSchema() {
        return this.cvrOutputSchemaConfig;
    }
    getAppConfig() {
        return this.appConfig;
    }
}
exports.ConfigurationProvider = ConfigurationProvider;
exports.configurationProvider = ConfigurationProvider.getInstance();
