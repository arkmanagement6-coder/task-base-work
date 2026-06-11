const gplay = require('google-play-scraper');
const cron = require('node-cron');
const stringSimilarity = require('string-similarity');
const ReviewSubmission = require('../models/ReviewSubmission');
const ReviewVerification = require('../models/ReviewVerification');
const ReviewLog = require('../models/ReviewLog');

// Helper function to extract Google Play Package ID (app ID) from playStoreUrl
function getAppId(urlStr) {
  try {
    let cleanUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const myUrl = new URL(cleanUrl);
    return myUrl.searchParams.get('id');
  } catch (e) {
    console.error('Error parsing Play Store URL:', urlStr, e.message);
    return null;
  }
}

// Main verification run function
async function runVerificationEngine() {
  console.log('[Verifier] Starting automated review verification engine run...');
  const logs = [];

  try {
    // 1. Fetch all submissions with 'Pending' status
    const pendingSubmissions = await ReviewSubmission.find({ status: 'Pending' });
    if (pendingSubmissions.length === 0) {
      console.log('[Verifier] No pending submissions found to verify.');
      return { success: true, processedCount: 0 };
    }

    console.log(`[Verifier] Found ${pendingSubmissions.length} pending submissions to process.`);

    // Group submissions by appId to optimize scraping requests
    const appIdMap = {};
    for (const sub of pendingSubmissions) {
      const appId = getAppId(sub.playStoreUrl);
      if (!appId) {
        // Mark as Rejected if URL is invalid
        sub.status = 'Rejected';
        sub.rejectionReason = 'Invalid Google Play Store URL format.';
        await sub.save();

        await ReviewLog.create({
          action: 'VERIFICATION_FAILED',
          performedBy: 'SYSTEM_CRON',
          submissionId: sub.id,
          details: 'Failed: Play Store URL does not contain a valid package ID.'
        });
        continue;
      }
      if (!appIdMap[appId]) {
        appIdMap[appId] = [];
      }
      appIdMap[appId].push(sub);
    }

    const autoApproveThreshold = parseInt(process.env.AUTO_APPROVE_THRESHOLD || '90', 10);

    // 2. Process each App ID group
    for (const [appId, submissions] of Object.entries(appIdMap)) {
      console.log(`[Verifier] Scraping reviews for App ID: ${appId} (Submissions: ${submissions.length})`);
      
      let storeReviews = [];
      try {
        storeReviews = await gplay.reviews({
          appId: appId,
          num: 120,
          country: 'in',
          lang: 'en'
        });
      } catch (scrapeErr) {
        console.error(`[Verifier] Failed to scrape reviews for App ID ${appId}:`, scrapeErr.message);
        // Skip this app group for this run (will retry next run)
        continue;
      }

      console.log(`[Verifier] Successfully scraped ${storeReviews.length} reviews from Google Play Store.`);

      for (const sub of submissions) {
        let bestMatch = null;
        let highestScore = 0;

        // Compare with scraped store reviews
        for (const rev of storeReviews) {
          // Check Rating Match (Must match exactly or close)
          if (parseInt(rev.score, 10) !== parseInt(sub.starRating, 10)) {
            continue;
          }

          // Check Reviewer Name Match (Case-insensitive check or similarity)
          const nameSim = stringSimilarity.compareTwoStrings(
            sub.reviewerName.toLowerCase().trim(),
            rev.userName.toLowerCase().trim()
          );

          // Check Text Match
          const textSim = stringSimilarity.compareTwoStrings(
            sub.reviewText.toLowerCase().trim(),
            rev.text.toLowerCase().trim()
          );

          // Combined score (weighted: 70% text, 30% name)
          const totalSim = (textSim * 0.70) + (nameSim * 0.30);
          const scorePercent = Math.round(totalSim * 100);

          if (scorePercent > highestScore) {
            highestScore = scorePercent;
            bestMatch = {
              scrapedReviewText: rev.text,
              scrapedReviewerName: rev.userName,
              scrapedRating: rev.score,
              scrapedDate: new Date(rev.date),
              matchScore: scorePercent
            };
          }
        }

        // Apply matching thresholds
        if (highestScore >= 80 && bestMatch) {
          // We found a matching review!
          console.log(`[Verifier] Match found for Submission ${sub.id}! Score: ${highestScore}%`);

          sub.matchScore = highestScore;
          sub.matchedReviewText = bestMatch.scrapedReviewText;
          sub.matchedReviewerName = bestMatch.scrapedReviewerName;
          sub.matchedRating = bestMatch.scrapedRating;
          sub.matchedDate = bestMatch.scrapedDate;

          // Determine status: Auto-Approve if above threshold, else Review Found
          if (highestScore >= autoApproveThreshold) {
            sub.status = 'Verified';
            console.log(`[Verifier] Auto-approving submission ${sub.id} (Score ${highestScore}% >= Threshold ${autoApproveThreshold}%)`);
            
            await ReviewLog.create({
              action: 'SCRAPER_MATCHED',
              performedBy: 'SYSTEM_CRON',
              submissionId: sub.id,
              details: `Auto-verified review matching display name "${bestMatch.scrapedReviewerName}" with score ${highestScore}%`
            });
          } else {
            sub.status = 'Review Found';
            console.log(`[Verifier] Match flagged for manual verification: submission ${sub.id} (Score: ${highestScore}%)`);

            await ReviewLog.create({
              action: 'SCRAPER_MATCHED',
              performedBy: 'SYSTEM_CRON',
              submissionId: sub.id,
              details: `Flagged match: Display name "${bestMatch.scrapedReviewerName}" with score ${highestScore}%`
            });
          }

          await sub.save();

          // Create verification detail entry
          await ReviewVerification.create({
            submissionId: sub.id,
            scrapedReviewText: bestMatch.scrapedReviewText,
            scrapedReviewerName: bestMatch.scrapedReviewerName,
            scrapedRating: bestMatch.scrapedRating,
            scrapedDate: bestMatch.scrapedDate,
            matchScore: highestScore
          });

        } else {
          console.log(`[Verifier] No matching review found for submission ${sub.id}. Highest score: ${highestScore}%`);
          // Leave as Pending for next run/manual check
        }
      }
    }

    console.log('[Verifier] Automated verification run complete.');
    return { success: true, processedCount: pendingSubmissions.length };
  } catch (error) {
    console.error('[Verifier] Error running automated verification engine:', error);
    return { success: false, error: error.message };
  }
}

// Schedule cron job to run every 30 minutes
cron.schedule('*/30 * * * *', () => {
  runVerificationEngine();
});

module.exports = {
  runVerificationEngine
};
