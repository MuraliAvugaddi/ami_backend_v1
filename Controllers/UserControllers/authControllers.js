require('dotenv').config();
const User = require("../../Models/users");
const OTP = require("../../Models/otpModel"); 
const Payment = require("../../Models/paymentModel"); 
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ✅ BREVO TRANSACTIONAL EMAIL HELPER (Uses native fetch)
const sendBrevoEmail = async (recipientEmail, subject, htmlContent, textContent) => {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { 
                name: "Ami Hostlers Jaipur", 
                email: process.env.BREVO_SENDER_EMAIL || "venkatavugaddi@gmail.com" 
            },
            to: [{ email: recipientEmail }],
            subject: subject,
            htmlContent: htmlContent,
            textContent: textContent
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to send email via Brevo');
    }
    return await response.json();
};

// ✅ SCALABLE PRODUCTION EMAIL LOGIC (Uses Brevo)
const sendOtpEmail = async (email, otp) => {
    try {
        const subject = `${otp} is your verification code for Ami Hostlers app`;
        const text = `Hello! Thank you for starting your registration for Ami Hostlers Jaipur. Your 6-digit verification OTP is: ${otp}. This code is valid for 10 minutes. Please do not share this code with anyone.`;
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #FFC800; text-align: center;">Ami Hostlers Jaipur</h2>
                <p>Thank you for registering with Ami Hostlers. Please use the one-time verification code below to complete registration Step 1:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background: #FFF9E6; padding: 10px 20px; border: 1px solid #FFE480; border-radius: 5px;">
                        ${otp}
                    </span>
                </div>
                <p style="color: #777; font-size: 12px; text-align: center;">This code is valid for 10 minutes. If you didn't request this code, you can safely ignore this email.</p>
            </div>
        `;

        await sendBrevoEmail(email, subject, html, text);
        console.log(`✨ Registration OTP email successfully dispatched to ${email} via Brevo`);
    } catch (error) {
        console.error("❌ Brevo mailer failed:", error);
        throw new Error("Failed to deliver verification code.");
    }
};

// 1. SIGNUP STEP 1
const siginuppage1 = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required." });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "An account with this email already exists." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.deleteMany({ email });
        await OTP.create({ email, otp });

        await sendOtpEmail(email, otp);
        res.status(200).json({ message: "OTP sent successfully to your email." });
    } catch (error) {
        console.error("Signup Step 1 error:", error);
        res.status(500).json({ message: "Server error during email validation or OTP delivery" });
    }
};

// VERIFY THE CODE ENTERED BY USER
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });

        const otpRecord = await OTP.findOne({ email });
        if (!otpRecord) return res.status(400).json({ message: "OTP expired or was never requested." });
        if (otpRecord.otp !== otp) return res.status(400).json({ message: "Incorrect verification code." });

        await OTP.deleteOne({ email });
        res.status(200).json({ message: "Email verification successful." });
    } catch (error) {
        res.status(500).json({ message: "Server error during validation." });
    }
};

// 2. SIGNUP STEP 2
const siginuppage2 = async (req, res) => {
    try {
        const { name, email, password, enrollmentNo, course, year, phonenumber, hostelblock, room, gender } = req.body;
        
        if (!name || !email || !password || !enrollmentNo || !course || !year || !phonenumber || !hostelblock || !room || !gender) {
            return res.status(400).json({ message: "All text fields and gender selection are required." });
        }

        if (enrollmentNo.trim().length < 7) {
            return res.status(400).json({ message: "Enrollment number must be at least 7 characters long." });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { enrollmentNo }] });
        if (existingUser) return res.status(400).json({ message: "Email or Enrollment number already registered." });

        const newUser = new User({ name, email, password, enrollmentNo, course, year, phonenumber, hostelblock, room, gender });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "365d" });
        res.status(201).json({ message: "Registration successful!", token, user: newUser });
    } catch (error) {
        console.error("Signup Step 2 error:", error);
        res.status(500).json({ message: "Server error while creating account." });
    }
};

// 3. SIGNIN
const signinUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExsisting = await User.findOne({ email });
        if (!userExsisting) return res.status(400).json({ message: "User with this email does not exist!" });

        const isMatch = await bcrypt.compare(password, userExsisting.password);
        if (!isMatch) return res.status(400).json({ message: "Incorrect password" });
        
        const token = jwt.sign({ id: userExsisting._id }, process.env.JWT_SECRET, { expiresIn: '365d' });
        res.status(200).json({ token, user: userExsisting.toObject() });
    } catch (e) {
        res.status(500).json({ message: "Server error" });
    }
};

// 4. FORGOT PASSWORD
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required." });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "No account found with this email." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.deleteMany({ email });
        await OTP.create({ email, otp });

        const subject = `${otp} is your password reset code`;
        const text = `Use the confirmation code to reset your password: ${otp}`;
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #FFC800; text-align: center;">Password Reset Request</h2>
                <p>Use the confirmation code below to reset your password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background: #FFF9E6; padding: 10px 20px; border: 1px solid #FFE480; border-radius: 5px;">
                        ${otp}
                    </span>
                </div>
            </div>
        `;

        await sendBrevoEmail(email, subject, html, text);
        res.status(200).json({ message: "Password reset OTP sent to your email." });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Server error while processing request." });
    }
};

