
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


# --------------------------------------------------
# Load settings
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"

router = APIRouter(prefix="/admin", tags=["Admin"])
security = HTTPBearer()


# --------------------------------------------------
# Verify administrator
# --------------------------------------------------

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
            headers={"WWW-Authenticate": "Bearer"},
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


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def format_record(record: dict) -> dict:
    """Format database values for JSON responses."""
    result = dict(record)

    # Convert Credit_History from 0/1 to Bad/Good.
    credit_history = result.get("Credit_History")

    if credit_history is not None:
        try:
            result["Credit_History"] = (
                "Good" if int(credit_history) == 1 else "Bad"
            )
        except (TypeError, ValueError):
            pass

    # Normalize prediction value.
    prediction = str(result.get("prediction") or "").strip().upper()

    # Provide an explanation if an older record has none.
    explanation = result.get("prediction_explanation")

    if not explanation or not str(explanation).strip():
        if prediction == "Y":
            explanation = (
                "The model predicted that the loan was likely to be "
                "approved. The original explanation was not saved."
            )
        elif prediction == "N":
            explanation = (
                "The model predicted that the loan was likely to be "
                "rejected. The original explanation was not saved."
            )
        else:
            explanation = (
                "This application has no completed prediction, "
                "so a prediction explanation is unavailable."
            )

    result["prediction_explanation"] = explanation

    # Convert dates and other ISO-compatible values for JSON responses.
    for key, value in result.items():
        if hasattr(value, "isoformat"):
            result[key] = value.isoformat()

    return result


def get_admin_connection():
    """Open a database connection or return a clear server error."""
    try:
        return get_db_connection()
    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to connect to the database.",
        ) from exc


# --------------------------------------------------
# Dashboard statistics
# GET /admin/stats
# --------------------------------------------------

@router.get("/stats")
def dashboard_stats(admin=Depends(require_admin)):
    connection = None
    cursor = None

    try:
        connection = get_admin_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT COUNT(*) AS total_users FROM users"
        )
        user_stats = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_applications,
                COALESCE(SUM(prediction = 'Y'), 0)
                    AS predicted_approved,
                COALESCE(SUM(prediction = 'N'), 0)
                    AS predicted_rejected,
                COALESCE(
                    SUM(prediction IS NULL OR TRIM(prediction) = ''),
                    0
                ) AS pending_applications
            FROM loan_applications
            """
        )

        app_stats = cursor.fetchone()

        return {
            "total_users": int(user_stats["total_users"]),
            "total_applications": int(app_stats["total_applications"]),
            "predicted_approved": int(app_stats["predicted_approved"]),
            "predicted_rejected": int(app_stats["predicted_rejected"]),
            "pending_applications": int(app_stats["pending_applications"]),
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


# --------------------------------------------------
# Registered users
# GET /admin/users
# --------------------------------------------------

@router.get("/users")
def list_users(
    limit: int = Query(default=50, ge=1, le=100),
    admin=Depends(require_admin),
):
    connection = None
    cursor = None

    try:
        connection = get_admin_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, full_name, email, role, is_active
            FROM users
            ORDER BY id DESC
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


# --------------------------------------------------
# All loan applications
# GET /admin/applications
# Supports search, outcome filter, and pagination.
# --------------------------------------------------

@router.get("/applications")
def list_applications(
    limit: int = Query(default=50, ge=1, le=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str = Query(default="", max_length=100),
    outcome: str = Query(default="all"),
    admin=Depends(require_admin),
):
    connection = None
    cursor = None

    outcome = outcome.strip().lower()

    if outcome not in {"all", "approved", "rejected", "pending"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Outcome must be all, approved, rejected, or pending.",
        )

    try:
        connection = get_admin_connection()
        cursor = connection.cursor(dictionary=True)

        conditions = []
        params = []

        if search.strip():
            keyword = f"%{search.strip()}%"

            conditions.append(
                """
                (
                    CAST(a.id AS CHAR) LIKE %s
                    OR CAST(a.user_id AS CHAR) LIKE %s
                    OR u.full_name LIKE %s
                    OR u.email LIKE %s
                    OR CAST(a.ApplicantIncome AS CHAR) LIKE %s
                    OR CAST(a.LoanAmount AS CHAR) LIKE %s
                    OR a.prediction LIKE %s
                )
                """
            )

            params.extend([keyword] * 7)

        if outcome == "approved":
            conditions.append("a.prediction = 'Y'")

        elif outcome == "rejected":
            conditions.append("a.prediction = 'N'")

        elif outcome == "pending":
            conditions.append(
                "(a.prediction IS NULL OR TRIM(a.prediction) = '')"
            )

        where_sql = (
            "WHERE " + " AND ".join(conditions)
            if conditions
            else ""
        )

        # Count matching applications for pagination.
        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM loan_applications AS a
            LEFT JOIN users AS u ON a.user_id = u.id
            {where_sql}
            """,
            tuple(params),
        )

        total = int(cursor.fetchone()["total"])

        offset = (page - 1) * page_size

        # Retrieve the current page of applications.
        cursor.execute(
            f"""
            SELECT
                a.id,
                a.user_id,
                COALESCE(u.full_name, 'Unknown user')
                    AS applicant_name,
                u.email AS applicant_email,
                a.ApplicantIncome,
                a.LoanAmount,
                a.prediction,
                a.prediction_explanation,
                a.created_at
            FROM loan_applications AS a
            LEFT JOIN users AS u ON a.user_id = u.id
            {where_sql}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [page_size, offset]),
        )

        applications = [
            format_record(row) for row in cursor.fetchall()
        ]

        return {
            "applications": applications,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (
                (total + page_size - 1) // page_size
            ),
        }

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


# --------------------------------------------------
# Detailed application view
# GET /admin/applications/{application_id}
# --------------------------------------------------

@router.get("/applications/{application_id}")
def get_application_details(
    application_id: int,
    admin=Depends(require_admin),
):
    connection = None
    cursor = None

    try:
        connection = get_admin_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                a.*,
                COALESCE(u.full_name, 'Unknown user')
                    AS applicant_name,
                u.email AS applicant_email
            FROM loan_applications AS a
            LEFT JOIN users AS u ON a.user_id = u.id
            WHERE a.id = %s
            """,
            (application_id,),
        )

        record = cursor.fetchone()

        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application not found.",
            )

        return format_record(record)

    except HTTPException:
        raise

    except mysql.connector.Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve application details.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()
