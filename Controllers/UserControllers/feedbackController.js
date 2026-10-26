const Feedback = require("../../Models/Feedback");

const submitFeedback = async (req, res) => {
    try {
        const { rating, message } = req.body;
        if (!rating || !message) {
            return res.status(400).json({ message: "Please provide a rating and a message." });
        }

        const feedback = new Feedback({
            user: req.user.id,
            rating,
            message
        });

        await feedback.save();
        res.status(201).json({ success: true, message: "Feedback submitted successfully." });
    } catch (error) {
        console.error("Error submitting feedback:", error);
        res.status(500).json({ message: "Server error during feedback submission." });
    }
};

const getAllFeedback = async (req, res) => {
    try {
        let query = {};
        if (req.query.date) {
            const start = new Date(req.query.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.date);
            end.setHours(23, 59, 59, 999);
            query.createdAt = { $gte: start, $lte: end };
        }

        const feedbacks = await Feedback.find(query)
            .populate("user", "name email enrollmentNo room hostelblock phonenumber course")
            .sort({ createdAt: -1 });

        res.status(200).json(feedbacks);
    } catch (error) {
        console.error("Error fetching feedback:", error);
        res.status(500).json({ message: "Server error while fetching feedback: " + error.message });
    }
};

module.exports = { submitFeedback, getAllFeedback };