@echo off
:: Daily Rundown — dev launcher
:: Starts the local server. Chrome DevTools MCP manages its own Chrome instance.

start "Daily Rundown Dev Server" node "%~dp0serve.js"
echo Dev server starting at http://localhost:8080/?env=dev
