const SystemConfig = require('../models/SystemConfig');

// In-memory cache for organization assumptions to eliminate DB latency on repeated report requests
let cachedAssumptions = null;
let cachedExpiresAt = 0;
const ASSUMPTIONS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Registered external cache invalidation hooks to decouple controllers
const reportCacheInvalidators = new Set();

function registerReportCacheInvalidator(fn) {
  if (typeof fn === 'function') {
    reportCacheInvalidators.add(fn);
  }
}

function invalidateAssumptionsCache() {
  cachedAssumptions = null;
  cachedExpiresAt = 0;
  // Trigger all registered report cache invalidators cleanly
  for (const invalidator of reportCacheInvalidators) {
    try {
      invalidator();
    } catch (e) {
      console.warn('Error in registered cache invalidator:', e.message);
    }
  }
}

function normalizeAssumptions(rawDoc) {
  const defaults = SystemConfig.getDefaults();
  if (!rawDoc) return defaults;

  const plain = typeof rawDoc.toObject === 'function' ? rawDoc.toObject() : rawDoc;

  const efficiencyFactor = Number(plain.scenarioAssumptions?.efficiencyFactor);
  const costPerFteLakhs = Number(plain.scenarioAssumptions?.costPerFteLakhs);
  const standardMonthlyHours = Number(plain.screeningSettings?.standardMonthlyHours);
  const screeningThresholdHours = Number(plain.screeningSettings?.screeningThresholdHours);
  const rawKeywords = plain.screeningSettings?.screeningKeywords;

  return {
    key: plain.key || defaults.key,
    scenarioAssumptions: {
      efficiencyFactor: Number.isFinite(efficiencyFactor) && efficiencyFactor >= 0 && efficiencyFactor <= 1
        ? efficiencyFactor
        : defaults.scenarioAssumptions.efficiencyFactor,
      costPerFteLakhs: Number.isFinite(costPerFteLakhs) && costPerFteLakhs >= 0
        ? costPerFteLakhs
        : defaults.scenarioAssumptions.costPerFteLakhs
    },
    screeningSettings: {
      standardMonthlyHours: Number.isFinite(standardMonthlyHours) && standardMonthlyHours > 0
        ? standardMonthlyHours
        : defaults.screeningSettings.standardMonthlyHours,
      screeningThresholdHours: Number.isFinite(screeningThresholdHours) && screeningThresholdHours >= 0
        ? screeningThresholdHours
        : defaults.screeningSettings.screeningThresholdHours,
      screeningKeywords: Array.isArray(rawKeywords) && rawKeywords.length > 0
        ? Array.from(new Set(rawKeywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)))
        : [...defaults.screeningSettings.screeningKeywords]
    },
    isDefault: plain.isDefault ?? false,
    updatedAt: plain.updatedAt || null,
    updatedBy: plain.updatedBy || null
  };
}

async function getEffectiveAssumptions() {
  const now = Date.now();
  if (cachedAssumptions && cachedExpiresAt > now) {
    return cachedAssumptions;
  }

  try {
    const doc = await SystemConfig.findOne({ key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY }).lean();
    const normalized = normalizeAssumptions(doc);
    cachedAssumptions = normalized;
    cachedExpiresAt = now + ASSUMPTIONS_CACHE_TTL_MS;
    return normalized;
  } catch (err) {
    console.error('Error in assumptionsService reading SystemConfig:', err.message);
    // Return safe schema defaults without crashing report generation
    return SystemConfig.getDefaults();
  }
}

function resolveReportParameters(orgAssumptions, query = {}, userRole = '') {
  const isManagerOrAdmin = ['admin', 'manager'].includes(String(userRole || '').toLowerCase());

  // Base parameters originate from the persisted organization assumptions
  let efficiencyFactor = orgAssumptions.scenarioAssumptions.efficiencyFactor;
  let costPerFteLakhs = orgAssumptions.scenarioAssumptions.costPerFteLakhs;
  let standardMonthlyHours = orgAssumptions.screeningSettings.standardMonthlyHours;
  let screeningThresholdHours = orgAssumptions.screeningSettings.screeningThresholdHours;
  let screeningKeywords = [...orgAssumptions.screeningSettings.screeningKeywords];

  let isWhatIfScenario = false;
  const simulationOverrides = {};

  // Optional what-if query override for analysts (Admin or Manager only), strictly sandboxed to current request
  if (isManagerOrAdmin) {
    // 1. Primary scenario assumptions can always be simulated via what-if
    if (query.efficiencyFactor !== undefined) {
      const qEf = Number(query.efficiencyFactor);
      if (Number.isFinite(qEf) && qEf >= 0 && qEf <= 1 && qEf !== efficiencyFactor) {
        efficiencyFactor = qEf;
        isWhatIfScenario = true;
        simulationOverrides.efficiencyFactor = qEf;
      }
    }
    if (query.costPerFteLakhs !== undefined) {
      const qCost = Number(query.costPerFteLakhs);
      if (Number.isFinite(qCost) && qCost >= 0 && qCost <= 1000 && qCost !== costPerFteLakhs) {
        costPerFteLakhs = qCost;
        isWhatIfScenario = true;
        simulationOverrides.costPerFteLakhs = qCost;
      }
    }

    // 2. Advanced screening overrides require explicit simulation authorization: allowAdvancedSimulation === 'true'
    const allowAdvanced = String(query.allowAdvancedSimulation || '').toLowerCase() === 'true';

    if (allowAdvanced) {
      if (query.standardMonthlyHours !== undefined) {
        const qHours = Number(query.standardMonthlyHours);
        if (Number.isFinite(qHours) && qHours >= 1 && qHours <= 744 && qHours !== standardMonthlyHours) {
          standardMonthlyHours = qHours;
          isWhatIfScenario = true;
          simulationOverrides.standardMonthlyHours = qHours;
        }
      }
      if (query.screeningThresholdHours !== undefined) {
        const qTh = Number(query.screeningThresholdHours);
        if (Number.isFinite(qTh) && qTh >= 0 && qTh <= 744 && qTh !== screeningThresholdHours) {
          screeningThresholdHours = qTh;
          isWhatIfScenario = true;
          simulationOverrides.screeningThresholdHours = qTh;
        }
      }
      const rawKw = query.screeningKeywords !== undefined ? query.screeningKeywords : query.keywords;
      if (typeof rawKw === 'string' && rawKw.trim().length > 0) {
        const parsed = rawKw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (parsed.length > 0) {
          const deduplicated = Array.from(new Set(parsed));
          screeningKeywords = deduplicated;
          isWhatIfScenario = true;
          simulationOverrides.screeningKeywords = deduplicated;
        }
      }
    }
  }

  const costPerFteCr = costPerFteLakhs / 100;

  return {
    efficiencyFactor,
    costPerFteLakhs,
    costPerFteCr,
    standardMonthlyHours,
    screeningThresholdHours,
    screeningKeywords,
    isWhatIfScenario,
    simulationOverrides
  };
}

module.exports = {
  getEffectiveAssumptions,
  normalizeAssumptions,
  resolveReportParameters,
  invalidateAssumptionsCache,
  registerReportCacheInvalidator
};
