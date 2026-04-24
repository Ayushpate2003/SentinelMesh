FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY core/ ./core/
COPY integrations/ ./integrations/
COPY attacker_sim/ ./attacker_sim/
COPY .env .

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8002"]
