# LoanWise – Predictive Loan Approval System

LoanWise is a machine-learning project that predicts whether a loan application is likely to be approved based on applicant information. The repository includes a trained model, a Jupyter Notebook, a React frontend, and a FastAPI backend with authentication and administration endpoints.

> **Project status:** The application code is present in the repository, but the database setup must be completed and tested before the full application can be considered ready to run. The current `database/schema.sql` file is empty.

## Project Features

The repository contains code for the following functionality:

- Loan approval prediction using a trained machine-learning model
- Applicant input validation
- User registration and login endpoints
- Token-based authentication
- User application history endpoints
- Administrator endpoints for user and application management
- React-based frontend
- MySQL connection configuration
- Model loading from `loan_model.joblib`

Database-dependent features require a correctly configured MySQL database and the tables expected by the backend. Confirm that each feature works in your local environment before describing it as fully tested.

## Technologies Used

- **Language:** Python, JavaScript
- **Machine learning and data processing:** Scikit-learn, Pandas, NumPy, Joblib
- **Frontend:** React, Vite, HTML, CSS
- **Backend/API:** FastAPI, Uvicorn
- **Database:** MySQL
- **Authentication:** JWT and password hashing
- **Tools:** Jupyter Notebook, VS Code, Git, GitHub

## Project Structure

```text
LoanWise-Predictive-Loan-Approval/
├── backend/
│   ├── admin.py
│   ├── app.py
│   ├── auth.py
│   ├── database.py
│   ├── repository.py
│   └── tests/
├── database/
│   └── schema.sql
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── .env.example
├── Data.csv
├── Loan Approval Model.ipynb
├── loan_model.joblib
└── README.md
```

## Prerequisites

Install the following before running the project:

- Python 3.10 or a compatible version
- Node.js and npm
- MySQL Server

## Setup and Installation

### 1. Clone the repository

```bash
git clone https://github.com/rutujahalijwale29-eng/LoanWise-Predictive-Loan-Approval.git
cd LoanWise-Predictive-Loan-Approval
```

### 2. Create and activate a Python environment

```bash
python -m venv .venv
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

If PowerShell blocks script activation, follow your local Python environment setup guidance or activate the environment using Command Prompt:

```bat
.venv\Scripts\activate.bat
```

### 3. Install backend dependencies

With the virtual environment active, run:

```bash
python -m pip install --upgrade pip
python -m pip install fastapi "uvicorn[standard]" joblib PyJWT pandas numpy scikit-learn mysql-connector-python python-dotenv "pydantic[email]" "pwdlib[argon2]"
```

### 4. Configure environment variables

Copy `.env.example` to a local `.env` file in the project root. Set the values to match your local MySQL setup and replace the example JWT secret with a strong random secret.

Example variables:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=loanwise_db
JWT_SECRET_KEY=replace_with_a_long_random_secret
```

**Security:** Do not commit `.env`, real passwords, or secret keys to GitHub.

### 5. Configure the MySQL database

Create a MySQL database named `loanwise_db` and create the tables required by the backend.

**Important:** `database/schema.sql` is currently empty in this repository, so it does not create the required tables yet. Complete the schema based on the queries in `backend/auth.py`, `backend/repository.py`, and `backend/admin.py` before expecting registration, login, application history, or administrator features to work.

### 6. Start the FastAPI backend

Run this command from the project root. The application entry point is `backend/app.py`:

```bash
python -m uvicorn backend.app:app --reload --port 8000
```

When the server starts, open the API documentation at:

- `http://127.0.0.1:8000/docs`

The backend also defines health and model-information endpoints. Database health checks will require a working database configuration.

### 7. Start the React frontend

Open a second terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal. Keep the backend running while using frontend features that call the API.

## Testing

The repository contains backend repository tests under `backend/tests/`. After installing the dependencies and configuring the environment, run tests from the project root:

```bash
python -m pytest
```

A passing test suite does not replace testing the full application with a configured MySQL database.

## Future Improvements

- Complete and document the MySQL schema and setup process
- Test the end-to-end workflow from frontend form submission to model prediction
- Improve model evaluation and document metrics using a held-out test set
- Add detailed prediction reports
- Improve error handling and accessibility
- Deploy the application after security and configuration checks

## Author

**Rutuja Halijwale**

## Disclaimer

This project is developed for educational and demonstration purposes. Its predictions are not a substitute for a lender's formal assessment and should not be used as the sole basis for real lending or financial decisions.
