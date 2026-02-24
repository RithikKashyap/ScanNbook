@echo off
echo ========================================
echo Fixing React Scripts and Starting App
echo ========================================
echo.

echo Step 1: Removing broken node_modules...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json

echo.
echo Step 2: Installing fresh dependencies...
npm install --no-audit --no-fund

echo.
echo Step 3: Setting Node options for compatibility...
set NODE_OPTIONS=--openssl-legacy-provider

echo.
echo Step 4: Starting the application...
npm start

pause