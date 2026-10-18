
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mysql.connector import Error
from pydantic import BaseModel, Field

from backend.auth import router as auth_router
from backend.database import get_db_connection
from backend.admin import router as admin_router


# --------------------------------------------------
# Application setup
# --------------------------------------------------

app = FastAPI(title="LoanWise API")
app.include_router(auth_router)
app.include_router(admin_router)

# Allow the React frontend to communicate with FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# Register authentication endpoints
app.include_router(auth_router)


# --------------------------------------------------
# Load the trained machine learning model
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "loan_model.joblib"

model = joblib.load(MODEL_PATH)


# --------------------------------------------------
# Categorical value mappings
# These must match the model's training preprocessing
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
    Gender: str
    Married: str
    Dependents: str
    Education: str
    Self_Employed: str

    ApplicantIncome: float = Field(ge=0)
    CoapplicantIncome: float = Field(ge=0)
    LoanAmount: float = Field(gt=0)
    Loan_Amount_Term: float = Field(gt=0)
    Credit_History: float = Field(ge=0, le=1)

    Property_Area: str


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
# --------------------------------------------------

@app.post("/predict")
def predict(application: LoanApplication):
    input_data = pd.DataFrame(
        [application.model_dump()]
    )

    # Convert categorical inputs to numbers
    for col, mapping in LABEL_MAPS.items():
        value = str(input_data.at[0, col])

        if value not in mapping:
            raise HTTPException(
                status_code=422,
                detail={
                    "field": col,
                    "invalid_value": value,
                    "allowed_values": list(mapping.keys()),
                },
            )

        input_data[col] = input_data[col].map(mapping)

    # Match the feature order used during model training
    if hasattr(model, "feature_names_in_"):
        input_data = input_data[
            list(model.feature_names_in_)
        ]

    prediction = model.predict(input_data)[0]

    return {
        "prediction": str(prediction),
        "message": "Prediction generated successfully",
    }
