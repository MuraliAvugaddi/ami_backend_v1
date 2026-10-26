const express = require('express');
const router = express.Router();
const { auth } = require('../../Middelware/auth'); 
const { submitFeedback, getAllFeedback } = require('../../Controllers/UserControllers/feedbackController');

// Student submission route -> POST /api/feedback
router.post('/feedback', auth, submitFeedback);

// Admin view route -> GET /api/admin/feedback (when mounted under /api/admin in index.js)
router.get('/feedback', getAllFeedback); 

module.exports = router;