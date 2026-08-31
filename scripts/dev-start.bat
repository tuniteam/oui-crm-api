@echo off
cd /d c:\back\oui-crm\oui-crm-api

REM --- Kill les process OUI-CRM (par port, pour ne pas toucher soft-m) ---
for %%P in (3001 5556 5174 9010) do (
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
        taskkill /F /PID %%p >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul

REM --- Start MinIO OUI-CRM (binaire et certs partages avec soft-m, data et ports separes) ---
if not exist C:\back\oui-crm-storage\data mkdir C:\back\oui-crm-storage\data
start "MinIO OUI-CRM" /MIN cmd /c "set MINIO_ROOT_USER=ouicrm&& set MINIO_ROOT_PASSWORD=ouicrm_minio_password&& cd /d C:\back\oui-crm-storage && C:\back\soft-m-storage\minio.exe server C:\back\oui-crm-storage\data --address :9010 --console-address :9011 --certs-dir C:\back\soft-m-storage\certs"

REM attendre que MinIO soit pret
timeout /t 3 /nobreak >nul

call npx prisma migrate deploy
if %errorlevel% neq 0 exit /b 1

call npx prisma generate
if %errorlevel% neq 0 exit /b 1

call npm run db:seed
if %errorlevel% neq 0 exit /b 1

start "" /MIN cmd /c "cd /d c:\back\oui-crm\oui-crm-api && npx prisma studio --port 5556"
start "" /MIN cmd /c "cd /d c:\back\oui-crm\oui-crm-api && npm run start:dev"

start "" /MIN cmd /c "cd /d c:\back\oui-crm\oui-crm-web && npm run dev -- --port 5174"

exit
