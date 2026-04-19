/**
 * Script to seed mock data into MongoDB
 * Reads JSON files and populates Taxonomy and ProcessAnalysis collections
 * 
 * Usage: node server/scripts/replace_mock_process_data.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const Taxonomy = require('../models/Taxonomy');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const mockProcessData = require('../utils/mockProcessData');

async function seedMockData() {
  try {
    console.log('Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bper';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to preserve)
    // await Taxonomy.deleteMany({});
    // await ProcessAnalysis.deleteMany({});
    // console.log('✓ Cleared existing data');

    // Build and insert taxonomy records
    console.log('\nBuilding Taxonomy records...');
    const taxonomyRecords = [];

    // From 6x6 data
    const sixBySixRecords = mockProcessData.buildTaxonomyFromSixBySix();
    taxonomyRecords.push(...sixBySixRecords);
    console.log(`  - 6x6 data: ${sixBySixRecords.length} records`);

    // From FA activities
    const faRecords = mockProcessData.buildTaxonomyFromFAActivities();
    taxonomyRecords.push(...faRecords);
    console.log(`  - FA activities: ${faRecords.length} records`);

    // From HR activities
    const hrRecords = mockProcessData.buildTaxonomyFromHRActivities();
    taxonomyRecords.push(...hrRecords);
    console.log(`  - HR activities: ${hrRecords.length} records`);

    // Insert taxonomy records with deduplication
    if (taxonomyRecords.length > 0) {
      try {
        // Use insertMany with ordered: false to skip duplicates
        const result = await Taxonomy.insertMany(taxonomyRecords, { ordered: false });
        console.log(`✓ Inserted ${result.length} Taxonomy records`);
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate key error - some records already exist
          console.log(`✓ Inserted Taxonomy records (some duplicates skipped)`);
        } else {
          throw err;
        }
      }
    }

    // Build and insert process analysis records
    console.log('\nBuilding ProcessAnalysis records...');
    const analysisRecords = mockProcessData.buildProcessAnalysisRecords();
    
    if (analysisRecords.length > 0) {
      try {
        const result = await ProcessAnalysis.insertMany(analysisRecords, { ordered: false });
        console.log(`✓ Inserted ${result.length} ProcessAnalysis records`);
      } catch (err) {
        if (err.code === 11000) {
          console.log(`✓ Inserted ProcessAnalysis records (some duplicates skipped)`);
        } else {
          throw err;
        }
      }
    }

    // Print summary statistics
    console.log('\nSummary Statistics:');
    const taxonomyCount = await Taxonomy.countDocuments();
    const analysisCount = await ProcessAnalysis.countDocuments();
    const deptGroups = await Taxonomy.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    console.log(`  - Total Taxonomy records: ${taxonomyCount}`);
    console.log(`  - Total ProcessAnalysis records: ${analysisCount}`);
    console.log('  - Records by Department:');
    deptGroups.forEach(group => {
      console.log(`    • ${group._id || 'N/A'}: ${group.count}`);
    });

    console.log('\n✓ Mock data seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('✗ Error seeding mock data:', err);
    process.exit(1);
  }
}

// Run the seeding function
seedMockData();
