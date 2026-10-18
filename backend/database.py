
from pathlib import Path
import os

import mysql.connector
from dotenv import load_dotenv

# Find the main project folder
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

# Load the project's environment variables
load_dotenv(ENV_FILE, override=True)


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "loanwise_db"),
    )
