const express = require('express');
const router = express.Router();
const { getSystemNotice } = require('../../Controllers/AdimeControllers/systemNoticeController');

// GET /api/system/notice
router.get('/system/notice', getSystemNotice);

module.exports = router;