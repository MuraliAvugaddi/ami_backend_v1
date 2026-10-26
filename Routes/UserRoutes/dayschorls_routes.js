const express = require('express');
const router = express.Router();
const { auth } = require("../../Middelware/auth");
const dayScholarController = require('../../Controllers/UserControllers/dayScholarController');

router.post("/create-dayscholar-order", auth, dayScholarController.createDayScholarOrder);
router.post("/verify-dayscholar-payment", auth, dayScholarController.verifyDayScholarPayment);

module.exports = router;