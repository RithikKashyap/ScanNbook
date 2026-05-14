@echo off
echo ========================================
echo QR Booking System - Setup Checker
echo ========================================
echo.

echo Checking Node.js version...
node --version
echo.

echo Checking NPM version...
npm --version
echo.

echo Checking current directory...
cd
echo.

echo Checking package.json...
if exist package.json (
    echo ✓ package.json found
) else (
    echo ✗ package.json NOT found
)

echo.
echo Checking src/App.tsx...
if exist src\App.tsx (
    echo ✓ src/App.tsx found
) else (
    echo ✗ src/App.tsx NOT found
)

echo.
echo Checking src/index.tsx...
if exist src\index.tsx (
    echo ✓ src/index.tsx found
) else (
    echo ✗ src/index.tsx NOT found
)

echo.
echo Checking public/index.html...
if exist public\index.html (
    echo ✓ public/index.html found
) else (
    echo ✗ public/index.html NOT found
)

echo.
echo Checking node_modules...
if exist node_modules (
    echo ✓ node_modules found
) else (
    echo ✗ node_modules NOT found - need to run npm install
)

echo.
echo ========================================
echo Setup check complete!
echo ========================================
pause