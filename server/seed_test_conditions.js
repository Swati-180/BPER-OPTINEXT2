const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ProcessAnalysis = require('./models/ProcessAnalysis');

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/6x6-db';

const TEST_DEPARTMENT = 'Testing Department';

// Map criteria indices
// 0-5: Performance
// 6: Sensitivity, 7: Effort, 8: Controls, 9: Proximity, 10: Regulatory, 11: Skill
const testCases = [
  {
    process: 'TC1: Prox H + Sens H',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','H', 'H','L','M','H','M','M'] // Score 7, Excep 1
  },
  {
    process: 'TC2: Prox H + Cont H',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','H', 'M','L','H','H','M','M'] // Score 7, Excep 2
  },
  {
    process: 'TC3: Prox H + Reg H',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','H', 'M','L','M','H','H','M'] // Score 7, Excep 3
  },
  {
    process: 'TC4: Prox H + Skill H',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','H', 'M','L','M','H','M','H'] // Score 7, Excep 4
  },
  {
    process: 'TC5: Normal Pass',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','H', 'M','L','M','M','M','M'] // Score 7, Pass
  },
  {
    process: 'TC6: Normal Fail',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','M', 'M','L','M','M','M','M'] // Score 6, Fail
  },
  {
    process: 'TC7: N/A Case',
    department: TEST_DEPARTMENT,
    type: 'core',
    criteria: ['H','H','H','H','H','M', 'M','L','M','M','M','M'], // Score 6
    consolidated: null // Should be preserved as null
  }
];

async function seedTestConditions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    console.log(`Removing old test cases from ${TEST_DEPARTMENT}...`);
    await ProcessAnalysis.deleteMany({ department: TEST_DEPARTMENT });

    console.log('Inserting test cases...');
    
    // We cannot use insertMany if we want the pre-save hooks to trigger nicely,
    // though the model has an insertMany hook too. Let's use individual saves just to be sure.
    for (const tc of testCases) {
      const doc = new ProcessAnalysis(tc);
      await doc.save();
      console.log(`Inserted ${tc.process}: Score=${doc.score}, Consolidated=${doc.consolidated}`);
    }

    console.log('Test conditions seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding test conditions:', err);
    process.exit(1);
  }
}

seedTestConditions();
