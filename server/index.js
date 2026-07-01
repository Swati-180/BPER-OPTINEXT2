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
const exportRoutes = require('./routes/export');
const inviteRoutes = require('./routes/invite');

const app = express();

const DEFAULT_PORT = Number.parseInt(process.env.PORT || '5000', 10);
const MAX_PORT_RETRIES = 10;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/wdt', wdtRoutes);
app.use('/api/fitment', fitmentRoutes);
app.use('/api/taxonomy', taxonomyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/invite', inviteRoutes);

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
      console.error('Fallback error:');
      console.error(fallbackErr && fallbackErr.stack ? fallbackErr.stack : fallbackErr);
      console.error('Please check your MONGODB_URI in .env or run "npm install" in the server directory.');
      process.exit(1);
    }
  }

  const startListening = (port, retriesLeft) => {
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
        console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
        startListening(port + 1, retriesLeft - 1);
        return;
      }

      console.error(`Failed to start server on port ${port}: ${err.message}`);
      process.exit(1);
    });
  };

  startListening(DEFAULT_PORT, MAX_PORT_RETRIES);
}

startServer();
