
from pathlib import Path
from typing import Literal

import joblib
import jwt
import pandas as pd

from jwt import InvalidTokenError
from mysql.connector import Error

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from pydantic import BaseModel, Field

from backend.auth import (
    router as auth_router,
    JWT_SECRET_KEY,
    ALGORITHM,
)
from backend.database import get_db_connection
from backend.admin import router as admin_router
from backend.repository import ApplicationRepository


# --------------------------------------------------
# Application setup
# --------------------------------------------------

app = FastAPI(title="LoanWise API")

app.include_router(auth_router)
app.include_router(admin_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{port}"
        for port in range(5173, 5177)
    ] + [
        f"http://127.0.0.1:{port}"
        for port in range(5173, 5177)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Load trained machine learning model
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "loan_model.joblib"

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Trained model not found at: {MODEL_PATH}"
    )

model = joblib.load(MODEL_PATH)


# --------------------------------------------------
# Authentication
# --------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user_id(
    token: str = Depends(oauth2_scheme),
) -> int:
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="JWT secret is not configured.",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        user_id = int(payload["sub"])

    except (
        InvalidTokenError,
        KeyError,
        TypeError,
        ValueError,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, is_active
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )

        user = cursor.fetchone()

        if not user or not user["is_active"]:
            raise HTTPException(
                status_code=401,
                detail="User account is inactive or does not exist.",
            )

        return int(user["id"])

    except HTTPException:
        raise

    except Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to verify the logged-in user.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


# --------------------------------------------------
# Categorical mappings
# --------------------------------------------------

LABEL_MAPS = {
    "Gender": {"Female": 0, "Male": 1},
    "Married": {"No": 0, "Yes": 1},
    "Dependents": {"0": 0, "1": 1, "2": 2, "3+": 3},
    "Education": {"Graduate": 0, "Not Graduate": 1},
    "Self_Employed": {"No": 0, "Yes": 1},
    "Property_Area": {"Rural": 0, "Semiurban": 1, "Urban": 2},
}

CREDIT_HISTORY_MAP = {"Bad": 0, "Good": 1}


# --------------------------------------------------
# Loan application input validation
# --------------------------------------------------

class LoanApplication(BaseModel):
    Gender: Literal["Female", "Male"]
    Married: Literal["No", "Yes"]
    Dependents: Literal["0", "1", "2", "3+"]
    Education: Literal["Graduate", "Not Graduate"]
    Self_Employed: Literal["No", "Yes"]

    ApplicantIncome: float = Field(ge=0)
    CoapplicantIncome: float = Field(ge=0)
    LoanAmount: float = Field(gt=0)
    Loan_Amount_Term: float = Field(gt=0)

    Credit_History: Literal["Good", "Bad"]
    Property_Area: Literal["Rural", "Semiurban", "Urban"]


# --------------------------------------------------
# Helpers for application history
# --------------------------------------------------

def format_application_record(record: dict) -> dict:
    """Convert database values to JSON-friendly display values."""
    record = dict(record)

    credit_history = record.get("Credit_History")
    if credit_history is not None:
        record["Credit_History"] = (
            "Good" if int(credit_history) == 1 else "Bad"
        )

    # Convert datetime/date values to ISO strings for JSON.
    for key, value in record.items():
        if hasattr(value, "isoformat"):
            record[key] = value.isoformat()

    return record


def get_owned_application(application_id: int, user_id: int) -> dict:
    """Return a record only when it belongs to the current user."""
    repository = ApplicationRepository()
    record = repository.get_application(application_id)

    if record is None or int(record["user_id"]) != user_id:
        raise HTTPException(
            status_code=404,
            detail="Application not found.",
        )

    return format_application_record(record)


# --------------------------------------------------
# Home endpoint
# --------------------------------------------------

@app.get("/")
def home():
    return {"message": "Welcome to LoanWise API!"}


# --------------------------------------------------
# Backend health check
# --------------------------------------------------

@app.get("/health")
def health():
    return {"status": "healthy"}


# --------------------------------------------------
# Database health check
# --------------------------------------------------

@app.get("/db-health")
def db_health():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT DATABASE()")
        database_name = cursor.fetchone()[0]

        return {
            "status": "connected",
            "database": database_name,
        }

    except Error as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Database connection failed. "
                "Check the MySQL service and .env settings."
            ),
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()


# --------------------------------------------------
# Model information endpoint
# --------------------------------------------------

@app.get("/model-info")
def model_info():
    return {
        "model_type": type(model).__name__,
        "feature_count": len(model.feature_names_in_)
        if hasattr(model, "feature_names_in_")
        else None,
        "features": list(model.feature_names_in_)
        if hasattr(model, "feature_names_in_")
        else None,
    }


# --------------------------------------------------
# Loan prediction endpoint
# --------------------------------------------------

@app.post("/predict")
def predict(
    application: LoanApplication,
    user_id: int = Depends(get_current_user_id),
):
    application_data = application.model_dump()
    input_data = pd.DataFrame([application_data])

    for column, mapping in LABEL_MAPS.items():
        value = str(input_data.at[0, column])

        if value not in mapping:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid value for {column}: {value}",
            )

        input_data[column] = input_data[column].map(mapping)

    input_data["Credit_History"] = input_data[
        "Credit_History"
    ].map(CREDIT_HISTORY_MAP)

    if hasattr(model, "feature_names_in_"):
        expected_features = list(model.feature_names_in_)
        missing_features = [
            feature
            for feature in expected_features
            if feature not in input_data.columns
        ]

        if missing_features:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Model feature configuration mismatch: "
                    + ", ".join(missing_features)
                ),
            )

        input_data = input_data[expected_features]

    try:
        prediction_value = model.predict(input_data)[0]
        prediction = str(int(prediction_value))

    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Unable to generate a prediction for the supplied data.",
        ) from exc

    try:
        repository = ApplicationRepository()
        application_id = repository.create_application(
            user_id=user_id,
            application=application_data,
            prediction=prediction,
        )

    except Exception as exc:
        print(f"Failed to save prediction: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to save the prediction to the database.",
        ) from exc

    return {
        "application_id": application_id,
        "prediction": prediction,
        "message": "Prediction generated and saved successfully",
    }


# --------------------------------------------------
# Application history
# Supports keyword search, status filter and pagination
# --------------------------------------------------

@app.get("/applications")
def get_applications(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=100),
    status: Literal["", "0", "1"] = Query(""),
    user_id: int = Depends(get_current_user_id),
):
    repository = ApplicationRepository()

    try:
        result = repository.get_user_history(
            user_id=user_id,
            page=page,
            page_size=page_size,
            search=search,
            status=status,
        )

        result["applications"] = [
            format_application_record(record)
            for record in result["applications"]
        ]

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve application history.",
        ) from exc


# --------------------------------------------------
# Detailed view of a single application
# Only the owning user can view the record
# --------------------------------------------------

@app.get("/applications/{application_id}")
def get_application_details(
    application_id: int,
    user_id: int = Depends(get_current_user_id),
):
    try:
        return get_owned_application(application_id, user_id)

    except HTTPException:
        raise

    except Error as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve application details.",
        ) from exc
