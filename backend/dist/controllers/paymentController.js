"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const paymentService_1 = __importDefault(require("../services/paymentService"));
class PaymentController {
    constructor() {
        this.initiatePayment = async (req, res) => {
            try {
                const paymentData = req.body;
                if (!paymentData.amount || !paymentData.bookingId) {
                    res.status(400).json({
                        message: 'Amount and booking ID are required'
                    });
                    return;
                }
                const paymentResponse = await this.paymentService.processPayment(paymentData);
                res.status(200).json({
                    message: 'Payment initiated successfully',
                    ...paymentResponse
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Payment initiation failed',
                    error: error.message
                });
            }
        };
        this.verifyPayment = async (req, res) => {
            try {
                const paymentData = req.body;
                if (!paymentData.razorpay_order_id ||
                    !paymentData.razorpay_payment_id ||
                    !paymentData.razorpay_signature) {
                    res.status(400).json({
                        message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required'
                    });
                    return;
                }
                const verificationResponse = await this.paymentService.confirmPayment(paymentData);
                if (!verificationResponse.verified) {
                    res.status(400).json({
                        message: 'Payment signature verification failed',
                        ...verificationResponse
                    });
                    return;
                }
                res.status(200).json({
                    message: 'Payment verified successfully',
                    ...verificationResponse
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Payment verification failed',
                    error: error.message
                });
            }
        };
        this.createPaymentMethod = async (req, res) => {
            try {
                const paymentMethodData = req.body;
                const paymentMethod = await this.paymentService.createPaymentMethod(paymentMethodData);
                res.status(201).json({
                    message: 'Payment method created successfully',
                    paymentMethod
                });
            }
            catch (error) {
                res.status(500).json({
                    message: 'Payment method creation failed',
                    error: error.message
                });
            }
        };
        this.paymentService = new paymentService_1.default();
    }
}
exports.default = new PaymentController();
//# sourceMappingURL=paymentController.js.map