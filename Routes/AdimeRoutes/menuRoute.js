const express = require('express');
const router = express.Router();
const { auth } = require('../../Middelware/auth');
const { saveMonthlyMenu, getActiveMenu } = require('../../Controllers/AdimeControllers/menuController');

// User side requires user authentication token -> GET /api/menu/active
router.get('/menu/active', auth, getActiveMenu);

// Admin side menu upload -> POST /api/admin/menu/upload
router.post('/admin/menu/upload', saveMonthlyMenu);

module.exports = router;