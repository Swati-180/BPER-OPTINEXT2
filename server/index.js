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

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
