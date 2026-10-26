const DayScholarOrder = require('../../Models/dayScholarOrderModel');

// Fetch Day Scholar Orders for Admin with filtering & Date support
const getAdminDayScholarOrders = async (req, res) => {
    try {
        let { month, mealType, gender, date } = req.query;

        // Default to current month if not specified and no date filter is active
        if ((!month || month === 'All') && !date) {
            const now = new Date();
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            month = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
        }

        let query = {};

        // ✅ Handle Exact Date Filtering (e.g., "2026-07-30")
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);

            query.orderedAt = { $gte: startDate, $lte: endDate };
        } else if (month) {
            query.month = month;
        }

        if (mealType && mealType !== 'All') {
            query.mealType = mealType;
        }

        let orders = await DayScholarOrder.find(query)
            .populate('userId', 'name enrollmentNo year room phonenumber gender')
            .sort({ orderedAt: -1 });

        if (gender && gender !== 'All') {
            orders = orders.filter(o => o.userId && o.userId.gender === gender);
        }

        // Calculate breakdown stats for admin summary cards
        const stats = {
            totalCollection: orders.reduce((sum, item) => sum + item.totalAmount, 0),
            totalOrders: orders.length,
            breakfastCount: orders.filter(o => o.mealType === 'Breakfast').length,
            lunchCount: orders.filter(o => o.mealType === 'Lunch').length,
            snacksCount: orders.filter(o => o.mealType === 'Snacks').length,
            dinnerCount: orders.filter(o => o.mealType === 'Dinner').length,
        };

        res.status(200).json({ success: true, stats, orders });
    } catch (error) {
        console.error("Error fetching day scholar orders:", error);
        res.status(500).json({ message: "Failed to fetch day scholar orders" });
    }
};

module.exports = {
    getAdminDayScholarOrders
};