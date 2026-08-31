@echo off
REM ============================================================
REM OUI-CRM - Lancement local (sans Docker), compatible avec soft-m
REM
REM Toute la configuration vient de .env (ports, chemins MinIO, front) :
REM   PORT, MINIO_PORT, MINIO_CONSOLE_PORT, MINIO_EXE, MINIO_CERTS_DIR, STORAGE_DATA_DIR,
REM   WEB_DIR, PRISMA_STUDIO_PORT, FRONT_PORT, MAILPIT_HTTP_URL, identifiants MinIO.
REM PostgreSQL local (service partage avec soft-m) : role ouicrm et base ouicrm_db
REM crees une fois a la main ; ce script suppose qu'ils existent.
REM Les process de soft-m ne sont jamais tues : seul le MinIO OUI-CRM est redemarre.
REM ============================================================
setlocal EnableDelayedExpansion

set API_DIR=%~dp0..
cd /d "%API_DIR%"

if not exist .env (
    echo [ERREUR] .env manquant : copiez .env.example en .env
    exit /b 1
)

REM --- Lire la configuration depuis .env ---
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /R "^PORT= ^MINIO_ACCESS_KEY= ^MINIO_SECRET_KEY= ^MINIO_PORT= ^MINIO_CONSOLE_PORT= ^MINIO_EXE= ^MINIO_CERTS_DIR= ^STORAGE_DATA_DIR= ^WEB_DIR= ^PRISMA_STUDIO_PORT= ^FRONT_PORT= ^MAILPIT_HTTP_URL=" .env`) do set %%a=%%b

if "%MINIO_PORT%"=="" set MINIO_PORT=9010
if "%MINIO_CONSOLE_PORT%"=="" set MINIO_CONSOLE_PORT=9011
if "%PRISMA_STUDIO_PORT%"=="" set PRISMA_STUDIO_PORT=5556
if "%FRONT_PORT%"=="" set FRONT_PORT=5174
if "%PORT%"=="" set PORT=3001

REM --- Redemarrer uniquement le MinIO OUI-CRM (celui qui ecoute sur %MINIO_PORT%) ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%MINIO_PORT% .*LISTENING"') do (
    echo Arret du MinIO OUI-CRM existant (PID %%p^)...
    taskkill /F /PID %%p >nul 2>&1
    timeout /t 2 /nobreak >nul
)

if not exist "%STORAGE_DATA_DIR%\data" mkdir "%STORAGE_DATA_DIR%\data"

REM --- Demarrer MinIO OUI-CRM (binaire et certificats partages avec soft-m, data separe) ---
start "MinIO OUI-CRM" /MIN cmd /c "set MINIO_ROOT_USER=%MINIO_ACCESS_KEY%&& set MINIO_ROOT_PASSWORD=%MINIO_SECRET_KEY%&& cd /d %STORAGE_DATA_DIR% && "%MINIO_EXE%" server "%STORAGE_DATA_DIR%\data" --address :%MINIO_PORT% --console-address :%MINIO_CONSOLE_PORT% --certs-dir "%MINIO_CERTS_DIR%""
timeout /t 3 /nobreak >nul

call npx prisma migrate deploy
if %errorlevel% neq 0 exit /b 1

call npx prisma generate
if %errorlevel% neq 0 exit /b 1

call npm run db:seed
if %errorlevel% neq 0 exit /b 1

REM --- Bucket MinIO : cree par le seed si absent (voir prisma/seedDev.ts) ---

start "Prisma Studio OUI-CRM" /MIN cmd /c "cd /d %API_DIR% && npx prisma studio --port %PRISMA_STUDIO_PORT% --browser none"
start "OUI-CRM API" /MIN cmd /c "cd /d %API_DIR% && npm run start:dev"

if exist "%WEB_DIR%\package.json" (
    start "OUI-CRM Web" /MIN cmd /c "cd /d %WEB_DIR% && npm run dev -- --port %FRONT_PORT%"
)

echo.
echo OUI-CRM demarre :
echo   API      http://localhost:%PORT%/api/v1   Swagger http://localhost:%PORT%/api/docs
echo   Studio   http://localhost:%PRISMA_STUDIO_PORT%
echo   MinIO    https://localhost:%MINIO_CONSOLE_PORT%   (console)
echo   Mailpit  %MAILPIT_HTTP_URL%
echo   Front    http://localhost:%FRONT_PORT%
exit /b 0
