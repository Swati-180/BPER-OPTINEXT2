const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const wdtRoutes = require('./routes/wdt');
const fitmentRoutes = require('./routes/fitment');
const taxonomyRoutes = require('./routes/taxonomy');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/wdt', wdtRoutes);
app.use('/api/fitment', fitmentRoutes);
app.use('/api/taxonomy', taxonomyRoutes);

const { MongoMemoryServer } = require('mongodb-memory-server');
const { seed } = require('./seed_bper');

async function startServer() {
  let mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bper';

  try {
    console.log(`Attempting to connect to MongoDB at: ${mongoUri}`);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.log('Could not connect to provided MongoDB. Falling back to In-Memory MongoDB...');
    const mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri; // Set for seed script
    await mongoose.connect(mongoUri);
    console.log('Connected to In-Memory MongoDB.');
    console.log('Seeding the newly created in-memory database...');
    await seed();
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
