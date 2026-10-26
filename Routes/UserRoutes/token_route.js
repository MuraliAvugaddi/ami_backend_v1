const express = require('express');
const router = express.Router();
const tokenController = require('../../Controllers/UserControllers/token_controller');
const mealController = require('../../Controllers/UserControllers/mealController');

// ✅ Import all three functions from middleware
const { auth, checkAccess, checkMealSkipped } = require('../../Middelware/auth');

// ✅ ADDED checkMealSkipped HERE 👇
router.post('/generate', auth, checkAccess, checkMealSkipped, tokenController.generateToken);

router.get('/stats', tokenController.getStatsByDate);
router.get('/my-history', auth, tokenController.getUserTokenHistory);
router.post('/skip', auth, mealController.skipMeal);
router.get('/my-skips', auth, mealController.getMySkipHistory);

module.exports = router;