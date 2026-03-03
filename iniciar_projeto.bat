@echo off
title MasterData - Full Stack Launcher
color 0B
echo ==========================================
echo       INICIANDO PLATAFORMA MASTERDATA
echo ==========================================

set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/masterdata
set PYTHONPATH=.

echo [1/2] Abrindo Backend (API na porta 8000)...
cd api
start "BACKEND - API" cmd /k "call .venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3

echo [2/2] Abrindo Frontend (WEB na porta 3000)...
cd ..\web
start "FRONTEND - WEB" cmd /k "npm run dev"

echo.
echo Operacao concluida! 
echo Acesse: http://localhost:3000
pause