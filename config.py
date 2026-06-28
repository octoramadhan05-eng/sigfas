import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv('DATABASE_URL', 'postgresql://localhost/sigfas_db')

# Trik fix: ganti postgresql:// jadi postgresql+psycopg2:// agar dibaca SQLAlchemy dengan benar
if db_url and db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-ganti-nanti')
    # Pakai variabel db_url yang SUDAH DI-FIX di atas tadi
    SQLALCHEMY_DATABASE_URI = db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    DEBUG = os.environ.get('DEBUG', 'False') == 'True'