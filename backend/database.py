
from pathlib import Path
import os

import mysql.connector
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE, override=True)


def get_db_connection():
    required_settings = ["DB_USER", "DB_PASSWORD"]

    missing = [
        key for key in required_settings
        if not os.getenv(key)
    ]

    if missing:
        raise RuntimeError(
            f"Missing database configuration: {', '.join(missing)}"
        )

    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "loanwise_db"),
    )
