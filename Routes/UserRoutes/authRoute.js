const express = require('express'); 
const router = express.Router();

const { auth } = require("../../Middelware/auth");
const authcontroller = require('../../Controllers/UserControllers/authControllers');

// Step 1: Validates email availability & Sends OTP code
router.post("/signup/1", authcontroller.siginuppage1);

// New Endpoint: Verify OTP match
router.post("/signup/verify-otp", authcontroller.verifyOTP);

// Step 2: Receive all user detail objects and create account
router.post("/signup/2", authcontroller.siginuppage2); 

// Standard Signin
router.post("/signin", authcontroller.signinUser);

// Payment History & Verification Routes
router.get("/payment-history", auth, authcontroller.getPaymentHistory);
router.post("/payment-success", auth, authcontroller.handleOnlinePaymentSuccess);

// ✅ Cashfree Payment Gateway Routes
router.post("/create-cashfree-order", auth, authcontroller.createCashfreeOrder);
router.post("/verify-cashfree-payment", auth, authcontroller.verifyCashfreePayment);

// ✅ Cashfree Webhook Route (Public server-to-server listener)
router.post("/webhook/cashfree", authcontroller.cashfreeWebhook);

// Forgot and Reset Password routes
router.post("/forgot-password", authcontroller.forgotPassword);
router.post("/reset-password", authcontroller.resetPassword);

module.exports = router;