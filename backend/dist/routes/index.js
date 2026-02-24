"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const authController_1 = __importDefault(require("../controllers/authController"));
const bookingController_1 = __importDefault(require("../controllers/bookingController"));
const paymentController_1 = __importDefault(require("../controllers/paymentController"));
const qrController_1 = __importDefault(require("../controllers/qrController"));
const settingsController_1 = __importDefault(require("../controllers/settingsController"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.get('/health', (req, res) => {
    res.status(200).json({ message: 'API is running', timestamp: new Date().toISOString() });
});
router.post('/auth/register', authController_1.default.registerUser);
router.post('/auth/login', authController_1.default.loginUser);
router.get('/settings/admin-login', settingsController_1.default.getAdminLoginSettings);
router.get('/bookings/available-dates', bookingController_1.default.getAvailableDates);
router.get('/bookings', bookingController_1.default.getAllBookings);
router.post('/bookings/public', bookingController_1.default.createPublicBooking);
router.get('/bookings/export', bookingController_1.default.exportBookingsToExcel);
router.post('/bookings/import', upload.single('file'), bookingController_1.default.importBookingsFromExcel);
router.post('/bookings', auth_1.authenticateToken, bookingController_1.default.createBooking);
router.get('/bookings/user/:userId', auth_1.authenticateToken, bookingController_1.default.getUserBookings);
router.patch('/bookings/:bookingId/status', auth_1.authenticateToken, bookingController_1.default.updateBookingStatus);
router.post('/payments/initiate', auth_1.authenticateToken, paymentController_1.default.initiatePayment);
router.post('/payments/verify', paymentController_1.default.verifyPayment);
router.post('/payments/methods', auth_1.authenticateToken, paymentController_1.default.createPaymentMethod);
router.get('/qr/booking/:bookingId/:userId', auth_1.authenticateToken, qrController_1.default.generateBookingQR);
router.post('/qr/verify', qrController_1.default.verifyBookingQR);
router.get('/qr/download/:bookingId/:userId', auth_1.authenticateToken, qrController_1.default.downloadBookingQR);
exports.default = router;
//# sourceMappingURL=index.js.map