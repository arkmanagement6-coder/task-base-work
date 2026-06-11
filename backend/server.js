require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const reviewRoutes = require('./routes/reviews');
const verifierJob = require('./jobs/verifier'); // boots node-cron scheduler implicitly

const app = express();
const PORT = process.env.PORT || 5000;
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

// Middleware
app.use(cors({ origin: '*' })); // Allow requests from all origins (suitable for browser SPA files)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded screenshots statically
app.use('/' + uploadDir, express.static(path.join(__dirname, uploadDir)));

// Basic Ping route
app.get('/ping', (req, res) => {
  res.json({ status: 'online', time: new Date() });
});

// Mount routes
app.use('/api/reviews', reviewRoutes);

// MongoDB Database Connection
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/krv_portal';
mongoose.connect(mongoUri)
  .then(() => {
    console.log('[MERN] Connected to MongoDB database successfully.');
    // Start Server
    app.listen(PORT, () => {
      console.log(`[MERN] Server running on port ${PORT}`);
      console.log(`[MERN] Upload directory served at: /${uploadDir}`);
    });
  })
  .catch((err) => {
    console.error('[MERN] MongoDB connection failed:', err.message);
  });
