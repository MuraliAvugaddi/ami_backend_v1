const Token = require('../../Models/tokenModel');
const Counter = require('../../Models/counterModels');
const User = require('../../Models/users'); 

/**
 * HELPER: Atomic Token Generator
 */
const getNextTokenNumber = async (mealType, date) => {
    const sequenceName = `${mealType.toLowerCase()}_${date}`;
    const counter = await Counter.findByIdAndUpdate(
        sequenceName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

// --- MAIN CONTROLLER ---
exports.generateToken = async (req, res) => {
  try {
    const { mealType } = req.body;
    const userId = req.user.id; 

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const today = new Date().toISOString().slice(0, 10);

    // 1. Check for duplicates (Fast)
    const existingToken = await Token.findOne({ userId, mealType, date: today });
    if (existingToken) {
        return res.status(409).json({ success: false, message: `Already have a token for ${mealType}.` });
    }
    
    // 2. Generate Number (Fast Atomic Operation)
    const tokenNumber = await getNextTokenNumber(mealType, today);

    // 3. Save Record
    const newToken = new Token({ userId, mealType, tokenNumber, date: today });
    await newToken.save();
    
    // 4. BRIDGE TRIGGER: Send to Laptop for Printing
    const io = req.app.get('socketio');
    if (io) {
        io.emit("print-token", {
            tokenNumber: newToken.tokenNumber,
            userName: user.name,
            mealType: newToken.mealType,
            gender: user.gender
        });
        console.log(`📡 Socket emitted: Print request for ${user.name}`);
    } else {
        console.error("❌ Socket.io not initialized on server");
    }

    // 5. Instantly tell the Student App it's done
    res.status(201).json({ 
        success: true, 
        message: "Token generated! Collect your slip.",
        token: newToken 
    });

  } catch (error) {
    console.error("Token Error:", error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// 2. GET USER-SPECIFIC HISTORY (With Pagination & Optional Month Filter)
exports.getUserTokenHistory = async (req, res) => {
    try {
        const userId = req.user.id; 
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;
        const monthQuery = req.query.month; // Format: "YYYY-MM"

        let query = { userId };
        
        // If a month is specified, filter by date prefix (e.g., "2026-06")
        if (monthQuery) {
            query.date = { $regex: `^${monthQuery}` };
        }

        const history = await Token.find(query)
            .sort({ generatedAt: -1 }) 
            .skip(skip)
            .limit(limit);

        const totalCount = await Token.countDocuments(query);

        res.status(200).json({
            success: true,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            history
        });
    } catch (error) {
        console.error("History Fetch Error:", error);
        res.status(500).json({ success: false, message: "Error fetching history" });
    }
};

// 3. ADMIN: GET STATS BY DATE
exports.getStatsByDate = async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const stats = await Token.aggregate([
            { $match: { date: date } },
            { $group: { _id: '$mealType', count: { $sum: 1 } } }
        ]);
        const formatted = { "Breakfast": 0, "Lunch": 0, "Snacks": 0, "Dinner": 0 };
        stats.forEach(item => { formatted[item._id] = item.count; });
        res.status(200).json(formatted);
    } catch (e) { 
        res.status(500).json({ message: 'Error' }); 
    }
};