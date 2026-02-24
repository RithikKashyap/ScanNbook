import { Document, Schema, model } from 'mongoose';

export interface IBooking extends Document {
  userId?: Schema.Types.ObjectId;
  bookingDate?: Date;
  service?: string;
  name: string;
  mobile: string;
  checkinDate: Date;
  checkoutDate: Date;
  paymentAmount: number;
  paymentType: 'advance' | 'full' | 'custom';
  totalAmount: number;
  customAmount: number;
  whatsappNotification: boolean;
  profilePhoto?: string | null;
  source: 'manual' | 'excel-import';
  status: 'confirmed' | 'pending' | 'canceled';
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    userId: {
      type: Schema.Types.ObjectId,
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
  },
  {
    timestamps: true
  }
);

bookingSchema.index({ checkinDate: 1, checkoutDate: 1 });
bookingSchema.index({ createdAt: -1 });

const Booking = model<IBooking>('Booking', bookingSchema);

export default Booking;
