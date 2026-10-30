/**
 * test_isolated_failure_recovery.js
 *
 * Tests partial-failure handling, manifest recording, duplicate-key conflicts,
 * selective rollback refusal, and re-run recovery using MongoMemoryServer only.
 * STRICTLY 100% ISOLATED: ZERO CONNECTION TO MONGODB ATLAS.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { runSeed, planSeed } = require('../scripts/seed_6x6_curated_authoritative');
const { rollbackSelective } = require('../scripts/rollback_selective');

async function runFailureRecoverySuite() {
  console.log('================================================================');
  console.log('STARTING ISOLATED FAILURE-RECOVERY & TRANSACTION REGRESSION TEST');
  console.log('Environment: In-Memory MongoMemoryServer (Zero Atlas Connection)');
  console.log('================================================================\n');

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  console.log(`✔ Isolated test database started at: ${uri}\n`);

  await mongoose.connect(uri);

  // Define ProcessAnalysis schema in isolated test
  const processAnalysisSchema = new mongoose.Schema({
    process: { type: String, required: true },
    department: { type: String, required: true },
    type: { type: String, required: true },
    criteria: [{ type: String }],
    score: { type: Number },
    consolidated: { type: Boolean }
  }, { timestamps: true });
  processAnalysisSchema.index({ process: 1, department: 1 }, { unique: true });

  const TestModel = mongoose.model('TestProcessAnalysis', processAnalysisSchema);

  try {
    // -------------------------------------------------------------
    // Scenario 1: Setup baseline with 2 pending records and 1 assessed record
    // -------------------------------------------------------------
    console.log('--- SCENARIO 1: Setting up synthetic baseline fixtures ---');
    const pendingDoc1 = await TestModel.create({
      process: 'Approvals for expenses (operating / capital)',
      department: 'Finance & Accounting',
      type: 'core',
      criteria: Array(12).fill('-'),
      score: 0,
      consolidated: false
    });

    const pendingDoc2 = await TestModel.create({
      process: 'Maintenance of Fixed Asset Register',
      department: 'Finance & Accounting',
      type: 'core',
      criteria: Array(12).fill('-'),
      score: 0,
      consolidated: false
    });

    const userAssessedDoc = await TestModel.create({
      process: 'Sourcing Resumes',
      department: 'HR',
      type: 'core',
      criteria: ['-','M','M','M','L','-','-','L','M','H','-','L'],
      score: 2,
      consolidated: false
    });

    const unrelatedDoc = await TestModel.create({
      process: 'Unrelated Process Alpha',
      department: 'Finance & Accounting',
      type: 'core',
      criteria: Array(12).fill('-'),
      score: 0,
      consolidated: false
    });

    console.log('✔ Synthetic baseline established: 2 pending, 1 user-assessed, 1 unrelated doc.');

    // -------------------------------------------------------------
    // Scenario 2: Simulate Seed Partial Failure (interrupted after 1 update & duplicate insert)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 2: Simulating Seed Execution with Duplicate-Key Conflict ---');

    // Mock insertMany to simulate a partial failure race condition
    const originalInsertMany = TestModel.insertMany;
    let insertManyCalled = false;
    TestModel.insertMany = async function(docs, opts) {
      insertManyCalled = true;
      // Insert first doc successfully
      const firstDoc = await TestModel.create(docs[0]);
      // Then throw duplicate key error with insertedDocs attached
      const bulkErr = new Error('E11000 duplicate key error collection: test.processanalyses index: process_1_department_1 dup key');
      bulkErr.code = 11000;
      bulkErr.insertedDocs = [firstDoc];
      throw bulkErr;
    };

    // Execute runSeed with execute: true on the isolated model
    const seedResult = await runSeed({
      execute: true,
      ProcessAnalysisModel: TestModel
    });

    TestModel.insertMany = originalInsertMany; // Restore

    assert.strictEqual(seedResult.executed, true);
    assert.strictEqual(seedResult.partial, true, 'Seed must report partial failure due to duplicate-key conflict');
    assert.ok(fs.existsSync(seedResult.manifestFile), 'Manifest file must be created even on partial failure');

    const manifest = JSON.parse(fs.readFileSync(seedResult.manifestFile, 'utf8'));
    assert.strictEqual(manifest.status, 'PARTIAL_FAILURE');
    assert.ok(manifest.updatedRecords.length > 0, 'Updated records must be recorded in manifest');
    assert.strictEqual(manifest.insertedIds.length, 1, 'Partially inserted record must be captured in manifest');
    console.log(`✔ Seed partial failure handled gracefully. Manifest recorded: ${manifest.updatedRecords.length} updates, ${manifest.insertedIds.length} inserted, status: ${manifest.status}`);

    // -------------------------------------------------------------
    // Scenario 3: Simulate Manager Modifying One Activity Post-Seed
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Simulating Manager Updating Record Post-Seed ---');
    // Manager updates pendingDoc1 post-seed
    await TestModel.findByIdAndUpdate(pendingDoc1._id, {
      criteria: ['H','H','H','H','H','H','H','H','H','H','H','H'],
      score: 6,
      consolidated: false
    });
    console.log(`✔ Manager customized criteria on "${pendingDoc1.process}" post-seed.`);

    // -------------------------------------------------------------
    // Scenario 4: Selective Rollback Verification
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Executing Selective Rollback ---');
    const rollbackRes = await rollbackSelective(seedResult.manifestFile, TestModel);
    console.log('Rollback Summary:', {
      revertedUpdates: rollbackRes.revertedUpdates,
      refusedUpdates: rollbackRes.refusedUpdates.length,
      deletedInserts: rollbackRes.deletedInserts,
      refusedDeletes: rollbackRes.refusedDeletes.length
    });

    // pendingDoc1 was modified by manager -> rollback must REFUSE to touch it
    assert.strictEqual(rollbackRes.refusedUpdates.length, 1);
    assert.strictEqual(String(rollbackRes.refusedUpdates[0].id), String(pendingDoc1._id));
    const postRollbackPending1 = await TestModel.findById(pendingDoc1._id);
    assert.strictEqual(postRollbackPending1.score, 6, 'User customized score must remain preserved');

    // pendingDoc2 was untouched by manager -> rollback must revert it to pending
    const postRollbackPending2 = await TestModel.findById(pendingDoc2._id);
    assert.deepStrictEqual(postRollbackPending2.criteria, Array(12).fill('-'), 'Untouched pendingDoc2 must revert to pending');

    // User assessed doc must remain 100% untouched
    const postRollbackUserAssessed = await TestModel.findById(userAssessedDoc._id);
    assert.strictEqual(postRollbackUserAssessed.score, 2);

    // Unrelated doc must remain 100% untouched
    const postRollbackUnrelated = await TestModel.findById(unrelatedDoc._id);
    assert.ok(postRollbackUnrelated, 'Unrelated doc must never be deleted or altered');

    console.log('✔ Selective rollback safely preserved manager customizations and untouched unrelated data.');

    // -------------------------------------------------------------
    // Scenario 5: Re-running Seed Post-Rollback (Idempotency Recovery)
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Rerunning Seed Post-Rollback ---');
    const rerunResult = await runSeed({
      execute: false, // dry-run plan
      ProcessAnalysisModel: TestModel
    });

    assert.ok(rerunResult.plan, 'Rerun plan must succeed without crashing');
    console.log(`✔ Post-rollback rerun planned cleanly: ${rerunResult.plan.insertNewCurated.length} inserts, ${rerunResult.plan.updatePendingWithCurated.length} updates.`);

    // Cleanup manifest & backup file created during test
    if (fs.existsSync(seedResult.manifestFile)) fs.unlinkSync(seedResult.manifestFile);
    if (fs.existsSync(seedResult.backupFile)) fs.unlinkSync(seedResult.backupFile);

    console.log('\n================================================================');
    console.log('✔ ALL ISOLATED FAILURE-RECOVERY & TRANSACTION ASSERTIONS PASSED!');
    console.log('================================================================\n');
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
}

runFailureRecoverySuite().catch(err => {
  console.error('Failure recovery test failed:', err);
  process.exit(1);
});
