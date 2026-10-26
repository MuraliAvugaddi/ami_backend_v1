const express = require('express');
const router = express.Router();
const adminController = require('../../Controllers/AdimeControllers/adimeController.js');

// 1. Fetch Users
router.get('/users', adminController.getAllUsers);

// ✅ FIX: must be ABOVE '/users/:userId' — otherwise Express treats
// "deactivate-all" as a student id and the Reset Month button fails.
router.patch('/users/deactivate-all', adminController.deactivateAllUsers);
router.post('/users/deactivate-all', adminController.deactivateAllUsers);

// 2. Status Updates
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/:userId', adminController.updateUserStatus);
router.put('/users/:userId', adminController.updateUserStatus);

// 3. Delete Student (Admin Panel)
router.delete('/users/:userId', adminController.deleteUser); // <-- Delete student route


// 5. Payments & Reports
router.get('/all-payments', adminController.getAllPayments);
router.get('/skip-report', adminController.getAdminSkipReport);

// 6. Manual Offline Payment, Deletion & Excel Export
router.post('/payments/manual', adminController.recordManualPayment);
router.put('/payments/manual', adminController.recordManualPayment);
router.delete('/payments/month', adminController.deleteMonthPayment);
router.get('/reports/export-excel', adminController.exportStudentReportExcel);

module.exports = router;