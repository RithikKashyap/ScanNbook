@echo off
echo Creating fresh React app...
cd ..
npx create-react-app qr-booking-fresh --template typescript
cd qr-booking-fresh
set NODE_OPTIONS=--openssl-legacy-provider
npm start