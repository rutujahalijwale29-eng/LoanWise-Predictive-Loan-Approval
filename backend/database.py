
import os

import mysql.connector


def get_db_connection():
    """Create a MySQL connection using environment variables."""

    required_vars = ("DB_USER", "DB_PASSWORD")

    missing_vars = [
        name
        for name in required_vars
        if not os.getenv(name)
    ]

    if missing_vars:
        raise RuntimeError(
            "Missing required database environment variables: "
            + ", ".join(missing_vars)
        )

    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "loanwise_db"),
    )
