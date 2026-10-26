const express = require('express');
const router = express.Router();
const {
    listSubmissions,
    getSubmissionCounts,
    approveSubmission,
    rejectSubmission,
    getStudentReceipts,
    getAdminPaymentSettings,
} = require('../../Controllers/AdimeControllers/paymentReviewController');
const {
    uploadBankStatement,
    getBankStatements,
    approveAllVerified,
    getUnclaimedCredits,
} = require('../../Controllers/AdimeControllers/bankStatementController');
const {
    getStudentFeeStatus,
    recordCashPayment,
} = require('../../Controllers/AdimeControllers/cashPaymentController');

// Mounted at /api/admin
router.get('/payment-submissions/counts', getSubmissionCounts);                // must be before /:id routes
router.post('/payment-submissions/approve-verified', approveAllVerified);      // must be before /:id routes
router.get('/payment-submissions', listSubmissions);
router.post('/payment-submissions/:id/approve', approveSubmission);
router.post('/payment-submissions/:id/reject', rejectSubmission);
router.get('/students/:userId/receipts', getStudentReceipts);
router.get('/payment-settings', getAdminPaymentSettings);

// ✅ Bank statement check (stops edited / fake screenshots)
router.post('/bank-statements', uploadBankStatement);
router.get('/bank-statements', getBankStatements);
router.get('/bank-transactions/unclaimed', getUnclaimedCredits);

// ✅ Cash payments (Student Finance → Cash)
router.get('/students/:userId/fee-status', getStudentFeeStatus);
router.post('/students/:userId/cash-payment', recordCashPayment);

module.exports = router;