// 5. RESET PASSWORD
const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "All fields are required." });
        }

        const otpRecord = await OTP.findOne({ email });
        if (!otpRecord || otpRecord.otp !== otp) return res.status(400).json({ message: "Invalid or expired reset code." });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found." });

        user.password = newPassword;
        await user.save();
        await OTP.deleteOne({ email });

        res.status(200).json({ message: "Password updated successfully!" });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Server error during password update." });
    }
};

const getPaymentHistory = async (req, res) => {
    try {
        const userId = req.user.id; 
        const payments = await Payment.find({ userId }).sort({ paidAt: -1 });
        res.status(200).json({ success: true, history: payments });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 6. CREATE CASHFREE ORDER (Live Production Endpoint)
const createCashfreeOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        const orderId = "ami_order_" + Date.now();
        const amount = 4080; // ₹4,000 + 2% GST

        const response = await fetch('https://api.cashfree.com/pg/orders', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': process.env.CASHFREE_CLIENT_ID,
                'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
                'x-api-version': '2023-08-01'
            },
            body: JSON.stringify({
                order_id: orderId,
                order_amount: amount,
                order_currency: "INR",
                customer_details: {
                    customer_id: user._id.toString(),
                    customer_phone: user.phonenumber || "9999999999",
                    customer_email: user.email
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(400).json({ success: false, message: data.message || "Failed to create Cashfree order." });
        }

        res.status(200).json({ 
            success: true, 
            orderId: data.order_id, 
            paymentSessionId: data.payment_session_id 
        });
    } catch (error) {
        console.error("Cashfree order error:", error); 
        res.status(500).json({ message: "Server error while creating payment order." });
    }
};

// 7. VERIFY CASHFREE PAYMENT & UPDATE USER + HISTORY (Live Production Endpoint)
const verifyCashfreePayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId } = req.body;

        if (!orderId) return res.status(400).json({ message: "Order ID missing." });

        const response = await fetch(`https://api.cashfree.com/pg/orders/${orderId}`, { 
            method: 'GET',
            headers: {
                'x-client-id': process.env.CASHFREE_CLIENT_ID,
                'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
                'x-api-version': '2023-08-01'
            }
        });

        const orderData = await response.json();
        if (!response.ok || orderData.order_status !== "PAID") {
            return res.status(400).json({ success: false, message: "Payment not completed or verified." });
        }

        const amountPaid = orderData.order_amount;
        const transactionId = orderData.cf_payment_id?.toString() || orderId;

        const now = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const currentMonthString = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        const existingPayment = await Payment.findOne({ transactionId });
        if (!existingPayment) {
            await Payment.create({
                userId,
                amount: amountPaid,
                method: 'online',
                transactionId: transactionId,
                month: currentMonthString,
                status: 'Success',
                paidAt: now
            });
        }

        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { isApproved: true, accessExpiresAt: lastDayOfMonth }, 
            { new: true }
        ).select('-password');

        res.status(200).json({ success: true, message: "Payment verified successfully!", user: updatedUser });
    } catch (error) {
        console.error("Cashfree verification error:", error);
        res.status(500).json({ message: "Server error during payment verification." });
    }
};

// 8. CASHFREE WEBHOOK ROUTE (Handles background server-to-server notifications)
const cashfreeWebhook = async (req, res) => {
    try {
        const eventData = req.body;
        
        // Check if event type is a successful payment
        if (eventData && eventData.type === "PAYMENT_SUCCESS_WEBHOOK") {
            const orderData = eventData.data.order;
            const paymentData = eventData.data.payment;

            const orderId = orderData.order_id;
            const amountPaid = orderData.order_amount;
            const transactionId = paymentData.cf_payment_id?.toString() || orderId;
            
            // Extract customer ID passed during order creation
            const userId = orderData.customer_details.customer_id;

            // Check if payment is already recorded to prevent duplicates
            const existingPayment = await Payment.findOne({ transactionId });
            if (!existingPayment) {
                const now = new Date();
                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const currentMonthString = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

                await Payment.create({
                    userId,
                    amount: amountPaid,
                    method: 'online',
                    transactionId: transactionId,
                    month: currentMonthString,
                    status: 'Success',
                    paidAt: now
                });

                const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

                await User.findByIdAndUpdate(
                    userId, 
                    { isApproved: true, accessExpiresAt: lastDayOfMonth }
                );

                console.log(`✅ Webhook processed successfully for order: ${orderId}`);
            }
        }

        // Always reply with 200 OK fast so Cashfree knows you received it
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("❌ Cashfree Webhook Error:", error);
        return res.status(500).json({ success: false, message: "Webhook processing failed" });
    }
};

// ✅ BACKWARDS COMPATIBILITY ALIAS TO PREVENT ROUTE CRASHES
const handleOnlinePaymentSuccess = verifyCashfreePayment;

module.exports = { 
    siginuppage1, 
    verifyOTP, 
    siginuppage2, 
    signinUser, 
    forgotPassword,
    resetPassword,
    getPaymentHistory, 
    handleOnlinePaymentSuccess,
    createCashfreeOrder,
    verifyCashfreePayment,
    cashfreeWebhook 
};