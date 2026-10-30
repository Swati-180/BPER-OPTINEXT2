const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  computeScore,
  evaluateConsolidation,
  planSeed,
  isNumericLabel
} = require('../scripts/seed_6x6_curated_authoritative');
const { rollbackSelective } = require('../scripts/rollback_selective');
const { rollbackFromBackup } = require('../scripts/rollback_6x6');

console.log('=== RUNNING ENHANCED PAM 6x6 SEED & SELECTIVE ROLLBACK TEST SUITE ===\n');

// 1. Test Score Calculation Formula (Slide 7)
{
  const criteria = ['H', 'H', 'H', 'L', 'L', 'L', 'H', 'H', 'H', 'L', 'L', 'L'];
  const score = computeScore(criteria);
  assert.strictEqual(score, 6, 'Score must be 6');
  console.log('✓ Test 1 Passed: 6x6 Score Calculation formula is exact.');
}

// 2. Test Checkpoint A: High Proximity Exception (Slide 7)
{
  const criteria = [
    'H', 'H', 'H', 'H', 'H', 'H',
    'H', 'H', 'H', 'H', 'L', 'L'
  ];
  const res = evaluateConsolidation(criteria);
  assert.strictEqual(res.score, 8);
  assert.strictEqual(res.hasException, true);
  assert.strictEqual(res.consolidated, false);
  console.log('✓ Test 2 Passed: Checkpoint A (High Proximity) excludes process.');
}

// 3. Test Checkpoint B: Joint High Sensitivity & Criticality Exception (Slide 7)
{
  const criteria = [
    'H', 'H', 'H', 'H', 'H', 'H',
    'H', 'H', 'L', 'L', 'H', 'H'
  ];
  const res = evaluateConsolidation(criteria);
  assert.strictEqual(res.score, 8);
  assert.strictEqual(res.hasException, true);
  assert.strictEqual(res.consolidated, false);
  console.log('✓ Test 3 Passed: Checkpoint B (Joint High Sensitivity & Criticality) excludes process.');
}

// 4. Test Single High Sensitivity (Without High Criticality) Does NOT Trigger Checkpoint B
{
  const criteria = [
    'H', 'H', 'H', 'H', 'H', 'H',
    'H', 'L', 'L', 'L', 'H', 'H'
  ];
  const res = evaluateConsolidation(criteria);
  assert.strictEqual(res.score, 9);
  assert.strictEqual(res.hasException, false);
  assert.strictEqual(res.consolidated, true);
  console.log('✓ Test 4 Passed: Isolated Sensitivity does not trigger Checkpoint B.');
}

// 5. Test Skipping of Ambiguous Numeric Labels
{
  assert.strictEqual(isNumericLabel('1.1'), true);
  assert.strictEqual(isNumericLabel('3.10'), true);
  assert.strictEqual(isNumericLabel('P2P.7.001'), false);
  assert.strictEqual(isNumericLabel('360 Degree Feedback Administration'), false);
  console.log('✓ Test 5 Passed: Ambiguous numeric labels correctly identified for skipping.');
}

// 6. Test Deduplication of Duplicate Activity Names Within Department
{
  const mockCuratedWithDupes = [
    {
      id: 'F&A',
      name: 'Finance & Accounting',
      processes: [
        {
          name: 'Accounts Payables',
          activities: [
            {
              id: '9.18',
              name: 'Raising Debit / Credit Notes',
              type: 'Transactional',
              parameters: { 'Multiple Locns': 'H', Routine: 'H', Volumes: 'H', Manpower: 'H', SOPs: 'H', 'ERP / Technology': 'H', Sensitivity: 'L', Criticality: 'L', Controls: 'L', Proximity: 'L', Regulatory: 'L', Skill: 'L' },
              score: 12,
              consolidate: true
            }
          ]
        },
        {
          name: 'Billing',
          activities: [
            {
              id: '16.1',
              name: 'Raising Debit / Credit Notes',
              type: 'Transactional',
              parameters: { 'Multiple Locns': 'H', Routine: 'H', Volumes: 'H', Manpower: 'H', SOPs: 'H', 'ERP / Technology': 'H', Sensitivity: 'L', Criticality: 'L', Controls: 'L', Proximity: 'L', Regulatory: 'L', Skill: 'L' },
              score: 12,
              consolidate: true
            }
          ]
        }
      ]
    }
  ];

  const plan = planSeed(mockCuratedWithDupes, []);
  assert.strictEqual(plan.insertNewCurated.length, 1, 'Duplicate activity in curated JSON must only produce 1 planned insert');
  console.log('✓ Test 6 Passed: Duplicate activity names in curated JSON deduplicated safely.');
}

