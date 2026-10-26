const User = require('../../Models/users');
const Token = require('../../Models/tokenModel');

// GET USER-SPECIFIC HISTORY
exports.getUserTokenHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        const history = await Token.find({ userId })
            .sort({ generatedAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCount = await Token.countDocuments({ userId });

        res.status(200).json({
            success: true,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            history
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching history" });
    }
};

// Function to get paginated token generation history for Admin
exports.getTokenHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, mealType, date } = req.query; 
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const matchQuery = {};
    
    // ✅ Fix: Use capitalized 'mealType' to precisely match your MongoDB database schema documents
    if (mealType && mealType !== 'All') {
      matchQuery.mealType = { $regex: new RegExp("^" + mealType + "$", "i") }; // Case-insensitive match
    }
    
    if (date) {
      matchQuery.date = { $regex: new RegExp("^" + date) }; 
    }

    const pipeline = [];

    if (Object.keys(matchQuery).length > 0) {
      pipeline.push({ $match: matchQuery });
    }

    pipeline.push(
      { $sort: { generatedAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          tokenNumber: 1,
          mealType: { $ifNull: ['$mealType', 'Unknown'] }, // ✅ Project capital 'mealType' correctly
          date: 1,
          generatedAt: 1,
          name: { $ifNull: ['$userDetails.name', 'Unknown User'] },
          enrollmentNo: { $ifNull: ['$userDetails.enrollmentNo', 'N/A'] },
          year: { $ifNull: ['$userDetails.year', 0] },
          room: { $ifNull: ['$userDetails.room', 0] },
        },
      }
    );

    const [history, totalCount] = await Promise.all([
      Token.aggregate(pipeline),
      Token.countDocuments(matchQuery)
    ]);

    res.status(200).json({
      success: true,
      totalPages: Math.ceil(totalCount / parseInt(limit)) || 1,
      currentPage: parseInt(page),
      history: history,
    });
    
  } catch (error) {
    console.error('Error fetching admin token history:', error); 
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching token history.' 
    });
  }
};