const express = require('express');
const router = express.Router();

const { auth } = require("../../Middelware/auth");
const complaintController = require('../../Controllers/UserControllers/complaintController');
const sosController = require('../../Controllers/UserControllers/sosController');
const notificationController = require('../../Controllers/UserControllers/hostelNotificationController');
const visitorController = require('../../Controllers/UserControllers/visitorPublicController');

// ============================================================
// STUDENT — hostel (mounted at /api)
// ============================================================

// Room complaints
router.post('/complaints', auth, complaintController.raiseComplaint);
router.get('/complaints/mine', auth, complaintController.getMyComplaints);
router.get('/complaints/:id', auth, complaintController.getMyComplaintById);
router.post('/complaints/:id/confirm', auth, complaintController.confirmComplaint);

// SOS
router.post('/sos', auth, sosController.sendSos);
router.get('/sos/mine', auth, sosController.getMySos);

// Bell notifications
router.get('/hostel-notifications', auth, notificationController.getMyNotifications);
router.post('/hostel-notifications/read-all', auth, notificationController.markAllRead);

// PUBLIC — visitor gate form (no login)
router.post('/visitors/public', visitorController.createVisitorEntry);

module.exports = router;
