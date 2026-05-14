"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
class PaymentService {
    constructor() {
        this.keyId = process.env.RAZORPAY_KEY_ID || '';
        this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
        this.razorpay = this.keyId && this.keySecret
            ? new razorpay_1.default({
                key_id: this.keyId,
                key_secret: this.keySecret
            })
            : null;
    }
    getErrorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }
        return 'Unknown error';
    }
    async processPayment(paymentDetails) {
        try {
            if (!this.keyId || !this.keySecret) {
                throw new Error('Razorpay keys are missing in environment variables');
            }
            if (!this.razorpay) {
                this.razorpay = new razorpay_1.default({
                    key_id: this.keyId,
                    key_secret: this.keySecret
                });
            }
            const { amount, currency = 'INR', bookingId, userId } = paymentDetails;
            const amountInPaise = Math.round(Number(amount) * 100);
            if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
                throw new Error('Amount must be a positive number');
            }
            const receipt = `booking_${bookingId || Date.now()}`;
            const order = await this.razorpay.orders.create({
                amount: amountInPaise,
                currency,
                receipt,
                notes: {
                    bookingId: String(bookingId || ''),
                    userId: String(userId || '')
                }
            });
            return {
                keyId: this.keyId,
                orderId: order.id,
                amount: Number(order.amount) / 100,
                amountInPaise: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                status: order.status
            };
        }
        catch (error) {
            throw new Error('Payment processing failed: ' + this.getErrorMessage(error));
        }
    }
    async confirmPayment(paymentData) {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;
            if (!this.keySecret) {
                throw new Error('Razorpay secret key is missing');
            }
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                throw new Error('Missing Razorpay payment verification fields');
            }
            const generatedSignature = crypto_1.default
                .createHmac('sha256', this.keySecret)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');
            const isValid = generatedSignature === razorpay_signature;
            return {
                verified: isValid,
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id
            };
        }
        catch (error) {
            throw new Error('Payment verification failed: ' + this.getErrorMessage(error));
        }
    }
    async createPaymentMethod(paymentMethodData) {
        return {
            message: 'Not required for Razorpay checkout flow',
            data: paymentMethodData || null
        };
    }
}
exports.default = PaymentService;
//# sourceMappingURL=paymentService.js.map