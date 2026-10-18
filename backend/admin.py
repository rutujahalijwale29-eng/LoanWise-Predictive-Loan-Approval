
from pathlib import Path
import os

import jwt
import mysql.connector
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.database import get_db_connection


# Load settings
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"

router = APIRouter(prefix="/admin", tags=["Admin"])
security = HTTPBearer()


# Only logged-in, active administrators can use these routes
def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="JWT secret is not configured.",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        user_id = int(payload["sub"])

    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired login token.",
        ) from exc

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, full_name, email, role, is_active
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )

        user = cursor.fetchone()

    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to verify administrator account.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()

    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or no longer exists.",
        )

    if user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )

    return user


# Dashboard summary statistics
@router.get("/stats")
def dashboard_stats(admin=Depends(require_admin)):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("SELECT COUNT(*) AS total_users FROM users")
        user_stats = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_applications,
                COALESCE(SUM(prediction = 'Y'), 0)
                    AS predicted_approved,
                COALESCE(SUM(prediction = 'N'), 0)
                    AS predicted_rejected
            FROM loan_applications
            """
        )
        application_stats = cursor.fetchone()

        return {
            "total_users": int(user_stats["total_users"]),
            "total_applications": int(
                application_stats["total_applications"]
            ),
            "predicted_approved": int(
                application_stats["predicted_approved"]
            ),
            "predicted_rejected": int(
                application_stats["predicted_rejected"]
            ),
        }

    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to load dashboard statistics.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


# Registered users
@router.get("/users")
def list_users(
    limit: int = Query(default=50, ge=1, le=100),
    admin=Depends(require_admin),
):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, full_name, email, role, is_active, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )

        return {"users": cursor.fetchall()}

    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to load registered users.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


# Recent loan applications
@router.get("/applications")
def list_applications(
    limit: int = Query(default=50, ge=1, le=100),
    admin=Depends(require_admin),
):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                a.id,
                a.user_id,
                COALESCE(u.full_name, 'Unknown user') AS applicant_name,
                a.ApplicantIncome,
                a.LoanAmount,
                a.prediction,
                a.created_at
            FROM loan_applications a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT %s
            """,
            (limit,),
        )

        return {"applications": cursor.fetchall()}

    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to load loan applications.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()
