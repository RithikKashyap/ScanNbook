"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const bookingSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    bookingDate: {
        type: Date,
        required: false
    },
    service: {
        type: String,
        required: false
    },
    name: {
        type: String,
        trim: true,
        required: true
    },
    mobile: {
        type: String,
        trim: true,
        required: true
    },
    checkinDate: {
        type: Date,
        required: true
    },
    checkoutDate: {
        type: Date,
        required: true
    },
    paymentAmount: {
        type: Number,
        required: true
    },
    paymentType: {
        type: String,
        enum: ['advance', 'full', 'custom'],
        default: 'advance'
    },
    totalAmount: {
        type: Number,
        required: true
    },
    customAmount: {
        type: Number,
        default: 0
    },
    whatsappNotification: {
        type: Boolean,
        default: true
    },
    profilePhoto: {
        type: String,
        default: null
    },
    source: {
        type: String,
        enum: ['manual', 'excel-import'],
        default: 'manual'
    },
    status: {
        type: String,
        enum: ['confirmed', 'pending', 'canceled'],
        default: 'pending'
    }
}, {
    timestamps: true
});
bookingSchema.index({ checkinDate: 1, checkoutDate: 1 });
bookingSchema.index({ createdAt: -1 });
const Booking = (0, mongoose_1.model)('Booking', bookingSchema);
exports.default = Booking;
//# sourceMappingURL=booking.js.map