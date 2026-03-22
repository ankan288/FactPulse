@echo off
echo =========================================
echo  FactCheck AI - Starting Backend
echo =========================================
echo.
cd /d "%~dp0backend"

if not exist ".env" (
    echo [WARNING] .env file not found. Copying from .env.example...
    copy .env.example .env
    echo Please fill in your API keys in: backend\.env
    echo.
)

echo Installing Python dependencies...
pip install -r requirements.txt

echo.
echo Starting FastAPI server on http://localhost:8000
echo API docs available at http://localhost:8000/docs
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
