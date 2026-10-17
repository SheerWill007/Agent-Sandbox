@echo off
echo ==========================================
echo Agent Sandbox - Quick Start Script
echo ==========================================
echo.

echo Step 1: Installing dependencies with npm ci...
call npm ci
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm ci failed!
    echo Please check the error messages above.
    pause
    exit /b 1
)
echo [SUCCESS] Dependencies installed!
echo.

echo Step 2: Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
echo [SUCCESS] Build completed!
echo.

echo Step 3: Running tests...
call npm test
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Some tests failed. Check output above.
    echo.
) else (
    echo [SUCCESS] All tests passed!
    echo.
)

echo ==========================================
echo Setup Complete!
echo ==========================================
echo.
echo Your Agent Sandbox is ready to use.
echo.
echo Next steps:
echo   - Review IMPROVEMENTS-SUMMARY.md for all changes
echo   - Check SETUP-LINTING.md to add code quality tools
echo   - Read CONTRIBUTING.md for development guidelines
echo.
echo To start the server (requires Linux + Firecracker):
echo   sudo npm start
echo.
pause
