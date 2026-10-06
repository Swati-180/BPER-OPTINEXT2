const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });
const Taxonomy = require('../models/Taxonomy');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const mockProcessData = require('../utils/mockProcessData');

async function replaceFAData() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bper';
    await mongoose.connect(mongoUri);
    console.log('Connected to DB.');

    const oldTaxonomyCount = await Taxonomy.countDocuments({ department: 'Finance & Accounting' });
    const oldAnalysisCount = await ProcessAnalysis.countDocuments({ department: 'Finance & Accounting' });
    console.log(`Old FA Taxonomy count: ${oldTaxonomyCount}`);
    console.log(`Old FA ProcessAnalysis count: ${oldAnalysisCount}`);

    // Delete old FA data
    await Taxonomy.deleteMany({ department: 'Finance & Accounting' });
    await ProcessAnalysis.deleteMany({ department: 'Finance & Accounting' });
    console.log('Deleted old FA records.');

    // Insert new FA taxonomy
    const faRecords = mockProcessData.buildTaxonomyFromFAActivities();
    if (faRecords.length > 0) {
      await Taxonomy.insertMany(faRecords, { ordered: false }).catch(e => {
        if(e.code !== 11000) throw e;
      });
      console.log(`Inserted new FA Taxonomy records.`);
    }

    // Insert new FA process analysis
    const allAnalysis = mockProcessData.buildProcessAnalysisRecords();
    const faAnalysis = allAnalysis.filter(r => r.department === 'Finance & Accounting');
    if (faAnalysis.length > 0) {
      await ProcessAnalysis.insertMany(faAnalysis, { ordered: false }).catch(e => {
        if(e.code !== 11000) throw e;
      });
      console.log(`Inserted new FA ProcessAnalysis records.`);
    }

    const newTaxonomyCount = await Taxonomy.countDocuments({ department: 'Finance & Accounting' });
    const newAnalysisCount = await ProcessAnalysis.countDocuments({ department: 'Finance & Accounting' });

    // Let's count unique Major Processes and Processes
    const majorProcesses = await Taxonomy.distinct('majorProcess', { department: 'Finance & Accounting' });
    const processes = await Taxonomy.distinct('process', { department: 'Finance & Accounting' });

    console.log('\n--- REPORT ---');
    console.log(`Number of Major Processes loaded: ${majorProcesses.length}`);
    console.log(`Number of Processes loaded: ${processes.length}`);
    console.log(`Number of Subprocesses (ProcessAnalysis/Taxonomy items) loaded: ${newAnalysisCount}`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

replaceFAData();
