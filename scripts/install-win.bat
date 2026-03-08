@echo off
REM ============================================================================
REM Kaltura for Adobe Creative Cloud — Windows Installer
REM Installs the UXP plugin via Adobe's UPIA (Unified Plugin Installer Agent)
REM Falls back to direct file placement if UPIA fails
REM ============================================================================

setlocal enabledelayedexpansion

set "UPIA_DIR=C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent"
set "UPIA_BIN=%UPIA_DIR%\UnifiedPluginInstallerAgent.exe"
set "PLUGIN_ID=com.kaltura.premiere.panel"
set "UXP_EXTENSIONS_DIR=C:\Program Files\Common Files\Adobe\UXP\extensions"

echo.
echo   Kaltura for Adobe Creative Cloud — Installer
echo   =============================================
echo.

REM Find the .ccx file
set "CCX_FILE="

REM Check if a .ccx was passed as argument (resolve to absolute path)
if not "%~1"=="" (
    if exist "%~1" (
        set "CCX_FILE=%~f1"
        goto :found
    )
)

REM Look for .ccx files next to this script — prefer premierepro
for %%f in ("%~dp0*premierepro*.ccx") do (
    set "CCX_FILE=%%~ff"
    goto :found
)
for %%f in ("%~dp0*.ccx") do (
    set "CCX_FILE=%%~ff"
    goto :found
)

echo   ERROR: No .ccx file found.
echo.
echo   Usage: install-win.bat [path\to\plugin.ccx]
echo.
echo   Or place this script in the same folder as the .ccx file.
pause
exit /b 1

:found
echo   Plugin:  %CCX_FILE%
echo.

REM --- Method 1: Try UPIA first ---
set "UPIA_SUCCESS=0"

if not exist "%UPIA_BIN%" goto :skip_upia

echo   Installing via Adobe UPIA...
echo.

set "TMPOUT=%TEMP%\kaltura-install-output.txt"
"%UPIA_BIN%" /install "%CCX_FILE%" > "%TMPOUT%" 2>&1
type "%TMPOUT%"
echo.

findstr /i "Installation Successful" "%TMPOUT%" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    set "UPIA_SUCCESS=1"
    del "%TMPOUT%" >nul 2>&1
    goto :upia_done
)

findstr /i "status = -204" "%TMPOUT%" >nul 2>&1
if !ERRORLEVEL! equ 0 (
    echo   Previous installation detected. Removing and reinstalling...
    echo.
    "%UPIA_BIN%" /remove "Kaltura for Adobe Creative Cloud" 2>&1
    echo.
    echo   Reinstalling...
    echo.
    "%UPIA_BIN%" /install "%CCX_FILE%" > "%TMPOUT%" 2>&1
    type "%TMPOUT%"
    echo.
    findstr /i "Installation Successful" "%TMPOUT%" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "UPIA_SUCCESS=1"
    )
)
del "%TMPOUT%" >nul 2>&1

:upia_done
:skip_upia

if "%UPIA_SUCCESS%"=="1" (
    echo   SUCCESS! The plugin has been installed.
    echo.
    echo   Next steps:
    echo   1. Open ^(or restart^) Premiere Pro, After Effects, or Audition
    echo   2. Go to Window ^> UXP Plugins ^> Kaltura
    echo   3. Sign in with your Kaltura account
    echo.
    goto :done
)

REM --- Method 2: Direct file placement (fallback) ---
echo   UPIA install did not succeed. Using direct file placement...
echo.

if not exist "%UXP_EXTENSIONS_DIR%" (
    echo   ERROR: UXP extensions directory not found at:
    echo   %UXP_EXTENSIONS_DIR%
    echo.
    echo   Please ensure Creative Cloud Desktop is installed.
    pause
    exit /b 1
)

REM Extract version from .ccx filename (e.g. kaltura-panel-1.0.2-premierepro.ccx)
set "PLUGIN_VERSION="
for /f "tokens=3 delims=-" %%v in ("%~n1") do set "PLUGIN_VERSION=%%v"
if "%PLUGIN_VERSION%"=="" (
    for /f "tokens=3 delims=-" %%v in ("!CCX_FILE!") do set "PLUGIN_VERSION=%%v"
)

if not "%PLUGIN_VERSION%"=="" (
    set "TARGET_DIR=%UXP_EXTENSIONS_DIR%\%PLUGIN_ID%-%PLUGIN_VERSION%"
) else (
    set "TARGET_DIR=%UXP_EXTENSIONS_DIR%\%PLUGIN_ID%"
)

REM Remove previous installations
for /d %%d in ("%UXP_EXTENSIONS_DIR%\%PLUGIN_ID%*") do (
    echo   Removing previous installation: %%~nxd
    rmdir /s /q "%%d" >nul 2>&1
)

REM Extract .ccx (ZIP archive) to target directory
echo   Extracting to: !TARGET_DIR!
echo.
mkdir "!TARGET_DIR!" >nul 2>&1
powershell -Command "Expand-Archive -Force -Path '%CCX_FILE%' -DestinationPath '!TARGET_DIR!'"

REM Verify manifest exists
if exist "!TARGET_DIR!\manifest.json" (
    echo.
    echo   SUCCESS! The plugin has been installed.
    echo.
    echo   Next steps:
    echo   1. Open ^(or restart^) Premiere Pro, After Effects, or Audition
    echo   2. Go to Window ^> UXP Plugins ^> Kaltura
    echo   3. Sign in with your Kaltura account
    echo.
) else (
    echo.
    echo   ERROR: Installation may have failed.
    echo   Please try the UXP Developer Tool method instead:
    echo   https://github.com/zoharbabin/kaltura-premiere-panel#install-end-users
)

:done
pause
