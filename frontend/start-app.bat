@echo off
echo ========================================
echo QR Booking System - Starting App
echo ========================================
echo.

echo Step 1: Cleaning npm cache...
npm cache clean --force

echo.
echo Step 2: Removing old node_modules...
if exist node_modules (
    rmdir /s /q node_modules
    echo node_modules removed
) else (
    echo node_modules not found - skipping
)

echo.
echo Step 3: Removing package-lock.json...
if exist package-lock.json (
    del package-lock.json
    echo package-lock.json removed
) else (
    echo package-lock.json not found - skipping
)

echo.
echo Step 4: Installing dependencies...
npm install --no-optional --legacy-peer-deps

echo.
echo Step 5: Starting the application...
set NODE_OPTIONS=--openssl-legacy-provider
npm start

pause