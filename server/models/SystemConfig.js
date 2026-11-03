const mongoose = require('mongoose');

const DEFAULT_ASSUMPTIONS_KEY = 'organization_assumptions';

const DEFAULT_SCENARIO_ASSUMPTIONS = {
  efficiencyFactor: 0.35,
  costPerFteLakhs: 10
};

const DEFAULT_SCREENING_SETTINGS = {
  standardMonthlyHours: 160,
  screeningThresholdHours: 26,
  screeningKeywords: ['automation', 'rpa', 'repeat']
};

const DEFAULT_PROCESS_CATEGORY_MAPPINGS = [
  { majorProcess: 'Additional Activities - Meeting', category: 'support' },
  { majorProcess: 'Additional Activities - Others', category: 'support' },
  { majorProcess: 'Additional Activities - Training', category: 'support' },
  { majorProcess: 'Others', category: 'support' },
  { majorProcess: 'Accounts Payable', category: 'core' },
  { majorProcess: 'Accounts Receivable', category: 'core' },
  { majorProcess: 'Banking and Treasury', category: 'core' },
  { majorProcess: 'Book closing & Audit', category: 'core' },
  { majorProcess: 'Capex and Project Accounting', category: 'core' },
  { majorProcess: 'Corporate Finance', category: 'core' },
  { majorProcess: 'ESG', category: 'core' },
  { majorProcess: 'FP&A', category: 'core' },
  { majorProcess: 'Insurance', category: 'core' },
  { majorProcess: 'Inventory Management', category: 'core' },
  { majorProcess: 'Investor Relationship management', category: 'core' },
  { majorProcess: 'Liquidity Management', category: 'core' },
  { majorProcess: 'Secretarial', category: 'core' },
  { majorProcess: 'Taxation (DT & IDT)', category: 'core' }
];

const systemConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    default: DEFAULT_ASSUMPTIONS_KEY
  },
  scenarioAssumptions: {
    efficiencyFactor: {
      type: Number,
      required: true,
      default: DEFAULT_SCENARIO_ASSUMPTIONS.efficiencyFactor,
      min: 0,
      max: 1
    },
    costPerFteLakhs: {
      type: Number,
      required: true,
      default: DEFAULT_SCENARIO_ASSUMPTIONS.costPerFteLakhs,
      min: 0,
      max: 1000
    }
  },
  screeningSettings: {
    standardMonthlyHours: {
      type: Number,
      required: true,
      default: DEFAULT_SCREENING_SETTINGS.standardMonthlyHours,
      min: 1,
      max: 744
    },
    screeningThresholdHours: {
      type: Number,
      required: true,
      default: DEFAULT_SCREENING_SETTINGS.screeningThresholdHours,
      min: 0,
      max: 744
    },
    screeningKeywords: {
      type: [{
        type: String,
        trim: true
      }],
      default: DEFAULT_SCREENING_SETTINGS.screeningKeywords,
      validate: {
        validator: function(arr) {
          if (!Array.isArray(arr) || arr.length === 0) return false;
          return arr.every(k => typeof k === 'string' && k.trim().length > 0);
        },
        message: 'screeningKeywords must be a non-empty array of non-empty strings'
      }
    }
  },
  processCategoryMappings: {
    type: [{
      majorProcess: {
        type: String,
        required: true,
        trim: true
      },
      category: {
        type: String,
        required: true,
        enum: ['core', 'support'],
        lowercase: true,
        trim: true
      }
    }],
    default: DEFAULT_PROCESS_CATEGORY_MAPPINGS,
    validate: {
      validator: function(arr) {
        if (!Array.isArray(arr)) return false;
        const seen = new Set();
        for (const item of arr) {
          if (!item || typeof item.majorProcess !== 'string' || !item.majorProcess.trim()) return false;
          const norm = item.majorProcess.trim().toLowerCase();
          if (seen.has(norm)) return false;
          seen.add(norm);
          if (!['core', 'support'].includes(String(item.category || '').toLowerCase().trim())) return false;
        }
        return true;
      },
      message: 'processCategoryMappings must have unique majorProcess names with valid category ("core" or "support")'
    }
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  collection: 'system_configs',
  timestamps: true
});

systemConfigSchema.statics.DEFAULT_ASSUMPTIONS_KEY = DEFAULT_ASSUMPTIONS_KEY;
systemConfigSchema.statics.DEFAULT_SCENARIO_ASSUMPTIONS = DEFAULT_SCENARIO_ASSUMPTIONS;
systemConfigSchema.statics.DEFAULT_SCREENING_SETTINGS = DEFAULT_SCREENING_SETTINGS;
systemConfigSchema.statics.DEFAULT_PROCESS_CATEGORY_MAPPINGS = DEFAULT_PROCESS_CATEGORY_MAPPINGS;

systemConfigSchema.statics.getDefaults = function() {
  return {
    key: DEFAULT_ASSUMPTIONS_KEY,
    scenarioAssumptions: { ...DEFAULT_SCENARIO_ASSUMPTIONS },
    screeningSettings: {
      standardMonthlyHours: DEFAULT_SCREENING_SETTINGS.standardMonthlyHours,
      screeningThresholdHours: DEFAULT_SCREENING_SETTINGS.screeningThresholdHours,
      screeningKeywords: [...DEFAULT_SCREENING_SETTINGS.screeningKeywords]
    },
    processCategoryMappings: DEFAULT_PROCESS_CATEGORY_MAPPINGS.map(m => ({ ...m })),
    isDefault: true,
    updatedAt: null,
    updatedBy: null
  };
};

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
