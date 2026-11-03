const SystemConfig = require('../models/SystemConfig');
const WDTSubmission = require('../models/WDTSubmission');
const auditLogger = require('../utils/auditLogger');
const { invalidateAssumptionsCache } = require('../services/assumptionsService');
const { SYSTEM_TEST_ACCOUNT_IDS } = require('../utils/gradeStandardizer');

function formatConfigResponse(doc, unmappedProcesses = []) {
  if (!doc) return { ...SystemConfig.getDefaults(), unmappedProcesses };
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    key: plain.key || SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
    scenarioAssumptions: {
      efficiencyFactor: plain.scenarioAssumptions?.efficiencyFactor ?? SystemConfig.DEFAULT_SCENARIO_ASSUMPTIONS.efficiencyFactor,
      costPerFteLakhs: plain.scenarioAssumptions?.costPerFteLakhs ?? SystemConfig.DEFAULT_SCENARIO_ASSUMPTIONS.costPerFteLakhs
    },
    screeningSettings: {
      standardMonthlyHours: plain.screeningSettings?.standardMonthlyHours ?? SystemConfig.DEFAULT_SCREENING_SETTINGS.standardMonthlyHours,
      screeningThresholdHours: plain.screeningSettings?.screeningThresholdHours ?? SystemConfig.DEFAULT_SCREENING_SETTINGS.screeningThresholdHours,
      screeningKeywords: Array.isArray(plain.screeningSettings?.screeningKeywords)
        ? plain.screeningSettings.screeningKeywords
        : [...SystemConfig.DEFAULT_SCREENING_SETTINGS.screeningKeywords]
    },
    processCategoryMappings: Array.isArray(plain.processCategoryMappings) && plain.processCategoryMappings.length > 0
      ? plain.processCategoryMappings.map(m => ({
          majorProcess: String(m.majorProcess || '').trim(),
          category: String(m.category || '').toLowerCase().trim() === 'support' ? 'support' : 'core'
        }))
      : SystemConfig.DEFAULT_PROCESS_CATEGORY_MAPPINGS.map(m => ({ ...m })),
    unmappedProcesses: Array.isArray(unmappedProcesses) ? unmappedProcesses : [],
    isDefault: false,
    updatedAt: plain.updatedAt || null,
    updatedBy: plain.updatedBy || null
  };
}

async function getAssumptions(req, res) {
  try {
    const config = await SystemConfig.findOne({ key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY }).lean();

    // Identify all in-scope distinct major processes from database submissions
    let unmappedProcesses = [];
    try {
      const distinctPayload = await WDTSubmission.distinct('payload.rows.majorProcess', {
        month: 10,
        year: 2026,
        'employee.employeeId': { $nin: SYSTEM_TEST_ACCOUNT_IDS }
      });
      const distinctActivities = await WDTSubmission.distinct('activities.majorProcess', {
        month: 10,
        year: 2026,
        'employee.employeeId': { $nin: SYSTEM_TEST_ACCOUNT_IDS }
      });
      const allMajorInDb = Array.from(new Set([...distinctPayload, ...distinctActivities].map(s => String(s || '').trim()).filter(Boolean)));

      const activeMappings = (Array.isArray(config?.processCategoryMappings) && config.processCategoryMappings.length > 0)
        ? config.processCategoryMappings
        : SystemConfig.DEFAULT_PROCESS_CATEGORY_MAPPINGS;

      const mappedSet = new Set(activeMappings.map(m => String(m.majorProcess || '').trim().toLowerCase()));
      unmappedProcesses = allMajorInDb.filter(mp => !mappedSet.has(mp.toLowerCase()));
    } catch (discoveryErr) {
      console.warn('Major process discovery warning:', discoveryErr.message);
    }

    if (!config) {
      return res.json({ ...SystemConfig.getDefaults(), unmappedProcesses });
    }
    return res.json(formatConfigResponse(config, unmappedProcesses));
  } catch (err) {
    console.error('Error fetching organization assumptions:', err);
    return res.status(500).json({ message: 'Failed to retrieve organization assumptions', error: err.message });
  }
}

