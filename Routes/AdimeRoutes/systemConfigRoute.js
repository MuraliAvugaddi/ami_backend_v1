// Routes/AdimeRoutes/systemConfigRoute.js
const express = require('express');
const router = express.Router();
const {
  getSystemStatus,
  updateSystemStatus,
} = require('../../Controllers/AdimeControllers/systemConfigController.js');

router.get('/status', getSystemStatus);
router.put('/status', updateSystemStatus);

module.exports = router;