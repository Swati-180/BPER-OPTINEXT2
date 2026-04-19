const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Taxonomy = require('../models/Taxonomy');
const ProcessAnalysis = require('../models/ProcessAnalysis');
const {
  getMockTaxonomyRecords,
  getMockProcessAnalysisRecords,
} = require('../utils/mockProcessData');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function seedMockProcessData({ connect = true } = {}) {
  const mongoUri = process.env.MONGODB_URI;
  let connectedHere = false;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (connect && mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
    connectedHere = true;
  }

  try {
    await Promise.all([
      Taxonomy.deleteMany({}),
      ProcessAnalysis.deleteMany({}),
    ]);

    await Taxonomy.insertMany(getMockTaxonomyRecords());
    await ProcessAnalysis.insertMany(getMockProcessAnalysisRecords());

    const taxonomyCount = await Taxonomy.countDocuments();
    const processAnalysisCount = await ProcessAnalysis.countDocuments();

    console.log('Replaced process management and 6x6 data.');
    console.log(`Taxonomy records: ${taxonomyCount}`);
    console.log(`Process analysis records: ${processAnalysisCount}`);
  } finally {
    if (connectedHere) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  seedMockProcessData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = seedMockProcessData;