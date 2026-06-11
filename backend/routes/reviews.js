const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ReviewSubmission = require('../models/ReviewSubmission');
const ReviewVerification = require('../models/ReviewVerification');
const ReviewLog = require('../models/ReviewLog');
const { runVerificationEngine } = require('../jobs/verifier');

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

// Ensure uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'screenshot-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPG, PNG, WEBP) are allowed.'));
  }
});

// 1. Submit Candidate Review
router.post('/submit', upload.single('screenshot'), async (req, res) => {
  try {
    const { 
      candidateId, 
      candidateName, 
      taskId, 
      applicationName, 
      playStoreUrl, 
      reviewerName, 
      reviewText, 
      starRating 
    } = req.body;

    if (!candidateId || !candidateName || !taskId || !applicationName || !playStoreUrl || !reviewerName || !reviewText || !starRating) {
      return res.status(400).json({ error: 'All submission fields are required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Screenshot proof file is required.' });
    }

    // Save screenshot path/URL (supporting reverse proxies like Render using x-forwarded-proto)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const screenshotPath = `${protocol}://${req.get('host')}/${uploadDir}/${req.file.filename}`;

    const submissionId = 's' + Date.now();
    const todayDate = new Date().toISOString().split('T')[0];

    const newSubmission = new ReviewSubmission({
      id: submissionId,
      candidateId,
      candidateName,
      taskId,
      applicationName,
      playStoreUrl,
      reviewerName,
      reviewText,
      starRating: parseInt(starRating, 10),
      screenshot: screenshotPath,
      status: 'Pending',
      date: todayDate
    });

    await newSubmission.save();

    // Log the action
    await ReviewLog.create({
      action: 'SUBMISSION_CREATED',
      performedBy: candidateId,
      submissionId: submissionId,
      details: `Candidate "${candidateName}" submitted review for task "${applicationName}"`,
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, submission: newSubmission });
  } catch (err) {
    console.error('Error submitting review:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Fetch submissions for Admin Dashboard
router.get('/submissions', async (req, res) => {
  try {
    const { status, candidateId, date } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (candidateId) filter.candidateId = candidateId;
    if (date) filter.date = date;

    const list = await ReviewSubmission.find(filter).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin Auditing (Approve / Reject review submission manually)
router.post('/audit', async (req, res) => {
  try {
    const { submissionId, status, rejectionReason, adminId } = req.body;

    if (!submissionId || !status || !adminId) {
      return res.status(400).json({ error: 'Submission ID, Status, and Admin ID are required.' });
    }

    if (!['Verified', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid audit status. Must be "Verified" or "Rejected"' });
    }

    const sub = await ReviewSubmission.findOne({ id: submissionId });
    if (!sub) {
      return res.status(404).json({ error: 'Review submission not found.' });
    }

    sub.status = status;
    if (status === 'Rejected') {
      sub.rejectionReason = rejectionReason || 'Rejected by system administrator.';
    } else {
      sub.rejectionReason = undefined;
    }

    await sub.save();

    // Log the audit action
    await ReviewLog.create({
      action: status === 'Verified' ? 'ADMIN_APPROVED' : 'ADMIN_REJECTED',
      performedBy: adminId,
      submissionId: submissionId,
      details: status === 'Verified' 
        ? `Admin approved payout for submission ${submissionId}`
        : `Admin rejected submission ${submissionId}. Reason: "${rejectionReason}"`,
      ipAddress: req.ip
    });

    res.json({ success: true, submission: sub });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Verification Logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await ReviewLog.find().sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Analytics Dashboard Data
router.get('/analytics', async (req, res) => {
  try {
    const allSubs = await ReviewSubmission.find({});

    const totalSubmitted = allSubs.length;
    const verified = allSubs.filter(s => s.status === 'Verified').length;
    const rejected = allSubs.filter(s => s.status === 'Rejected').length;
    const pending = allSubs.filter(s => s.status === 'Pending').length;
    const found = allSubs.filter(s => s.status === 'Review Found').length;

    // Daily submissions distribution
    const dailyMap = {};
    allSubs.forEach(s => {
      dailyMap[s.date] = (dailyMap[s.date] || 0) + 1;
    });

    // Rating distribution
    const ratings = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    allSubs.forEach(s => {
      const rateStr = String(s.starRating);
      if (ratings[rateStr] !== undefined) {
        ratings[rateStr]++;
      }
    });

    res.json({
      summary: {
        totalSubmitted,
        verified,
        rejected,
        pending,
        found
      },
      dailyTrend: dailyMap,
      ratings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Manual Scrape Trigger Endpoint
router.post('/trigger-verify', async (req, res) => {
  try {
    const result = await runVerificationEngine();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Debug Scrape Endpoint
router.get('/debug-scrape', async (req, res) => {
  try {
    const { appId, country, lang } = req.query;
    const gplay = require('google-play-scraper');
    const storeReviews = await gplay.reviews({
      appId: appId || 'com.spinny.android',
      num: 100,
      country: country || 'in',
      lang: lang || 'en'
    });
    const simplified = storeReviews.map(r => ({
      userName: r.userName,
      score: r.score,
      text: r.text,
      date: r.date
    }));
    res.json(simplified);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
