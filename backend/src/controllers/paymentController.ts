import { Request, Response } from 'express';
import PaymentService from '../services/paymentService';

class PaymentController {
    private paymentService: PaymentService;

    constructor() {
        this.paymentService = new PaymentService();
    }

    public initiatePayment = async (req: Request, res: Response): Promise<void> => {
        try {
            const paymentData = req.body;
            
            // Validate required fields
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
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Payment initiation failed', 
                error: error.message 
            });
        }
    };

    public verifyPayment = async (req: Request, res: Response): Promise<void> => {
        try {
            const paymentData = req.body;

            if (
                !paymentData.razorpay_order_id ||
                !paymentData.razorpay_payment_id ||
                !paymentData.razorpay_signature
            ) {
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
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Payment verification failed', 
                error: error.message 
            });
        }
    };

    public createPaymentMethod = async (req: Request, res: Response): Promise<void> => {
        try {
            const paymentMethodData = req.body;
            const paymentMethod = await this.paymentService.createPaymentMethod(paymentMethodData);
            res.status(201).json({
                message: 'Payment method created successfully',
                paymentMethod
            });
        } catch (error: any) {
            res.status(500).json({ 
                message: 'Payment method creation failed', 
                error: error.message 
            });
        }
    };
}

export default new PaymentController();
