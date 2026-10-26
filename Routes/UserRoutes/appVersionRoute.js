const express = require('express');
const router = express.Router();

// GET /api/app-version — the student app compares this with its own build number.
// Change these on Render → Environment whenever you publish a new APK.
router.get('/app-version', (req, res) => {
    res.status(200).json({
        latestVersion: process.env.APP_LATEST_VERSION || '1.0.0',
        latestBuildNumber: parseInt(process.env.APP_LATEST_BUILD || '1', 10),
        forceUpdate: process.env.APP_FORCE_UPDATE === 'true',
        downloadUrl: process.env.APP_DOWNLOAD_URL || '',
        releaseNotes: process.env.APP_RELEASE_NOTES || 'A new version of the app is available with improvements and bug fixes.',
    });
});

module.exports = router;
