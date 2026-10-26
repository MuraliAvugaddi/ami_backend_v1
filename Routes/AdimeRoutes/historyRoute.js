const express = require('express');
const router = express.Router();
const tokenHistoryController = require('../../Controllers/AdimeControllers/tokenHistoryController');

// --- NEW ROUTE ---
// GET request to fetch paginated token history
// This will be mounted at /api/admin/history
router.get('/history', tokenHistoryController.getTokenHistory);

module.exports = router;