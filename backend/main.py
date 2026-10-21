
from pathlib import Path
from typing import Literal

import joblib
import jwt
import pandas as pd

from jwt import InvalidTokenError
from mysql.connector import Error

from fastapi import FastAPI, HTTPException, Depends
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
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
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
# Must match the model's training preprocessing
# --------------------------------------------------

LABEL_MAPS = {
    "Gender": {
        "Female": 0,
        "Male": 1,
    },
    "Married": {
        "No": 0,
        "Yes": 1,
    },
    "Dependents": {
        "0": 0,
        "1": 1,
        "2": 2,
        "3+": 3,
    },
    "Education": {
        "Graduate": 0,
        "Not Graduate": 1,
    },
    "Self_Employed": {
        "No": 0,
        "Yes": 1,
    },
    "Property_Area": {
        "Rural": 0,
        "Semiurban": 1,
        "Urban": 2,
    },
}

CREDIT_HISTORY_MAP = {
    "Bad": 0,
    "Good": 1,
}


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
# Home endpoint
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "Welcome to LoanWise API!"
    }


# --------------------------------------------------
# Backend health check
# --------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


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
# Each successful prediction creates a history record
# --------------------------------------------------

@app.post("/predict")
def predict(
    application: LoanApplication,
    user_id: int = Depends(get_current_user_id),
):
    # Preserve the original validated values for database storage
    application_data = application.model_dump()

    # Prepare model input
    input_data = pd.DataFrame([application_data])

    # Convert categorical fields
    for column, mapping in LABEL_MAPS.items():
        value = str(input_data.at[0, column])

        if value not in mapping:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid value for {column}: {value}",
            )

        input_data[column] = input_data[column].map(mapping)

    # Convert credit history
    input_data["Credit_History"] = input_data[
        "Credit_History"
    ].map(CREDIT_HISTORY_MAP)

    # Ensure all expected model features exist
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

    # Generate prediction
    try:
        prediction_value = model.predict(input_data)[0]
        prediction = str(int(prediction_value))

    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Unable to generate a prediction for the supplied data.",
        ) from exc

    # Save the application and prediction using the repository
    try:
        repository = ApplicationRepository()

        application_id = repository.create_application(
            user_id=user_id,
            application=application_data,
            prediction=prediction,
        )

    except Exception as exc:
        # Log server-side details without exposing them to the client
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
