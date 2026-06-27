FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements dulu
COPY requirements.txt .

# Install dependencies dengan --break-system-packages karena kita di container sendiri
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY . .

# Port default
EXPOSE 8080
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8080"]