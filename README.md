# ScanNbook

## Overview
The ScanNbook is a web application that allows users to book services using QR codes. The system consists of a frontend built with React and a backend built with Node.js and Express. Users can register, log in, book dates, process payments, and receive confirmation messages.

## Project Structure
```
qr-booking-system
├── backend
│   ├── src
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── controllers
│   │   │   ├── authController.ts
│   │   │   ├── bookingController.ts
│   │   │   ├── paymentController.ts
│   │   │   ├── qrController.ts
│   │   │   └── settingsController.ts
│   │   ├── services
│   │   │   ├── authService.ts
│   │   │   ├── bookingService.ts
│   │   │   └── paymentService.ts
│   │   ├── models
│   │   │   ├── user.ts
│   │   │   ├── booking.ts
│   │   │   └── uiAsset.ts
│   │   ├── routes
│   │   │   └── index.ts
│   │   ├── middleware
│   │   │   ├── auth.ts
│   │   │   └── adminAuth.ts
│   │   └── utils
│   │       └── qrUtils.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend
│   ├── src
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── pages
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── ScanQR.tsx
│   │   │   ├── Booking.tsx
│   │   │   └── Payment.tsx
│   │   ├── components
│   │   │   ├── QRScanner.tsx
│   │   │   ├── BookingForm.tsx
│   │   │   └── Confirmation.tsx
│   │   ├── services
│   │   │   └── api.ts
│   │   └── types
│   │       └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites
- Node.js (version 14 or higher)
- npm (Node Package Manager)
- Docker (for containerization)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd qr-booking-system
   ```

2. Navigate to the backend directory and install dependencies:
   ```
   cd backend
   npm install
   ```

3. Navigate to the frontend directory and install dependencies:
   ```
   cd ../frontend
   npm install
   ```

### Configuration
- Create a `.env` file in both the `backend` and `frontend` directories based on the `.env.example` files provided. Update the environment variables as needed.

### Running the Application

1. Start the backend server:
   ```
   cd backend
   npm start
   ```

2. Start the frontend application:
   ```
   cd ../frontend
   npm start
   ```

3. Optionally, you can use Docker to run the application:
   ```
   docker-compose up
   ```

### Usage
- Access the frontend application at `http://localhost:3000`.
- Users can register, log in, scan QR codes, make bookings, and process payments through the application.

## Deployment

### Render.com Deployment

1. **Backend Deployment:**
   - Create a new Web Service on Render.com
   - Connect your GitHub repository
   - Set the following environment variables:
     - `NODE_ENV=production`
     - `DATABASE_URL=your_mongodb_connection_string`
     - `JWT_SECRET=your_secure_jwt_secret`
     - `RAZORPAY_KEY_ID=your_razorpay_key_id`
     - `RAZORPAY_KEY_SECRET=your_razorpay_key_secret`
     - `CORS_ORIGINS=https://your-frontend-app.onrender.com`
     - `PORT=5000`
   - Set build command: `npm install`
   - Set start command: `npm run start:prod`

2. **Frontend Deployment:**
   - Create a new Static Site on Render.com
   - Connect your GitHub repository (select frontend folder)
   - Set build command: `npm run build`
   - Set publish directory: `build`
   - Add environment variable: `REACT_APP_API_BASE_URL=https://your-backend-app.onrender.com/api`

### Docker Deployment

1. **Using Docker Compose:**
   ```bash
   docker-compose up --build
   ```

2. **Environment Variables:**
   - Copy `.env.example` to `.env` in both backend and frontend directories
   - Update the values according to your deployment environment

## Troubleshooting

### Common Issues Fixed

1. **Merge Conflicts:** Resolved Git merge conflicts in README.md
2. **CORS Issues:** Configured proper CORS origins from environment variables
3. **Error Handling:** Added React Error Boundary to prevent blank pages
4. **Build Optimization:** Disabled source maps and optimized bundle size
5. **Environment Variables:** Added production environment configurations

### Health Checks

- Backend health check: `GET /api/health`
- Frontend error boundary provides user-friendly error messages
