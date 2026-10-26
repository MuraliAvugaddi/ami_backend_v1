require('dotenv').config();
const User = require("../../Models/users");
const Payment = require("../../Models/paymentModel");
const DayScholarOrder = require("../../Models/dayScholarOrderModel");

// 1. Create Cashfree Order for Day Scholar Individual Meal
const createDayScholarOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { mealType } = req.body; // 'Breakfast', 'Lunch', 'Snacks', 'Dinner'

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found." });
        let basePrice = 0;
        if (mealType === 'Breakfast') basePrice = 60;
        else if (mealType === 'Lunch') basePrice = 80;
        else if (mealType === 'Snacks') basePrice = 50;
        else if (mealType === 'Dinner') basePrice = 80;
        else return res.status(400).json({ message: "Invalid meal type selected." });

        const gst = basePrice * 0.02;
        const totalAmount = Math.round((basePrice + gst) * 100) / 100; // Total with 2% GST
        const orderId = "ds_order_" + Date.now();

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
                order_amount: totalAmount,
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
            return res.status(400).json({ success: false, message: data.message || "Failed to create order." });
        }

        res.status(200).json({ 
            success: true, 
            orderId: data.order_id, 
            paymentSessionId: data.payment_session_id,
            mealType,
            totalAmount
        });
    } catch (error) {
        console.error("Day scholar order error:", error);
        res.status(500).json({ message: "Server error creating payment." });
    }
};

// 2. Verify Payment & Generate Unique Day Scholar Token
const verifyDayScholarPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { orderId, mealType } = req.body;

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
            return res.status(400).json({ success: false, message: "Payment verification failed." });
        }

        const now = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const currentMonthString = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        const tokenNumber = "DS-" + Math.floor(1000 + Math.random() * 9000);
        const transactionId = orderData.cf_payment_id?.toString() || orderId;
        const amountPaid = orderData.order_amount;
        const base = amountPaid / 1.02;

        const newOrder = await DayScholarOrder.create({
            userId,
            mealType,
            baseAmount: Math.round(base * 100) / 100,
            gstAmount: Math.round((amountPaid - base) * 100) / 100,
            totalAmount: amountPaid,
            tokenNumber,
            paymentId: transactionId,
            transactionId,
            month: currentMonthString
        });

        // Log into global Payment collection for admin revenue tracking
        await Payment.create({
            userId,
            amount: amountPaid,
            method: 'online',
            transactionId,
            month: currentMonthString,
            status: 'Success'
        });

        res.status(200).json({ success: true, tokenNumber, order: newOrder });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({ message: "Payment confirmation server error." });
    }
};

module.exports = {
    createDayScholarOrder,
    verifyDayScholarPayment
};