# Quote App: FastAPI backend + static frontend. Railway uses this when present.
FROM python:3.12-slim

WORKDIR /app

# Install backend dependencies (same Python that will run at runtime)
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend and frontend (backend serves frontend from ../frontend relative to main.py)
COPY backend/ backend/
COPY frontend/ frontend/

# Railway sets PORT; bind to 0.0.0.0 so traffic is routed
ENV PORT=8000
EXPOSE 8000

# Run from /app so backend/main.py sees frontend at /app/frontend (main.py uses Path(__file__).parent.parent / "frontend")
WORKDIR /app/backend
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
