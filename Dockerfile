FROM python:3.12-slim

# Install system dependencies & pip
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# Port default Railway
EXPOSE 8080
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8080"]