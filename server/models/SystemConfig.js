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

systemConfigSchema.statics.getDefaults = function() {
  return {
    key: DEFAULT_ASSUMPTIONS_KEY,
    scenarioAssumptions: { ...DEFAULT_SCENARIO_ASSUMPTIONS },
    screeningSettings: {
      standardMonthlyHours: DEFAULT_SCREENING_SETTINGS.standardMonthlyHours,
      screeningThresholdHours: DEFAULT_SCREENING_SETTINGS.screeningThresholdHours,
      screeningKeywords: [...DEFAULT_SCREENING_SETTINGS.screeningKeywords]
    },
    isDefault: true,
    updatedAt: null,
    updatedBy: null
  };
};

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