async function updateAssumptions(req, res) {
  try {
    const { scenarioAssumptions, screeningSettings, processCategoryMappings } = req.body || {};

    if (!scenarioAssumptions && !screeningSettings && !processCategoryMappings) {
      return res.status(400).json({
        message: 'Request body must contain scenarioAssumptions, screeningSettings, or processCategoryMappings'
      });
    }

    const updates = {};

    // 1. Validate scenarioAssumptions if provided
    if (scenarioAssumptions !== undefined) {
      if (typeof scenarioAssumptions !== 'object' || scenarioAssumptions === null || Array.isArray(scenarioAssumptions)) {
        return res.status(400).json({ message: 'scenarioAssumptions must be an object' });
      }

      if (scenarioAssumptions.efficiencyFactor !== undefined) {
        const ef = Number(scenarioAssumptions.efficiencyFactor);
        if (!Number.isFinite(ef) || ef < 0 || ef > 1) {
          return res.status(400).json({
            message: 'efficiencyFactor must be a finite number between 0 and 1 (inclusive)'
          });
        }
        updates['scenarioAssumptions.efficiencyFactor'] = ef;
      }

      if (scenarioAssumptions.costPerFteLakhs !== undefined) {
        const cost = Number(scenarioAssumptions.costPerFteLakhs);
        if (!Number.isFinite(cost) || cost < 0 || cost > 1000) {
          return res.status(400).json({
            message: 'costPerFteLakhs must be a finite number between 0 and 1000'
          });
        }
        updates['scenarioAssumptions.costPerFteLakhs'] = cost;
      }
    }

    // 2. Validate screeningSettings if provided
    if (screeningSettings !== undefined) {
      if (typeof screeningSettings !== 'object' || screeningSettings === null || Array.isArray(screeningSettings)) {
        return res.status(400).json({ message: 'screeningSettings must be an object' });
      }

      if (screeningSettings.standardMonthlyHours !== undefined) {
        const smh = Number(screeningSettings.standardMonthlyHours);
        if (!Number.isFinite(smh) || smh < 1 || smh > 744) {
          return res.status(400).json({
            message: 'standardMonthlyHours must be a finite number between 1 and 744 hours'
          });
        }
        updates['screeningSettings.standardMonthlyHours'] = smh;
      }

      if (screeningSettings.screeningThresholdHours !== undefined) {
        const sth = Number(screeningSettings.screeningThresholdHours);
        if (!Number.isFinite(sth) || sth < 0 || sth > 744) {
          return res.status(400).json({
            message: 'screeningThresholdHours must be a finite number between 0 and 744 hours'
          });
        }
        updates['screeningSettings.screeningThresholdHours'] = sth;
      }

      if (screeningSettings.screeningKeywords !== undefined) {
        if (!Array.isArray(screeningSettings.screeningKeywords) || screeningSettings.screeningKeywords.length === 0) {
          return res.status(400).json({
            message: 'screeningKeywords must be a non-empty array of strings'
          });
        }

        const cleanedKeywords = [];
        for (const kw of screeningSettings.screeningKeywords) {
          if (typeof kw !== 'string' || !kw.trim()) {
            return res.status(400).json({
              message: 'Each item in screeningKeywords must be a non-empty string'
            });
          }
          cleanedKeywords.push(kw.trim().toLowerCase());
        }
        updates['screeningSettings.screeningKeywords'] = Array.from(new Set(cleanedKeywords));
      }
    }

    // 3. Validate processCategoryMappings if provided
    if (processCategoryMappings !== undefined) {
      if (!Array.isArray(processCategoryMappings)) {
        return res.status(400).json({ message: 'processCategoryMappings must be an array' });
      }

      const seen = new Set();
      const cleanedMappings = [];

      for (const item of processCategoryMappings) {
        if (!item || typeof item !== 'object') {
          return res.status(400).json({ message: 'Each item in processCategoryMappings must be an object' });
        }
        const majorProcess = String(item.majorProcess || '').trim();
        if (!majorProcess) {
          return res.status(400).json({ message: 'Each item in processCategoryMappings must have a non-empty majorProcess' });
        }
        const norm = majorProcess.toLowerCase();
        if (seen.has(norm)) {
          return res.status(400).json({ message: `Duplicate Major Process name in mappings: "${majorProcess}"` });
        }
        seen.add(norm);

        const category = String(item.category || '').toLowerCase().trim();
        if (!['core', 'support'].includes(category)) {
          return res.status(400).json({
            message: `Invalid category "${item.category}" for "${majorProcess}". Allowed values are "core" or "support"`
          });
        }

        cleanedMappings.push({
          majorProcess,
          category
        });
      }

      updates.processCategoryMappings = cleanedMappings;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'No valid configuration fields provided for update'
      });
    }

    const mongoose = require('mongoose');
    const rawUserId = req.user?.userId || req.user?.id || null;
    const userId = rawUserId && mongoose.Types.ObjectId.isValid(rawUserId) ? rawUserId : null;
    if (userId) {
      updates.updatedBy = userId;
    }

    // Fetch existing document or prepare default snapshot for audit log
    const existingDoc = await SystemConfig.findOne({ key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY }).lean();
    const previousSnapshot = existingDoc ? formatConfigResponse(existingDoc) : SystemConfig.getDefaults();

    // Atomic upsert with $set to guard against arbitrary operators or field injection
    const updatedDoc = await SystemConfig.findOneAndUpdate(
      { key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY },
      {
        $set: updates,
        $setOnInsert: {
          key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    if (!updatedDoc) {
      return res.status(500).json({ message: 'Failed to update organization assumptions in database' });
    }

    const newSnapshot = formatConfigResponse(updatedDoc);

    // Audit logging
    const auditResult = await auditLogger.logAction({
      req,
      action: 'UPDATE_ORGANIZATION_ASSUMPTIONS',
      targetType: 'SystemConfig',
      targetId: SystemConfig.DEFAULT_ASSUMPTIONS_KEY,
      description: 'Organization-wide planning assumptions updated by administrator',
      prev: previousSnapshot,
      next: newSnapshot
    });

    if (!auditResult || !auditResult.success) {
      console.error('Audit logging failed during assumptions update:', auditResult?.error || auditResult?.reason);

      // Compensating rollback: Revert SystemConfig back to previousSnapshot
      let rollbackSucceeded = false;
      try {
        if (existingDoc) {
          await SystemConfig.findOneAndUpdate(
            { key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY },
            {
              $set: {
                scenarioAssumptions: existingDoc.scenarioAssumptions,
                screeningSettings: existingDoc.screeningSettings,
                updatedBy: existingDoc.updatedBy,
                updatedAt: existingDoc.updatedAt
              }
            }
          );
        } else {
          // If no doc existed previously, remove the created singleton doc
          await SystemConfig.deleteOne({ key: SystemConfig.DEFAULT_ASSUMPTIONS_KEY });
        }
        rollbackSucceeded = true;
      } catch (rollbackErr) {
        console.error('Compensating rollback failed:', rollbackErr);
      }

      // Always invalidate assumptions cache so stale dirty data is not served
      invalidateAssumptionsCache();

      if (rollbackSucceeded) {
        return res.status(500).json({
          message: 'Failed to record audit trail log. Update was rolled back successfully; assumptions were not changed.',
          rolledBack: true,
          error: auditResult?.error || auditResult?.reason || 'Audit log creation failed'
        });
      } else {
        return res.status(500).json({
          message: 'Failed to record audit trail log and compensating rollback encountered an error. Assumptions may remain modified.',
          rolledBack: false,
          error: auditResult?.error || auditResult?.reason || 'Audit log creation failed'
        });
      }
    }

    // Invalidate caches so subsequent report queries reflect the updated assumptions immediately
    invalidateAssumptionsCache();

    return res.json({
      message: 'Organization assumptions successfully updated',
      data: newSnapshot
    });
  } catch (err) {
    console.error('Error updating organization assumptions:', err);
    return res.status(500).json({ message: 'Failed to update organization assumptions', error: err.message });
  }
}

module.exports = {
  getAssumptions,
  updateAssumptions,
  formatConfigResponse
};
