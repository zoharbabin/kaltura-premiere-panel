@echo off
REM ============================================================================
REM Kaltura for Adobe Creative Cloud — Windows Installer
REM Installs the UXP plugin via Adobe's UPIA (Unified Plugin Installer Agent)
REM ============================================================================

setlocal enabledelayedexpansion

set "UPIA_DIR=C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent"
set "UPIA_BIN=%UPIA_DIR%\UnifiedPluginInstallerAgent.exe"

echo.
echo   Kaltura for Adobe Creative Cloud — Installer
echo   =============================================
echo.

REM Find the .ccx file
set "CCX_FILE="

REM Check if a .ccx was passed as argument
if not "%~1"=="" (
    if exist "%~1" (
        set "CCX_FILE=%~1"
        goto :found
    )
)

REM Look for .ccx files next to this script
for %%f in ("%~dp0*.ccx") do (
    set "CCX_FILE=%%f"
    goto :found
)

echo   ERROR: No .ccx file found.
echo.
echo   Usage: install-win.bat [path\to\plugin.ccx]
echo.
echo   Or place this script in the same folder as the .ccx file.
exit /b 1

:found
echo   Plugin:  %CCX_FILE%
echo.

REM Check UPIA exists
if not exist "%UPIA_BIN%" (
    echo   ERROR: Adobe Creative Cloud Desktop is not installed,
    echo   or UPIA was not found at the expected location.
    echo.
    echo   Please install Creative Cloud Desktop from:
    echo   https://creativecloud.adobe.com/apps/download/creative-cloud
    echo.
    echo   Then re-run this installer.
    exit /b 1
)

echo   Installing via Adobe UPIA...
echo.

REM Run UPIA install
"%UPIA_BIN%" /install "%CCX_FILE%"
set RESULT=%ERRORLEVEL%

echo.
if %RESULT% equ 0 (
    echo   SUCCESS! The plugin has been installed.
    echo.
    echo   Next steps:
    echo   1. Open ^(or restart^) Premiere Pro, After Effects, or Audition
    echo   2. Go to Window ^> UXP Plugins ^> Kaltura
    echo   3. Sign in with your Kaltura account
    echo.
) else (
    echo   Installation failed ^(exit code %RESULT%^).
    echo.
    echo   Troubleshooting:
    echo   - Make sure Creative Cloud Desktop is running and up to date
    echo   - Make sure you are signed into Creative Cloud
    echo   - Try restarting Creative Cloud Desktop and running this again
    echo.
    echo   Alternative: install manually via UXP Developer Tool:
    echo   https://github.com/zoharbabin/kaltura-premiere-panel#install-end-users
    exit /b %RESULT%
)

pause
