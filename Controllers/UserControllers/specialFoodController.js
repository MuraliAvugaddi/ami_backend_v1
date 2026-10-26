const SpecialFood = require('../../Models/specialFoodModel');
const SpecialOrder = require('../../Models/specialOrderModel');

// USER: Place Order
exports.placeSpecialOrder = async (req, res) => {
    try {
        const { items, totalAmount, paymentId } = req.body;
        
        // Lead Time Check: Example logic
        const now = new Date();
        const hour = now.getHours();
        // If ordering for Lunch (approx 1 PM), block after 10 AM
        if (hour >= 10 && hour < 13) { 
             return res.status(403).json({ message: "Lead time error: Order special items at least 3 hours in advance." });
        }

        const orderToken = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newOrder = new SpecialOrder({
            userId: req.user.id,
            items,
            totalAmount,
            paymentId,
            orderToken
        });

        await newOrder.save();
        res.status(201).json({ success: true, order: newOrder });
    } catch (e) {
        res.status(500).json({ message: "Order failed" });
    }
};

// ADMIN: Add/Update Menu
exports.manageMenu = async (req, res) => {
    const { name, price, image, isAvailable } = req.body;
    const item = await SpecialFood.findOneAndUpdate(
        { name }, 
        { name, price, image, isAvailable }, 
        { upsert: true, new: true }
    );
    res.json(item);
};