# LoanWise – Predictive Loan Approval System

## Overview
LoanWise is a machine learning-based web application that predicts loan approval outcomes using applicant information. It combines a trained machine learning model with a web interface to simplify loan prediction.

## Features
- Loan approval prediction using machine learning
- User registration and login
- Role-based access for users and administrators
- Admin dashboard
- REST API built with FastAPI
- MySQL database integration

## Technologies Used
- **Programming Language:** Python
- **Machine Learning:** Scikit-learn, Pandas, NumPy
- **Frontend:** React, JavaScript, HTML, CSS
- **Backend:** FastAPI
- **Database:** MySQL
- **Model Storage:** Joblib
- **Development Tools:** VS Code, Jupyter Notebook, Git, GitHub

## Project Structure
```text
LoanWise-Predictive-Loan-Approval/
├── backend/
│   ├── admin.py
│   ├── auth.py
│   ├── database.py
│   └── main.py
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── Data.csv
├── Loan Approval Model.ipynb
├── loan_model.joblib
└── README.md
```

## Setup and Installation

### Prerequisites
- Python
- Node.js and npm
- MySQL Server

### 1. Clone the Repository
```bash
git clone https://github.com/rutujahalijwale29-eng/LoanWise-Predictive-Loan-Approval.git
cd LoanWise-Predictive-Loan-Approval
```

### 2. Set Up the Python Environment
```bash
python -m venv .venv
```

On Windows, activate it using:
```powershell
.venv\Scripts\Activate.ps1
```

Install the Python dependencies required by your backend.

### 3. Configure MySQL
Create a database named `loanwise_db` and configure your database credentials using environment variables or a local `.env` file. Never upload credentials or secret keys to GitHub.

### 4. Run the Backend
From the project root, run:
```bash
python -m uvicorn backend.main:app --reload --port 8000
```

### 5. Run the Frontend
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Future Enhancements
- Improve model evaluation and prediction performance
- Add detailed prediction reports
- Enhance the admin dashboard
- Deploy the application online

## Author
**Rutuja Halijwale**

## Disclaimer
This project is developed for educational and demonstration purposes. Predictions should not be considered final lending or financial decisions.
