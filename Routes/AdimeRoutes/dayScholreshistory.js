const express = require('express');
const router = express.Router();
const payementHistoryController = require('../../Controllers/AdimeControllers/DayscholoerhistoryController');

// GET request to fetch day scholar orders for admin
router.get('/dayscholar-orders', payementHistoryController.getAdminDayScholarOrders);

module.exports = router;