const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        lowercase: true,
        validate: {
            validator: (value) => {
                const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                return re.test(String(value));
            },
            message: "Please enter a valid email address."
        }
    },
    password: {
        type: String,
        required: false
    },
    enrollmentNo: {
        type: String,
        unique: true,
        sparse: true,
    },
    course: {
        type: String,
    },
    year: {
        type: Number,
    },
    phonenumber: {
        type: String,
    },
    fatherPhone: {
        type: String,
        default: '' // ✅ Permanent profile field for father's contact number
    },
    hostelblock: {
        type: String,
    },
    room: {
        type: Number,
    },
    gender: {
        type: String,
    },
    accessExpiresAt: {
        type: Date,
        default: null
    },
    isApproved: {
        type: Boolean,
        default: false 
    }
}, { timestamps: true });

// Password hashing middleware (only runs if password exists and is modified)
userSchema.pre("save", async function (next) {
    if (!this.password || !this.isModified("password")) {
        return next();
    }
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;