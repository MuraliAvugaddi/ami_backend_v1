const express = require('express');
const router = express.Router();

const { staffAuth, allowRoles } = require("../../Middelware/staffAuth");
const staffController = require('../../Controllers/StaffControllers/staffAuthController');
const complaintController = require('../../Controllers/StaffControllers/complaintStaffController');
const sosController = require('../../Controllers/StaffControllers/sosStaffController');
const visitorController = require('../../Controllers/StaffControllers/visitorStaffController');
const notificationController = require('../../Controllers/UserControllers/hostelNotificationController');

// ============================================================
// STAFF — admin app (mounted at /api/staff)
// ============================================================

const HOSTEL_HEADS = ['director', 'warden', 'attender'];
const ALL_HOSTEL_STAFF = ['director', 'warden', 'attender', 'worker'];

// Login
router.post('/login', staffController.staffLogin);
router.get('/me', staffAuth, staffController.getMe);

// Bell notifications
router.get('/notifications', staffAuth, notificationController.getMyNotifications);
router.post('/notifications/read-all', staffAuth, notificationController.markAllRead);

// Team + students
router.get('/team', staffAuth, allowRoles(...HOSTEL_HEADS), staffController.listStaff);
router.post('/team', staffAuth, allowRoles('director'), staffController.createStaff);
router.patch('/team/:id', staffAuth, allowRoles('director'), staffController.updateStaff);
router.get('/students', staffAuth, allowRoles(...HOSTEL_HEADS), staffController.searchStudents);

// Complaints
router.get('/complaints-summary', staffAuth, allowRoles(...HOSTEL_HEADS), complaintController.complaintSummary);
router.get('/complaints', staffAuth, allowRoles(...ALL_HOSTEL_STAFF), complaintController.listComplaints);
router.get('/complaints/:id', staffAuth, allowRoles(...ALL_HOSTEL_STAFF), complaintController.getComplaint);
router.post('/complaints/:id/accept', staffAuth, allowRoles('worker'), complaintController.acceptComplaint);
router.post('/complaints/:id/assign', staffAuth, allowRoles(...HOSTEL_HEADS), complaintController.assignComplaint);
router.post('/complaints/:id/repaired', staffAuth, allowRoles(...ALL_HOSTEL_STAFF), complaintController.markRepaired);
router.post('/complaints/:id/note', staffAuth, allowRoles(...ALL_HOSTEL_STAFF), complaintController.addNote);
router.post('/complaints/:id/warden-report', staffAuth, allowRoles('warden'), complaintController.wardenReport);
router.post('/complaints/:id/director-close', staffAuth, allowRoles('director'), complaintController.directorClose);

// SOS
router.get('/sos', staffAuth, allowRoles(...HOSTEL_HEADS), sosController.listSos);
router.get('/sos/:id', staffAuth, allowRoles(...HOSTEL_HEADS), sosController.getSos);
router.post('/sos/:id/going', staffAuth, allowRoles(...HOSTEL_HEADS), sosController.goingToSos);
router.post('/sos/:id/handled', staffAuth, allowRoles(...HOSTEL_HEADS), sosController.handleSos);

// Visitors
router.get('/visitors', staffAuth, allowRoles(...HOSTEL_HEADS), visitorController.listVisitors);
router.post('/visitors/:id/checkout', staffAuth, allowRoles(...HOSTEL_HEADS), visitorController.checkoutVisitor);
router.post('/visitors/:id/flag', staffAuth, allowRoles(...HOSTEL_HEADS), visitorController.flagVisitor);

module.exports = router;
