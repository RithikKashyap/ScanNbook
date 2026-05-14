"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingTimingConfig = exports.getAdminUiConfig = void 0;
const DEFAULT_ADMIN_MODULES = [
    'Complaint Management',
    'Booking Details',
    'Contact',
    'Service',
    'View Bhawan'
];
const parseCsv = (value, fallback) => {
    if (!value || !value.trim()) {
        return [...fallback];
    }
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};
const parseBool = (value, fallback) => {
    if (value === undefined) {
        return fallback;
    }
    return value.trim().toLowerCase() === 'true';
};
const parseTime = (value, fallback) => {
    const raw = value?.trim() || fallback;
    return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
};
const getAdminUiConfig = () => {
    return {
        adminLoginEnabled: parseBool(process.env.ADMIN_LOGIN_ENABLED, true),
        modules: parseCsv(process.env.ADMIN_LOGIN_MODULES, DEFAULT_ADMIN_MODULES),
        banner: {
            permanent: parseBool(process.env.PERMANENT_BANNER_ENABLED, true),
            background: process.env.PERMANENT_BANNER_BACKGROUND || 'Bhawan'
        }
    };
};
exports.getAdminUiConfig = getAdminUiConfig;
const getBookingTimingConfig = () => {
    return {
        checkInTime: parseTime(process.env.BOOKING_CHECKIN_TIME, '07:30'),
        checkOutTime: parseTime(process.env.BOOKING_CHECKOUT_TIME, '06:30')
    };
};
exports.getBookingTimingConfig = getBookingTimingConfig;
//# sourceMappingURL=uiConfig.js.map