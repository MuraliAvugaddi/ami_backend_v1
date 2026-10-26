const express = require('express');
const router = express.Router();
const { auth } = require('../../Middelware/auth');
const {
    getPaymentScreenData,
    submitPaymentScreenshot,
    getMySubmissions,
    getMyReceipts,
    getMyFeeStatus,
    getMyReceiptList,
} = require('../../Controllers/UserControllers/paymentSubmissionController');

// Mounted at /api/payments
router.get('/config', auth, getPaymentScreenData);
router.post('/submit', auth, submitPaymentScreenshot);
router.get('/my-submissions', auth, getMySubmissions);
router.get('/my-receipts', auth, getMyReceipts);
router.get('/status', auth, getMyFeeStatus);          // ✅ fee status + fine (reminders)
router.get('/receipts', auth, getMyReceiptList);      // ✅ receipts with PAID stamp

module.exports = router;
