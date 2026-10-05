const mongoose = require('mongoose');
const dotenv = require('dotenv');
const exceljs = require('exceljs');
const path = require('path');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const Taxonomy = require('../models/Taxonomy');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  console.log(`Starting Payroll 6x6 Import... Dry Run: ${isDryRun}`);
  const filePath = path.join('C:', 'Users', 'Swati', 'OneDrive', 'Desktop', 'project', 'b2', 'Payroll Listing_01.10.2026.xlsx');
  
  const workbook = new exceljs.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  
  let currentScope = '';
  let currentSubProcess = '';
  
  const rawActivities = [];
  
  // Row 5 is header, Row 6 is data
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < 6) return; // Skip headers and title
    
    // Values based on previous parsing:
    // Col 2: No, Col 3: Process Scope
    // Col 4: Sub Processes
    // Col 5: Activities
    const scopeVal = row.getCell(3).text?.trim();
    const subVal = row.getCell(4).text?.trim();
    const actVal = row.getCell(5).text?.trim();
    
    if (scopeVal) currentScope = scopeVal;
    if (subVal) currentSubProcess = subVal;
    
    if (actVal) {
      rawActivities.push({
        scope: currentScope,
        sub: currentSubProcess,
        activity: actVal,
        rowNum: rowNumber
      });
    }
  });
  
  console.log(`Excel rows found with activities: ${rawActivities.length}`);
  
  const uniqueScopes = [...new Set(rawActivities.map(a => a.scope))];
  const uniqueSubs = [...new Set(rawActivities.map(a => a.sub))];
  
  console.log(`Unique Process Scopes (${uniqueScopes.length}):`, uniqueScopes);
  console.log(`Unique Sub Processes (${uniqueSubs.length}):`, uniqueSubs);
  
  if (rawActivities.length !== 79) {
    console.error(`Expected 79 activities, got ${rawActivities.length}`);
  }
  if (uniqueSubs.length !== 23) {
    console.error(`Expected 23 sub processes, got ${uniqueSubs.length}`);
  }
  
  // Check duplicates in raw activities
  const actNames = rawActivities.map(a => a.activity);
  const rawDuplicates = [...new Set(actNames.filter((item, index) => actNames.indexOf(item) !== index))];
  console.log('Duplicate activity names before mapping:', rawDuplicates);
  
  // Build final mapping
  const taxonomyMap = {};
  const processAnalysisRecords = [];
  
  for (const item of rawActivities) {
    const processName = `${item.sub} - ${item.activity}`;
    
    processAnalysisRecords.push({
      department: 'HR',
      type: 'Core',
      process: processName,
      criteria: ['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
      score: 0,
      consolidated: false,
      _payrollMigration: true // migration marker in code object
    });
    
    const taxProcessName = `Payroll - ${item.sub}`;
    
    if (!taxonomyMap[item.sub]) {
      taxonomyMap[item.sub] = {
        department: 'HR',
        majorProcess: item.scope,
        process: taxProcessName,
        subProcesses: []
      };
    }
    taxonomyMap[item.sub].subProcesses.push(processName);
  }
  
  console.log(`Final mapped ProcessAnalysis names (Sample of 3):`, processAnalysisRecords.slice(0,3).map(r => r.process));
  
  // Check if any process names are duplicated after mapping
  const mappedNames = processAnalysisRecords.map(r => r.process);
  const mappedDuplicates = [...new Set(mappedNames.filter((item, index) => mappedNames.indexOf(item) !== index))];
  if (mappedDuplicates.length > 0) {
    console.error('CRITICAL: Duplicate process names found after mapping!', mappedDuplicates);
    return;
  }
  
  // Connect to DB for validation and upsert
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');
  
  // Before writing counts
  const countFaPa = await ProcessAnalysis.countDocuments({ department: 'Finance & Accounting' });
  const countHrPa = await ProcessAnalysis.countDocuments({ department: 'HR' });
  const countFaTax = await Taxonomy.countDocuments({ department: 'Finance & Accounting' });
  const countHrTax = await Taxonomy.countDocuments({ department: 'HR' });
  
  console.log(`Before Migration Counts:`);
  console.log(`  ProcessAnalysis F&A: ${countFaPa}`);
  console.log(`  ProcessAnalysis HR: ${countHrPa}`);
  console.log(`  Taxonomy F&A: ${countFaTax}`);
  console.log(`  Taxonomy HR: ${countHrTax}`);
  
  // Collision checking
  let collisionError = false;
  
  // 1. Taxonomy collisions
  for (const sub of Object.keys(taxonomyMap)) {
    const taxDoc = taxonomyMap[sub];
    const existing = await Taxonomy.findOne({ department: 'HR', process: taxDoc.process });
    if (existing) {
      if (!existing.subProcesses || existing.subProcesses.length === 0 || !existing.subProcesses.some(sp => sp.includes(sub))) {
         console.warn(`Taxonomy Collision warning: HR -> ${taxDoc.process} exists but might not be our Payroll record. Details:`, existing.majorProcess);
      }
    }
  }
  
  // 2. ProcessAnalysis collisions
  for (const rec of processAnalysisRecords) {
    const existing = await ProcessAnalysis.findOne({ department: 'HR', process: rec.process });
    if (existing) {
      console.warn(`ProcessAnalysis Collision: ${rec.process} already exists in HR! Score: ${existing.score}`);
    }
  }
  
  if (collisionError) {
    console.error('Collisions detected. Stopping.');
    process.exit(1);
  }
  
  if (isDryRun) {
    console.log('Dry run complete. No data was written.');
    process.exit(0);
  }
  
  // Execution
  console.log('Executing UPSERTs...');
  
  let taxUpserts = 0;
  for (const sub of Object.keys(taxonomyMap)) {
    const taxDoc = taxonomyMap[sub];
    await Taxonomy.updateOne(
      { department: 'HR', process: taxDoc.process },
      { $set: taxDoc },
      { upsert: true }
    );
    taxUpserts++;
  }
  console.log(`Upserted ${taxUpserts} Taxonomy records.`);
  
  let paUpserts = 0;
  for (const rec of processAnalysisRecords) {
    // ProcessAnalysis pre-save hooks don't run on updateOne directly unless we configure it or use save.
    // However, we are setting criteria to '-' and score to 0 explicitly.
    // To be perfectly safe with hooks, we can check if it exists, if not, create it.
    const existing = await ProcessAnalysis.findOne({ department: 'HR', process: rec.process });
    if (existing) {
      // Only update if it's safe. For this migration, we are overwriting criteria to '-' if it's part of our migration.
      // But it's safer to only create if it doesn't exist to not destroy any manual scores someone might have entered if we re-run this.
      console.log(`Skipping existing ProcessAnalysis: ${rec.process}`);
    } else {
      await ProcessAnalysis.create(rec);
      paUpserts++;
    }
  }
  console.log(`Created ${paUpserts} ProcessAnalysis records.`);
  
  // After writing counts
  const afterFaPa = await ProcessAnalysis.countDocuments({ department: 'Finance & Accounting' });
  const afterHrPa = await ProcessAnalysis.countDocuments({ department: 'HR' });
  const afterFaTax = await Taxonomy.countDocuments({ department: 'Finance & Accounting' });
  const afterHrTax = await Taxonomy.countDocuments({ department: 'HR' });
  
  console.log(`After Migration Counts:`);
  console.log(`  ProcessAnalysis F&A: ${afterFaPa} (Diff: ${afterFaPa - countFaPa})`);
  console.log(`  ProcessAnalysis HR: ${afterHrPa} (Diff: ${afterHrPa - countHrPa})`);
  console.log(`  Taxonomy F&A: ${afterFaTax} (Diff: ${afterFaTax - countFaTax})`);
  console.log(`  Taxonomy HR: ${afterHrTax} (Diff: ${afterHrTax - countHrTax})`);
  
  console.log('Migration Completed Successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
