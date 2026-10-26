const MealSkip = require('../../Models/mealSkipModel');

exports.skipMeal = async (req, res) => {
    try {
        const { date, mealType } = req.body; 
        const userId = req.user.id;

        // ✅ 11 PM CUT-OFF LOGIC
        const now = new Date();
        const targetDate = new Date(date);
        const deadline = new Date(targetDate);
        deadline.setDate(deadline.getDate() - 1); 
        deadline.setHours(23, 0, 0, 0); 

        if (now > deadline) {
            return res.status(403).json({ 
                success: false, 
                message: "Too late! You must skip tomorrow's meals before 11 PM tonight." 
            });
        }

        const monthName = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        const newSkip = new MealSkip({ userId, date, mealType, month: monthName });
        await newSkip.save();

        res.status(201).json({ success: true, message: `${mealType} skipped successfully.` });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Meal already skipped." });
        res.status(500).json({ message: "Server error" });
    }
};

exports.getMySkipHistory = async (req, res) => {
    try {
        const { month, page = 1 } = req.query;
        const query = { userId: req.user.id };
        
        // Filter by month name if provided (e.g., "May 2026")
        if (month) {
            query.month = month;
        }

        const limit = 15;
        const skip = (parseInt(page) - 1) * limit;

        const skips = await MealSkip.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        res.json({ success: true, skips });
    } catch (e) {
        res.status(500).json({ message: "Error loading skip history" });
    }
};