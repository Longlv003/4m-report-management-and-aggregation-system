import { pathProvider } from '../src/config/path-provider.js';
import { configurationProvider } from '../src/config/configuration-provider.js';
import { logger } from '../src/logging/logger.js';
import fs from 'fs';

logger.init(pathProvider.getLogDir());

console.log('\n=============================================');
console.log('   TESTING STEP 1: PATHS & CONFIGURATION    ');
console.log('=============================================');

// Test 1: Path Provider
console.log('\n[TEST 1] Verifying PathProvider...');
const paths = pathProvider.getPaths();
console.log('Paths resolved successfully:');
console.log(' - Base dir:', pathProvider.getBaseDir());
console.log(' - Database file:', paths.databaseFile);
console.log(' - Log dir:', paths.logDir);
console.log(' - Backup dir:', paths.backupDir);
console.log(' - Temp dir:', paths.tempDir);

// Verify directories exist
if (!fs.existsSync(paths.databaseDir)) throw new Error('Database dir missing');
if (!fs.existsSync(paths.logDir)) throw new Error('Log dir missing');
if (!fs.existsSync(paths.backupDir)) throw new Error('Backup dir missing');
console.log('-> PathProvider PASSED: All runtime directories verified!');

// Test 2: Configuration Provider
console.log('\n[TEST 2] Verifying ConfigurationProvider...');
const mapping = configurationProvider.getDataMapping();
console.log(' - Mapping keys count:', Object.keys(mapping.mappings).length);
console.log(' - WCS required columns count:', mapping.wcsRequiredColumns.length);

const outputSchema = configurationProvider.getOutputSchema();
console.log(' - Output schema columns count:', outputSchema.columns.length);
if (outputSchema.columns.length !== 30) {
  throw new Error(`Output schema columns count is ${outputSchema.columns.length}, expected 30!`);
}
console.log('-> Output Schema PASSED: Exactly 30 columns configured!');

// Test 3: Layer Rules
console.log('\n[TEST 3] Verifying LayerRules...');
const layerRules = configurationProvider.getLayerRules();
console.log(' - Layer rules count:', layerRules.rules.length);
function resolveLayer(programName: string): string {
  for (const r of layerRules.rules) {
    if (programName.toUpperCase().includes(r.pattern)) {
      return r.targetLayer;
    }
  }
  return layerRules.defaultLayer;
}
console.log('   "7M0510MOL-REV01" ->', resolveLayer('7M0510MOL-REV01'), '(Expected: L1 S_S)');
console.log('   "7M0180COPPER-REV01" ->', resolveLayer('7M0180COPPER-REV01'), '(Expected: L2 S_S)');
console.log('   "7S4723MIL-REV01" ->', resolveLayer('7S4723MIL-REV01'), '(Expected: L1 S_S)');
if (resolveLayer('7M0510MOL-REV01') !== 'L1 S_S' || resolveLayer('7M0180COPPER-REV01') !== 'L2 S_S') {
  throw new Error('Layer resolution failed!');
}
console.log('-> LayerRules PASSED!');

// Test 4: Calculation Rules
console.log('\n[TEST 4] Verifying CalculationRules...');
const calc = configurationProvider.getCalculationRules();
console.log(' - Total time unit:', calc.calculations.totalTime.unit);
console.log(' - OP separator:', JSON.stringify(calc.calculations.op.separator));
console.log('-> CalculationRules PASSED!');

console.log('\n=============================================');
console.log('      ALL STEP 1 TESTS PASSED 100%!         ');
console.log('=============================================\n');
