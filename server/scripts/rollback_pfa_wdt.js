const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const WDTSubmission = require('../models/WDTSubmission');
const Taxonomy = require('../models/Taxonomy');

const BATCH_ID = 'PFA-DEMO-OCT-2026';
const SNAPSHOT_FILE = path.join(__dirname, 'taxonomy_snapshot_pfa.json');
const isConfirmed = process.argv.includes('--confirm');

async function rollback() {
  console.log('================================================================');
  console.log('PFA WDT ROLLBACK UTILITY');
  console.log(`Target Batch ID: ${BATCH_ID}`);
  console.log(`Mode:            ${isConfirmed ? 'CONFIRMED (Executing rollback)' : 'PREVIEW (Pass --confirm to apply)'}`);
  console.log('================================================================\n');

  const mongoUri = process.env.MONGODB_URI || '';
  const maskedUri = mongoUri.replace(/:([^:@]+)@/, ':****@');
  console.log(`Connecting to: ${maskedUri}`);
  await mongoose.connect(mongoUri);

  // 1. Identify Submissions to remove
  const matchingSubmissions = await WDTSubmission.countDocuments({ batchId: BATCH_ID });
  const otherSubmissions = await WDTSubmission.countDocuments({ batchId: { $ne: BATCH_ID } });

  console.log(`1. WDT SUBMISSIONS:`);
  console.log(`   - Submissions tagged with batch "${BATCH_ID}": ${matchingSubmissions}`);
  console.log(`   - Unrelated submissions that will be PRESERVED: ${otherSubmissions}`);

  // 2. Identify Taxonomy snapshot
  console.log(`\n2. TAXONOMY RESTORATION:`);
  let snapshotAvailable = false;
  let snapshotData = [];
  if (fs.existsSync(SNAPSHOT_FILE)) {
    try {
      snapshotData = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
      snapshotAvailable = true;
      console.log(`   - Pre-import snapshot file found: ${SNAPSHOT_FILE}`);
      console.log(`   - Snapshot contains ${snapshotData.length} original Taxonomy records.`);
    } catch (err) {
      console.error(`   - Error reading snapshot file: ${err.message}`);
    }
  } else {
    console.log(`   - Snapshot file not found at ${SNAPSHOT_FILE}.`);
    console.log(`   - Fallback: Taxonomy entries created in batch will be identified by lastImportBatch = "${BATCH_ID}".`);
  }

  if (!isConfirmed) {
    console.log('\n================================================================');
    console.log('PREVIEW COMPLETE: No changes were made.');
    console.log('To execute the rollback and restore pre-import state, run:');
    console.log('node server/scripts/rollback_pfa_wdt.js --confirm');
    console.log('================================================================');
    process.exit(0);
  }

  // EXECUTE ROLLBACK
  console.log('\n3. EXECUTING ROLLBACK...');

  // A. Delete matching WDT submissions
  const deleteResult = await WDTSubmission.deleteMany({ batchId: BATCH_ID });
  console.log(`   - Removed ${deleteResult.deletedCount} WDT submissions tagged with ${BATCH_ID}.`);

  // B. Restore Taxonomy
  if (snapshotAvailable && Array.isArray(snapshotData) && snapshotData.length > 0) {
    console.log(`   - Restoring entire Taxonomy collection to exact pre-import snapshot...`);
    await Taxonomy.deleteMany({});
    const sanitized = snapshotData.map(doc => {
      const copy = { ...doc };
      delete copy.__v;
      return copy;
    });
    await Taxonomy.insertMany(sanitized);
    console.log(`   - Restored ${sanitized.length} original Taxonomy entries.`);
  } else {
    // Fallback: Delete taxonomy records created by this batch
    const taxDelResult = await Taxonomy.deleteMany({ lastImportBatch: BATCH_ID });
    console.log(`   - Fallback: Deleted ${taxDelResult.deletedCount} Taxonomy records marked with ${BATCH_ID}.`);
  }

  // Verification after rollback
  const remainingInBatch = await WDTSubmission.countDocuments({ batchId: BATCH_ID });
  const totalRemainingSubmissions = await WDTSubmission.countDocuments();
  const currentTaxCount = await Taxonomy.countDocuments();

  console.log('\n4. POST-ROLLBACK AUDIT:');
  console.log(`   - Remaining Submissions in batch: ${remainingInBatch} (Target: 0)`);
  console.log(`   - Total Submissions in Database:  ${totalRemainingSubmissions} (Original test record preserved)`);
  console.log(`   - Total Taxonomy Records in DB:   ${currentTaxCount}`);

  console.log('\n================================================================');
  console.log('ROLLBACK COMPLETED SUCCESSFULLY');
  console.log('================================================================');
  process.exit(0);
}

rollback().catch(err => {
  console.error('Fatal Error during rollback:', err);
  process.exit(1);
});
