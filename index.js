require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// Import Routes
const authrouter = require("./Routes/UserRoutes/authRoute");
const userRoute = require('./Routes/UserRoutes/user_Routes');
const adminRoute = require('./Routes/AdimeRoutes/adimeRoute');
const tokenRoute = require('./Routes/UserRoutes/token_route');
const getTokenHistory = require('./Routes/AdimeRoutes/historyRoute');
const dayScholarRoute = require('./Routes/UserRoutes/dayschorls_routes');
const dayScholarAdminRoute = require('./Routes/AdimeRoutes/dayScholreshistory');
const menuRoute = require('./Routes/AdimeRoutes/menuRoute');
const feedbackRoute = require('./Routes/UserRoutes/feedbackRoutes');
// ✅ Works with BOTH names: your Mac has systemConfigRoute.js, GitHub had systemNoticeRoute.js
const fs = require('fs');
const path = require('path');
const systemNoticeRoute = fs.existsSync(path.join(__dirname, 'Routes/AdimeRoutes/systemConfigRoute.js'))
    ? require('./Routes/AdimeRoutes/systemConfigRoute')
    : require('./Routes/AdimeRoutes/systemNoticeRoute');
const paymentRoute = require('./Routes/UserRoutes/paymentRoute');                 // ✅ Screenshot payments (student)
const paymentReviewRoute = require('./Routes/AdimeRoutes/paymentReviewRoute');    // ✅ Screenshot payments (admin)
const appVersionRoute = require('./Routes/UserRoutes/appVersionRoute');           // ✅ App update check

// ✅ AMI HOSTEL — complaints, SOS, visitors, staff
const jwt = require('jsonwebtoken');
const hostelRoute = require('./Routes/UserRoutes/hostelRoute');
const staffRoute = require('./Routes/StaffRoutes/staffRoute');
const { setHostelIo } = require('./utils/hostelNotify');
const { startComplaintEscalation } = require('./services/complaintEscalation');

// 1. Initialize Express App
const app = express();

// 2. CORS configuration (Flutter Web pre-flight & auth)
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"]
}));

// Body parsers
// 10mb so students can upload payment screenshots (sent as base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Create HTTP Server for Socket.io
const server = http.createServer(app);

// 4. Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.set('socketio', io);
app.use((req, res, next) => {
    req.io = io;
    next();
});

io.on('connection', (socket) => {
    console.log('⚡ A device connected to the bridge:', socket.id);

    // ✅ Student app: personal room for complaint / SOS updates
    socket.on('registerUser', (userId) => {
        if (userId) socket.join(`user:${userId}`);
    });

    // ✅ Admin app staff: rooms for SOS alarms and job updates
    socket.on('registerStaff', (token) => {
        try {
            const data = jwt.verify(String(token || ''), process.env.JWT_SECRET);
            if (!data.staff) return;
            socket.join('staff');
            socket.join(`staff:${data.id}`);
        } catch (e) {
            // ignore bad tokens
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Device disconnected');
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Backend is running smoothly' });
});

// ============================================================
// ROUTES MOUNTING
// ============================================================

// Authentication & Day Scholar Routes
app.use('/api/auth', authrouter);
app.use('/api/auth', dayScholarRoute);

// Core User Routes
app.use('/api', userRoute);

// Menu Routes
app.use('/api', menuRoute);

// Admin Dashboard, Orders & History Routes
app.use('/api/admin', adminRoute);
app.use('/api/admin', dayScholarAdminRoute);
app.use('/api/admin', getTokenHistory);

// Meal Token Routes
app.use('/api/tokens', tokenRoute);

// Feedback Routes
app.use('/api', feedbackRoute);
app.use('/api/admin', feedbackRoute);

// ✅ System / Payment Notice -> GET /api/system/notice
app.use('/api', systemNoticeRoute);

// ✅ Screenshot payments
app.use('/api/payments', paymentRoute);          // student: /config, /submit, /my-submissions, /my-receipts
app.use('/api/admin', paymentReviewRoute);       // admin: /payment-submissions, /students/:id/receipts

// ✅ App update check -> GET /api/app-version
app.use('/api', appVersionRoute);

// ✅ AMI HOSTEL
app.use('/api', hostelRoute);            // student: /complaints, /sos, /hostel-notifications, public /visitors/public
app.use('/api/staff', staffRoute);       // admin app staff login + complaints, SOS, visitors, team

// ✅ Visitor gate form + printable gate QR (web pages)
app.get('/visit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'visit.html')));
app.get('/gate-qr', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gate-qr.html')));

// ============================================================
// JSON 404 HANDLER
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// Database Connection
setHostelIo(io);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully");
        startComplaintEscalation();
    })
    .catch((err) => console.log("❌ MongoDB Connection Error:", err));

const PORT = process.env.PORT || 5002;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
});