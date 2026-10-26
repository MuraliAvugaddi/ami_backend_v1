// Payment / service notice shown on the admin panel home screen.
// All values come from environment variables (Render → Environment),
// so you can turn it ON / OFF without touching the Flutter app.

const getSystemNotice = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            enabled: process.env.NOTICE_ENABLED === 'true',
            name: process.env.NOTICE_NAME || 'Admin',
            dueDate: process.env.NOTICE_DUE_DATE || null,          // 2026-10-19
            amount: process.env.NOTICE_AMOUNT || null,             // 5000
            contact: process.env.NOTICE_CONTACT || null,           // Venkat · 98xxxxxxxx
            dbName: process.env.NOTICE_DB_NAME || 'MongoDB Atlas Database',
            dbLink: process.env.NOTICE_DB_LINK || 'https://cloud.mongodb.com',
            serverName: process.env.NOTICE_SERVER_NAME || 'Render Server Hosting',
            serverLink: process.env.NOTICE_SERVER_LINK || 'https://dashboard.render.com'
        });
    } catch (error) {
        console.error('System notice error:', error);
        res.status(500).json({ success: false, enabled: false, message: 'Server error' });
    }
};

module.exports = { getSystemNotice };