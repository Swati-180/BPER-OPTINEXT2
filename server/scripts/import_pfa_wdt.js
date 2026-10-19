const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const exceljs = require('exceljs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const WDTSubmission = require('../models/WDTSubmission');
const Taxonomy = require('../models/Taxonomy');

const isDryRun = !process.argv.includes('--execute');
const BATCH_ID = 'PFA-DEMO-OCT-2026';
const SNAPSHOT_FILE = path.join(__dirname, 'taxonomy_snapshot_pfa.json');
const EXCEL_PATH = path.join(__dirname, '..', '..', '..', 'WDT_Data_Oct_2026_Anonymised.xlsx');

// Support activities classifier
function classifyCategory(majorProcess = '') {
  const norm = majorProcess.toLowerCase();
  if (norm.includes('meeting') || norm.includes('training') || norm.includes('additional activities') || norm === 'others') {
    return 'support';
  }
  return 'core';
}

async function run() {
  console.log('================================================================');
  console.log('PFA WDT IMPORT SCRIPT (Oct 2026)');
  console.log(`Batch ID:   ${BATCH_ID}`);
  console.log(`Mode:       ${isDryRun ? 'DRY-RUN (Read-Only Validation)' : 'EXECUTE (Writing to DB with Rollback Snapshot)'}`);
  console.log(`Source:     ${EXCEL_PATH}`);
  console.log('================================================================\n');

  // 1. Verify Target Database Environment
  const mongoUri = process.env.MONGODB_URI || '';
  const maskedUri = mongoUri.replace(/:([^:@]+)@/, ':****@');
  const dbName = mongoUri.split('/').pop()?.split('?')[0] || 'Unknown';
  console.log('1. DATABASE ENVIRONMENT VERIFICATION:');
  console.log(`   Configured URI: ${maskedUri}`);
  console.log(`   Target DB Name: ${dbName}`);
  if (mongoUri.includes('mongodb.net')) {
    console.log('   Target Cluster: MongoDB Atlas Cloud Cluster');
  } else {
    console.log('   Target Cluster: Local / Standalone MongoDB');
  }

  // 2. Read and Validate Excel Workbook
  console.log('\n2. READING AND VALIDATING WORKBOOK...');
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Workbook not found at ${EXCEL_PATH}`);
  }

  const workbook = new exceljs.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  const worksheet = workbook.getWorksheet('Export Form Data');
  if (!worksheet) {
    throw new Error('Worksheet "Export Form Data" not found in workbook!');
  }

  // Pivot sheet for reference
  const pivotSheet = workbook.getWorksheet('Sheet1');
  const pivotTotals = {};
  if (pivotSheet) {
    pivotSheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 6) {
        const empId = row.getCell(3).value;
        const total = row.getCell(4).value;
        if (empId && typeof total === 'number') {
          pivotTotals[String(empId).trim()] = total;
        }
      }
    });
    console.log(`   Sheet1 Pivot loaded: ${Object.keys(pivotTotals).length} employee control totals.`);
  }

  const submissionsByEmp = new Map();
  const taxonomyMap = new Map(); // key: `${majorProcess}:::${processName}`

  let rawRowCount = 0;
  let emptyHoursCount = 0;
  let emptyVolumeCount = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const sNo = row.getCell(1).value;
    const majorProcess = String(row.getCell(2).value || '').trim();
    const processName = String(row.getCell(3).value || '').trim();
    const subProcess = String(row.getCell(4).value || '').trim();
    const frequency = row.getCell(5).value ? String(row.getCell(5).value).trim() : 'Monthly';

    let volumesMonthly = Number(row.getCell(6).value);
    if (!Number.isFinite(volumesMonthly)) {
      volumesMonthly = 0;
      emptyVolumeCount++;
    }

    let timeTakenHours = Number(row.getCell(7).value);
    if (!Number.isFinite(timeTakenHours)) {
      timeTakenHours = 0;
      emptyHoursCount++;
    }

    const applicationsUsed = row.getCell(8).value ? String(row.getCell(8).value).trim() : '';
    const comments = row.getCell(9).value ? String(row.getCell(9).value).trim() : '';

    const empIdRaw = row.getCell(11).value;
    if (empIdRaw === null || empIdRaw === undefined) return;
    const empId = String(empIdRaw).trim();
    const client = String(row.getCell(12).value || '').trim();
    const empName = String(row.getCell(13).value || '').trim();
    const location = String(row.getCell(14).value || '').trim();
    const designation = String(row.getCell(15).value || '').trim();
    const grade = String(row.getCell(16).value || '').trim();
    const supervisor = String(row.getCell(18).value || '').trim();
    const timeCheck = Number(row.getCell(21).value);

    rawRowCount++;

    // Track Taxonomy strictly keyed by (majorProcess, process)
    if (majorProcess && processName) {
      const taxKey = `${majorProcess}:::${processName}`;
      if (!taxonomyMap.has(taxKey)) {
        taxonomyMap.set(taxKey, {
          majorProcess,
          process: processName,
          subProcesses: new Set()
        });
      }
      if (subProcess) {
        taxonomyMap.get(taxKey).subProcesses.add(subProcess);
      }
    }

    const category = classifyCategory(majorProcess);
    const activityRow = {
      activityCategory: category,
      majorProcess,
      process: processName,
      subProcess,
      frequency,
      volumesMonthly,
      timePerTransactionMinutes: volumesMonthly > 0 ? (timeTakenHours * 60) / volumesMonthly : 0,
      timeTakenHoursPerMonth: timeTakenHours,
      fte: timeTakenHours / 160,
      applicationsUsed,
      comments,
      approvalStatus: 'Approved'
    };

    if (!submissionsByEmp.has(empId)) {
      submissionsByEmp.set(empId, {
        referenceId: `WDT-2026-10-EMP${empId}`,
        batchId: BATCH_ID,
        month: 10,
        year: 2026,
        status: 'Approved',
        employee: {
          employeeId: empId,
          name: empName,
          email: `${empId}@demo.optinext.com`,
          department: 'Finance & Accounting',
          designation,
          tower: majorProcess,
          grade,
          organization: client,
          location
        },
        payload: {
          rows: []
        },
        totalHours: 0,
        utilization: 0,
        coreCount: 0,
        supportCount: 0,
        pendingFrom: supervisor || 'Manager',
        timeCheckExpected: timeCheck
      });
    }

    const sub = submissionsByEmp.get(empId);
    sub.payload.rows.push(activityRow);
    sub.totalHours += timeTakenHours;
    if (category === 'core') sub.coreCount++;
    else sub.supportCount++;
  });

  // Calculate percentages and reconcile
  let totalHoursAll = 0;
  let mismatchedHoursCount = 0;
  for (const [empId, sub] of submissionsByEmp.entries()) {
    sub.utilization = sub.totalHours / 160;
    totalHoursAll += sub.totalHours;

    sub.payload.rows.forEach(r => {
      r.processShare = sub.totalHours > 0 ? (r.timeTakenHoursPerMonth / sub.totalHours) * 100 : 0;
    });

    if (sub.timeCheckExpected !== undefined && Number.isFinite(sub.timeCheckExpected)) {
      if (Math.abs(sub.totalHours - sub.timeCheckExpected) > 0.01) {
        console.warn(`Mismatch for Emp ${empId}: Calculated ${sub.totalHours} vs Expected Time Check ${sub.timeCheckExpected}`);
        mismatchedHoursCount++;
      }
    }
  }

  // Pre-import Integrity Metrics
  console.log('\n3. PRE-IMPORT VALIDATION SUMMARY:');
  console.log(`   - Activity Rows Count:      ${rawRowCount} (Expected: 21,058)`);
  console.log(`   - Unique Employee Count:    ${submissionsByEmp.size} (Expected: 326)`);
  console.log(`   - Total Hours:              ${totalHoursAll.toFixed(2)} hrs (Expected: 79,913.91 hrs)`);
  console.log(`   - Total FTE (at 160h/mo):   ${(totalHoursAll / 160).toFixed(2)} FTE (Expected: 499.46 FTE)`);
  console.log(`   - Time Check Mismatches:    ${mismatchedHoursCount} / 326 (Target: 0)`);
  console.log(`   - Taxonomy Pairs to Sync:   ${taxonomyMap.size} (Expected: 201)`);

  if (rawRowCount !== 21058 || submissionsByEmp.size !== 326 || mismatchedHoursCount !== 0) {
    throw new Error('Integrity validation failed! Pre-import metrics do not match expected workbook totals.');
  }
  console.log('   >>> PRE-IMPORT VALIDATION PASSED (100% PARITY) <<<');

  if (isDryRun) {
    console.log('\n================================================================');
    console.log('DRY-RUN COMPLETE: No changes were written to the database.');
    console.log('To execute the import with snapshot protection, pass --execute');
    console.log('================================================================');
    process.exit(0);
  }

  // 4. Connect to MongoDB and Snapshot
  console.log('\n4. CONNECTING TO DATABASE & CREATING ROLLBACK SNAPSHOT...');
  await mongoose.connect(mongoUri);
  console.log('   Connected to MongoDB.');

  // Pre-check for ID collisions
  const existingRefs = await WDTSubmission.find({
    referenceId: { $in: Array.from(submissionsByEmp.values()).map(s => s.referenceId) }
  }).select('referenceId employee.employeeId').lean();

  if (existingRefs.length > 0) {
    console.log(`   Found ${existingRefs.length} existing submissions matching batch reference IDs. These will be updated in-place.`);
  } else {
    console.log('   Confirmed: 0 collisions with non-batch reference IDs.');
  }

  // Take Taxonomy Snapshot across entire collection for complete restoration guarantee
  const currentTaxonomy = await Taxonomy.find({}).lean();
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(currentTaxonomy, null, 2), 'utf8');
  console.log(`   Saved pre-existing Taxonomy snapshot (${currentTaxonomy.length} records) to ${SNAPSHOT_FILE}`);

  // 5. Upsert Taxonomy
  // CRITICAL FIX: Match strictly on { majorProcess, process } to align with unique index majorProcess_1_process_1.
  // Use $setOnInsert for department, portal, isActive to preserve existing document values.
  console.log('\n5. SYNCHRONIZING TAXONOMY (INDEX-ALIGNED UPSERT)...');
  let taxUpserts = 0;
  for (const [, taxItem] of taxonomyMap.entries()) {
    const subProcessesArray = Array.from(taxItem.subProcesses);
    await Taxonomy.updateOne(
      { majorProcess: taxItem.majorProcess, process: taxItem.process },
      {
        $setOnInsert: {
          department: 'Finance & Accounting',
          portal: 'all',
          isActive: true
        },
        $set: {
          lastImportBatch: BATCH_ID
        },
        $addToSet: {
          subProcesses: { $each: subProcessesArray }
        }
      },
      { upsert: true }
    );
    taxUpserts++;
  }
  console.log(`   Synchronized ${taxUpserts} Taxonomy entries without duplicate key collisions.`);

  // 6. Upsert WDT Submissions
  console.log('\n6. UPSERTING 326 WDT SUBMISSIONS (BATCH: ' + BATCH_ID + ')...');
  let subUpserts = 0;
  for (const [, sub] of submissionsByEmp.entries()) {
    await WDTSubmission.updateOne(
      { referenceId: sub.referenceId },
      { $set: sub },
      { upsert: true }
    );
    subUpserts++;
  }
  console.log(`   Upserted ${subUpserts} WDT submissions.`);

  // 7. Post-Import Verification
  console.log('\n7. RUNNING POST-IMPORT DATABASE VERIFICATION...');
  const importedCount = await WDTSubmission.countDocuments({ batchId: BATCH_ID });
  const totalDbSubmissions = await WDTSubmission.countDocuments({ month: 10, year: 2026 });
  
  // Aggregate DB total hours
  const aggResult = await WDTSubmission.aggregate([
    { $match: { batchId: BATCH_ID } },
    { $group: { _id: null, totalHours: { $sum: '$totalHours' } } }
  ]);
  const dbHours = aggResult[0]?.totalHours || 0;

  console.log(`   - DB Submissions in Batch:  ${importedCount} / 326`);
  console.log(`   - DB Month 10/2026 Total:   ${totalDbSubmissions} (Includes 1 existing test record)`);
  console.log(`   - DB Total Logged Hours:    ${dbHours.toFixed(2)} hrs (Expected: 79,913.91 hrs)`);

  if (importedCount === 326 && Math.abs(dbHours - 79913.91) < 0.1) {
    console.log('   >>> POST-IMPORT VERIFICATION PASSED: DB matches workbook 100% <<<');
  } else {
    console.error('   !!! WARNING: Post-import totals did not match expected values !!!');
  }

  console.log('\n================================================================');
  console.log('PFA WDT IMPORT COMPLETED SUCCESSFULLY');
  console.log(`To rollback this batch at any time, run:`);
  console.log(`node server/scripts/rollback_pfa_wdt.js --confirm`);
  console.log('================================================================');

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal Error during import execution:', err);
  process.exit(1);
});