// 7. Test Idempotent Rerun
{
  const mockCurated = [
    {
      id: 'HR',
      name: 'HR',
      processes: [
        {
          name: 'Recruitment',
          activities: [
            {
              id: '1.1',
              name: 'Screening',
              parameters: { 'Multiple Locns': 'H', Routine: 'H', Volumes: 'H', Manpower: 'H', SOPs: 'H', 'ERP / Technology': 'H', Sensitivity: 'L', Criticality: 'L', Controls: 'L', Proximity: 'L', Regulatory: 'L', Skill: 'L' },
              score: 12,
              consolidate: true
            }
          ]
        }
      ]
    }
  ];

  // After first run, DB contains Screening with assessed score 12
  const seededDb = [
    {
      _id: 'hr-1',
      department: 'HR',
      process: 'Screening',
      criteria: ['H','H','H','H','H','H','L','L','L','L','L','L'],
      score: 12,
      consolidated: true
    }
  ];

  const planRerun = planSeed(mockCurated, seededDb);
  assert.strictEqual(planRerun.insertNewCurated.length, 0, 'Rerun must not insert existing record');
  assert.strictEqual(planRerun.updatePendingWithCurated.length, 0, 'Rerun must not update non-pending record');
  assert.strictEqual(planRerun.preserveUserAssessed.length, 1, 'Rerun must preserve existing record');
  console.log('✓ Test 7 Passed: Idempotent rerun produces zero changes.');
}

// 8. Test Selective Rollback & Refusal on Subsequent User Modifications
(async () => {
  const seedTime = new Date('2026-10-27T10:00:00Z');
  const manifest = {
    executedAt: seedTime.toISOString(),
    updatedRecords: [
      {
        id: 'doc-pending-1',
        dept: 'Finance & Accounting',
        process: 'Stores Audit',
        preImage: { criteria: Array(12).fill('-'), score: 0, consolidated: null },
        postImageCriteria: ['H','H','H','L','L','L','H','H','L','L','L','L']
      },
      {
        id: 'doc-pending-2',
        dept: 'Finance & Accounting',
        process: 'Fixed Asset Register',
        preImage: { criteria: Array(12).fill('-'), score: 0, consolidated: null },
        postImageCriteria: ['H','H','H','H','H','H','L','L','L','L','L','L']
      }
    ],
    insertedIds: ['new-act-1', 'new-act-2'],
    curatedInsertedMap: {
      'new-act-1': { criteria: ['H','H','H','H','H','H','L','L','L','L','L','L'] },
      'new-act-2': { criteria: ['H','H','H','H','H','H','L','L','L','L','L','L'] }
    }
  };

  // Mock DB State where:
  // - doc-pending-1 was NOT touched by any user after seed -> SAFE TO REVERT
  // - doc-pending-2 WAS modified by a manager after seed -> MUST REFUSE REVERT!
  // - new-act-1 was NOT touched by user -> SAFE TO DELETE
  // - new-act-2 WAS modified by user -> MUST REFUSE DELETE!
  const dbStore = new Map([
    ['doc-pending-1', {
      _id: 'doc-pending-1',
      process: 'Stores Audit',
      criteria: ['H','H','H','L','L','L','H','H','L','L','L','L'],
      score: 6,
      updatedAt: new Date('2026-10-27T10:00:10Z')
    }],
    ['doc-pending-2', {
      _id: 'doc-pending-2',
      process: 'Fixed Asset Register',
      criteria: ['L','L','L','L','L','L','H','H','H','H','H','H'], // Manager customized it!
      score: 0,
      updatedAt: new Date('2026-10-27T10:15:00Z') // 15 mins later
    }],
    ['new-act-1', {
      _id: 'new-act-1',
      process: 'New Activity 1',
      criteria: ['H','H','H','H','H','H','L','L','L','L','L','L'],
      updatedAt: new Date('2026-10-27T10:00:10Z')
    }],
    ['new-act-2', {
      _id: 'new-act-2',
      process: 'New Activity 2',
      criteria: ['M','M','M','M','M','M','M','M','M','M','M','M'], // Manager assessed it!
      updatedAt: new Date('2026-10-27T10:20:00Z')
    }]
  ]);

  const mockModel = {
    findById: async (id) => dbStore.get(id),
    findByIdAndUpdate: async (id, update) => {
      const doc = dbStore.get(id);
      Object.assign(doc, update);
      return doc;
    },
    findByIdAndDelete: async (id) => {
      dbStore.delete(id);
    }
  };

  const manifestPath = path.join(__dirname, 'mock_manifest_test.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const rollbackResult = await rollbackSelective(manifestPath, mockModel);
  fs.unlinkSync(manifestPath);

  assert.strictEqual(rollbackResult.revertedUpdates, 1, 'Only doc-pending-1 should be reverted');
  assert.strictEqual(rollbackResult.refusedUpdates.length, 1, 'doc-pending-2 must be refused');
  assert.strictEqual(rollbackResult.refusedUpdates[0].id, 'doc-pending-2');
  assert.strictEqual(rollbackResult.deletedInserts, 1, 'Only new-act-1 should be deleted');
  assert.strictEqual(rollbackResult.refusedDeletes.length, 1, 'new-act-2 must be refused deletion');

  // Verify doc-pending-1 was restored to pending
  assert.deepStrictEqual(dbStore.get('doc-pending-1').criteria, Array(12).fill('-'));
  // Verify doc-pending-2 was preserved with user customization
  assert.strictEqual(dbStore.get('doc-pending-2').score, 0);

  console.log('✓ Test 8 Passed: Selective rollback safely reverts untouched records and strictly REFUSES to overwrite subsequent user changes.');
  console.log('\n>>> ALL 8 ADVANCED UNIT & REGRESSION TESTS PASSED! <<<');
})();
