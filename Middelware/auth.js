const jwt = require("jsonwebtoken");
const User = require('../Models/users');
// ✅ Ensure you import the MealSkip model here
const MealSkip = require('../Models/mealSkipModel'); 

const auth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided, authorization denied.' });
        }

        const token = authHeader.replace("Bearer ", "");
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        
        req.user = verified; 
        next();
    } catch (err) {
        res.status(401).json({ message: "Token is not valid.", error: err.message });
    }
};

const checkAccess = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const now = new Date();
        if (!user.accessExpiresAt || now > new Date(user.accessExpiresAt)) {
            return res.status(403).json({ 
                message: "Access expired. Please pay mess fees for this month.",
                expiredAt: user.accessExpiresAt 
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: "Server error during access check." });
    }
};

const checkMealSkipped = async (req, res, next) => {
    try {
        const { mealType } = req.body;
        // ✅ Get local date string YYYY-MM-DD
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localDate = new Date(now.getTime() - (offset * 60 * 1000));
        const today = localDate.toISOString().split('T')[0];

        // Search if this user skipped THIS specific meal OR the "Full Day" for TODAY
        const skip = await MealSkip.findOne({ 
            userId: req.user.id, 
            date: today, 
            mealType: { $in: [mealType, 'Full Day'] } 
        });

        if (skip) {
            return res.status(403).json({ 
                success: false, 
                // ✅ Personalized message
                message: `Sorry! You skipped your ${mealType == 'Full Day' ? 'meals' : mealType} for today.` 
            });
        }
        next();
    } catch (e) {
        console.error("Skip Check Error:", e);
        res.status(500).json({ message: "Error checking skip status" });
    }
};

module.exports = { auth, checkAccess, checkMealSkipped };