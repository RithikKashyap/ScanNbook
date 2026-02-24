@echo off
echo Switching to simple app version...
copy src\App-simple.tsx src\App.tsx
echo Simple app activated!
echo.
echo Starting app...
set NODE_OPTIONS=--openssl-legacy-provider
npm start