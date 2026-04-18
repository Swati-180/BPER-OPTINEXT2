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
const reportRoutes = require('./routes/reports');
const activitiesRoutes = require('./routes/activities');

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
app.use('/api/reports', reportRoutes);
app.use('/api/activities', activitiesRoutes);

async function startServer() {
  let mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bper';

  try {
    console.log(`Connecting to primary MongoDB...`);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB successfully.');
  } catch (err) {
    console.log('Primary MongoDB connection failed. Attempting In-Memory fallback...');
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      process.env.MONGODB_URI = mongoUri; 
      await mongoose.connect(mongoUri);
      console.log('Connected to In-Memory MongoDB.');
      
      const { seed } = require('./seed_bper');
      console.log('Seeding in-memory database...');
      await seed();
    } catch (fallbackErr) {
      console.error('CRITICAL: Could not connect to primary DB and mongodb-memory-server is not available.');
      console.error('Please check your MONGODB_URI in .env or run "npm install" in the server directory.');
      process.exit(1);
    }
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
