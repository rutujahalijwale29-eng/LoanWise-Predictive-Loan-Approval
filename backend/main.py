
from pathlib import Path

import joblib
import jwt
import pandas as pd
from jwt import InvalidTokenError
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from mysql.connector import Error
from pydantic import BaseModel, Field
from typing import Literal

from backend.auth import (
    router as auth_router,
    JWT_SECRET_KEY,
    ALGORITHM,
)
from backend.database import get_db_connection
from backend.admin import router as admin_router


# --------------------------------------------------
# Application setup
# --------------------------------------------------

app = FastAPI(title="LoanWise API")

# Register routers only once
app.include_router(auth_router)
app.include_router(admin_router)

# Allow the React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5176",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Load the trained machine learning model
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "loan_model.joblib"

model = joblib.load(MODEL_PATH)


# --------------------------------------------------
# Authentication: verify login token and user
# --------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user_id(
    token: str = Depends(oauth2_scheme),
) -> int:
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
            "SELECT id, is_active FROM users WHERE id = %s",
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
# Categorical value mappings
# These must match model training preprocessing
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


# --------------------------------------------------
# Loan application input model
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
    Credit_History: float = Field(ge=0, le=1)

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
# Requires login and saves the application in MySQL
# --------------------------------------------------

@app.post("/predict")
def predict(
    application: LoanApplication,
    user_id: int = Depends(get_current_user_id),
):
    # Prepare input for the machine learning model
    input_data = pd.DataFrame([application.model_dump()])

    for col, mapping in LABEL_MAPS.items():
        value = str(input_data.at[0, col])

        if value not in mapping:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid value for {col}",
            )

        input_data[col] = input_data[col].map(mapping)

    # Match the feature order used during model training
    if hasattr(model, "feature_names_in_"):
        input_data = input_data[list(model.feature_names_in_)]

    # Generate prediction
    prediction = str(model.predict(input_data)[0])

    # Save prediction and application to MySQL
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            INSERT INTO loan_applications (
                user_id,
                Gender,
                Married,
                Dependents,
                Education,
                Self_Employed,
                ApplicantIncome,
                CoapplicantIncome,
                LoanAmount,
                Loan_Amount_Term,
                Credit_History,
                Property_Area,
                prediction
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s
            )
            """,
            (
                user_id,
                application.Gender,
                application.Married,
                application.Dependents,
                application.Education,
                application.Self_Employed,
                application.ApplicantIncome,
                application.CoapplicantIncome,
                application.LoanAmount,
                application.Loan_Amount_Term,
                int(application.Credit_History),
                application.Property_Area,
                prediction,
            ),
        )

        application_id = cursor.lastrowid
        connection.commit()

        return {
            "application_id": application_id,
            "prediction": prediction,
            "message": "Prediction generated and saved successfully",
        }

    except Error as exc:
        if connection is not None:
            connection.rollback()

        raise HTTPException(
            status_code=500,
            detail="Unable to save the prediction to the database.",
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()
