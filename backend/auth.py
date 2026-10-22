
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os

import jwt
import mysql.connector
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.database import get_db_connection


# Load environment variables
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is missing from the project .env file"
    )


# Authentication settings
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60

password_hash = PasswordHash.recommended()

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


# Registration request fields
class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


# Login request fields
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# Generate a JWT access token
def create_access_token(user_id: int, role: str):
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=ALGORITHM
    )


# Register a new user
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(data: RegisterRequest):
    full_name = data.full_name.strip()
    email = str(data.email).strip().lower()

    if len(full_name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Full name must contain at least 2 characters."
        )

    hashed_password = password_hash.hash(data.password)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT id FROM users WHERE email = %s",
            (email,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists."
            )

        cursor.execute(
            """
            INSERT INTO users (full_name, email, password_hash)
            VALUES (%s, %s, %s)
            """,
            (full_name, email, hashed_password)
        )

        connection.commit()
        user_id = cursor.lastrowid

        return {
            "message": "Registration successful. Please log in.",
            "user": {
                "id": user_id,
                "full_name": full_name,
                "email": email,
                "role": "user"
            }
        }

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise

    except mysql.connector.IntegrityError as exc:
        if connection is not None:
            connection.rollback()

        raise HTTPException(
            status_code=409,
            detail="An account with this email may already exist."
        ) from exc

    except mysql.connector.Error as exc:
        if connection is not None:
            connection.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to register the account. Check the database."
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


# Log in an existing user
@router.post("/login")
def login_user(data: LoginRequest):
    email = str(data.email).strip().lower()

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, full_name, email, password_hash, role, is_active
            FROM users
            WHERE email = %s
            """,
            (email,)
        )

        user = cursor.fetchone()

    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to log in. Check the database connection."
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()

    if (
        not user
        or not user["is_active"]
        or not password_hash.verify(
            data.password,
            user["password_hash"]
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    access_token = create_access_token(
        user_id=user["id"],
        role=user["role"]
    )

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"]
        }
    }
