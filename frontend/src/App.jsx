
import { useState } from "react";
import "./App.css";
import AdminDashboard from "./AdminDashboard";

const API = "http://127.0.0.1:8000";

const initialLoan = {
  Gender: "Female",
  Married: "No",
  Dependents: "0",
  Education: "Graduate",
  Self_Employed: "No",
  ApplicantIncome: "15000",
  CoapplicantIncome: "2000",
  LoanAmount: "2500",
  Loan_Amount_Term: "360",
  Credit_History: "Good",
  Property_Area: "Urban",
};

function getSavedUser() {
  try {
    return JSON.parse(sessionStorage.getItem("loanwise_user") || "null");
  } catch {
    return null;
  }
}

// Accepts plain numbers and Indian comma formatting, e.g. 1,00,000.
function parseAmount(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return { valid: false, message: "Please enter the Loan Amount." };
  }

  // Accept either unformatted digits (100000) or correctly grouped
  // Indian-format numbers (1,00,000), with optional decimals.
  const validFormat =
    /^\d+(\.\d+)?$/.test(text) ||
    /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(text);

  if (!validFormat) {
    return {
      valid: false,
      message:
        "Enter a valid Loan Amount, e.g. 100000 or 1,00,000. Do not enter text.",
    };
  }

  const amount = Number(text.replace(/,/g, ""));

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      valid: false,
      message: "Loan Amount must be greater than zero.",
    };
  }

  return { valid: true, value: amount };
}

function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("loanwise_token") || ""
  );

  const [user, setUser] = useState(getSavedUser);

  const [page, setPage] = useState(() => {
    const savedToken = sessionStorage.getItem("loanwise_token");
    const savedUser = getSavedUser();

    if (!savedToken) return "home";
    return savedUser?.role === "admin" ? "admin" : "predict";
  });

  const [authForm, setAuthForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  const [loan, setLoan] = useState(initialLoan);
  const [result, setResult] = useState("");
  const [applicationId, setApplicationId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setLoading] = useState(false);

  function goTo(nextPage) {
    setMessage("");
    setMessageType("error");
    setPage(nextPage);
  }

  function updateAuth(event) {
    setAuthForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  function updateLoan(event) {
    setLoan((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  // Registration and login
  async function handleAuth(event) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setMessageType("error");

    const isRegister = page === "register";

    try {
      const response = await fetch(
        `${API}/auth/${isRegister ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isRegister
              ? authForm
              : {
                  email: authForm.email,
                  password: authForm.password,
                }
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail || data)
        );
      }

      if (isRegister) {
        setAuthForm({
          full_name: "",
          email: authForm.email,
          password: "",
        });

        setMessageType("success");
        setMessage("Registration successful. Please log in.");
        setPage("login");
      } else {
        if (!data.access_token || !data.user) {
          throw new Error("Login response did not contain a token and user.");
        }

        sessionStorage.setItem("loanwise_token", data.access_token);
        sessionStorage.setItem("loanwise_user", JSON.stringify(data.user));

        setToken(data.access_token);
        setUser(data.user);
        setResult("");
        setApplicationId(null);
        setMessage("");
        setPage(data.user.role === "admin" ? "admin" : "predict");
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to connect to LoanWise.");
    } finally {
      setLoading(false);
    }
  }

  // Loan prediction
  async function handlePrediction(event) {
    event.preventDefault();

    const savedToken = sessionStorage.getItem("loanwise_token");

    if (!savedToken) {
      setToken("");
      setUser(null);
      setResult("");
      setApplicationId(null);
      setMessageType("error");
      setMessage("Please log in before submitting a loan application.");
      setPage("login");
      return;
    }

    // Validate Loan Amount before making an API request.
    const parsedLoanAmount = parseAmount(loan.LoanAmount);

    if (!parsedLoanAmount.valid) {
      setMessageType("error");
      setMessage(parsedLoanAmount.message);
      setResult("");
      setApplicationId(null);
      return;
    }

    // Validate the other numeric fields as well.
    const applicantIncome = Number(loan.ApplicantIncome);
    const coapplicantIncome = Number(loan.CoapplicantIncome);
    const loanTerm = Number(loan.Loan_Amount_Term);

    if (
      loan.ApplicantIncome.trim() === "" ||
      !Number.isFinite(applicantIncome) ||
      applicantIncome < 0
    ) {
      setMessageType("error");
      setMessage("Applicant Income must be a valid non-negative number.");
      return;
    }

    if (
      loan.CoapplicantIncome.trim() === "" ||
      !Number.isFinite(coapplicantIncome) ||
      coapplicantIncome < 0
    ) {
      setMessageType("error");
      setMessage("Co-applicant Income must be a valid non-negative number.");
      return;
    }

    if (
      loan.Loan_Amount_Term.trim() === "" ||
      !Number.isFinite(loanTerm) ||
      loanTerm <= 0
    ) {
      setMessageType("error");
      setMessage("Loan Term must be a number greater than zero.");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("error");
    setResult("");
    setApplicationId(null);

    const payload = {
      ...loan,
      ApplicantIncome: applicantIncome,
      CoapplicantIncome: coapplicantIncome,
      LoanAmount: parsedLoanAmount.value,
      Loan_Amount_Term: loanTerm,
    };

    try {
      const response = await fetch(`${API}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${savedToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 401) {
        sessionStorage.removeItem("loanwise_token");
        sessionStorage.removeItem("loanwise_user");

        setToken("");
        setUser(null);
        setResult("");
        setApplicationId(null);
        setPage("login");

        throw new Error("Your session expired. Please log in again.");
      }

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail ?? data)
        );
      }

      const rawPrediction = data.prediction;

      if (rawPrediction === undefined || rawPrediction === null) {
        throw new Error(
          `The API response has no prediction field: ${JSON.stringify(data)}`
        );
      }

      const raw = String(rawPrediction).trim().toUpperCase();
      let normalizedPrediction;

      if (["1", "Y", "YES", "APPROVED", "APPROVE"].includes(raw)) {
        normalizedPrediction = "Y";
      } else if (
        ["0", "N", "NO", "REJECTED", "REJECT", "DENIED"].includes(raw)
      ) {
        normalizedPrediction = "N";
      } else {
        throw new Error(
          `Unexpected prediction value: ${JSON.stringify(data)}`
        );
      }

      setResult(normalizedPrediction);
      setApplicationId(data.application_id ?? null);
      setMessageType("success");
      setMessage(
        data.application_id !== undefined && data.application_id !== null
          ? `Prediction saved successfully. Application ID: ${data.application_id}`
          : "Prediction generated successfully."
      );
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Prediction failed.");
    } finally {
      setLoading(false);
    }
  }

  // Logout
  function logout() {
    sessionStorage.removeItem("loanwise_token");
    sessionStorage.removeItem("loanwise_user");

    setToken("");
    setUser(null);
    setResult("");
    setApplicationId(null);
    setMessage("");
    setMessageType("error");
    setPage("home");
  }

  const selectFields = [
    ["Gender", "Gender", ["Female", "Male"]],
    ["Married", "Marital Status", ["No", "Yes"]],
    ["Dependents", "Dependents", ["0", "1", "2", "3+"]],
    ["Education", "Education", ["Graduate", "Not Graduate"]],
    ["Self_Employed", "Self Employed", ["No", "Yes"]],
    ["Credit_History", "Credit History", ["Good", "Bad"]],
    ["Property_Area", "Property Area", ["Rural", "Semiurban", "Urban"]],
  ];

  const numberFields = [
    ["ApplicantIncome", "Applicant Income", 0],
    ["CoapplicantIncome", "Co-applicant Income", 0],
    ["LoanAmount", "Loan Amount (dataset units)", 0.01],
    ["Loan_Amount_Term", "Loan Term (months)", 0.01],
  ];

  if (page === "admin" && token && user?.role === "admin") {
    return (
      <AdminDashboard
        user={user}
        token={token}
        onLogout={logout}
        onGoToPrediction={() => goTo("predict")}
      />
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();

            if (!token) goTo("home");
            else if (user?.role === "admin") goTo("admin");
            else goTo("predict");
          }}
        >
          <span className="brand-icon">L</span>
          LoanWise
        </a>

        <nav className="app-navigation">
          {token ? (
            <>
              <span className="topbar-note">{user?.full_name || "User"}</span>
              <button type="button" className="nav-button" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <button type="button" className="nav-button" onClick={() => goTo("login")}>
                Login
              </button>
              <button
                type="button"
                className="nav-button primary-nav"
                onClick={() => goTo("register")}
              >
                Register
              </button>
            </>
          )}
        </nav>
      </header>

      {page === "home" && (
        <section className="hero">
          <p className="eyebrow">PREDICTIVE LOAN APPROVAL SYSTEM</p>
          <h1>Make sense of your loan prediction.</h1>
          <p className="hero-text">
            Enter applicant details and explore a possible loan outcome using
            machine learning.
          </p>
          <button
            type="button"
            className="predict-button"
            style={{ maxWidth: 240 }}
            onClick={() => goTo(token ? "predict" : "register")}
          >
            Get Started
          </button>
        </section>
      )}

      {(page === "login" || page === "register") && (
        <section className="content auth-content">
          <form className="form-card" onSubmit={handleAuth}>
            <div className="section-heading">
              <div>
                <h2>{page === "register" ? "Create your account" : "Welcome back"}</h2>
                <p>
                  {page === "register"
                    ? "Register to start using LoanWise."
                    : "Log in to continue to LoanWise."}
                </p>
              </div>
            </div>

            {page === "register" && (
              <div className="field auth-field">
                <label htmlFor="full_name">Full Name</label>
                <input
                  id="full_name"
                  name="full_name"
                  value={authForm.full_name}
                  onChange={updateAuth}
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
            )}

            <div className="field auth-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={authForm.email}
                onChange={updateAuth}
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={authForm.password}
                onChange={updateAuth}
                autoComplete={page === "register" ? "new-password" : "current-password"}
                minLength={page === "register" ? 8 : undefined}
                maxLength={128}
                required
              />
            </div>

            <button type="submit" className="predict-button" disabled={loading}>
              {loading
                ? "Please wait..."
                : page === "register"
                ? "Create Account"
                : "Login"}
            </button>

            {message && (
              <div className={`message ${messageType}`} role={messageType === "error" ? "alert" : "status"}>
                {message}
              </div>
            )}

            <p className="privacy-note">
              {page === "register" ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => goTo(page === "register" ? "login" : "register")}
              >
                {page === "register" ? "Login" : "Register"}
              </button>
            </p>
          </form>
        </section>
      )}

      {page === "predict" && token && (
        <>
          <section className="hero">
            <p className="eyebrow">LOAN ASSESSMENT</p>
            <h1>Loan prediction</h1>
            <p className="hero-text">
              Enter the applicant's information to generate a prediction.
            </p>
          </section>

          <section className="content">
            <form className="form-card" onSubmit={handlePrediction}>
              <div className="section-heading">
                <div>
                  <h2>Applicant details</h2>
                  <p>Complete all required fields.</p>
                </div>
                <span className="step-label">11 FEATURES</span>
              </div>

              <div className="form-grid">
                {selectFields.map(([name, label, options]) => (
                  <div className="field" key={name}>
                    <label htmlFor={name}>{label}</label>
                    <select
                      id={name}
                      name={name}
                      value={loan[name]}
                      onChange={updateLoan}
                      required
                    >
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                {numberFields.map(([name, label, min]) => (
                  <div className="field" key={name}>
                    <label htmlFor={name}>{label}</label>
                    {name === "LoanAmount" ? (
                      <input
                        id={name}
                        name={name}
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 1,00,000"
                        value={loan[name]}
                        onChange={updateLoan}
                        required
                      />
                    ) : (
                      <input
                        id={name}
                        name={name}
                        type="number"
                        min={min}
                        step="any"
                        value={loan[name]}
                        onChange={updateLoan}
                        required
                      />
                    )}
                  </div>
                ))}
              </div>

              <button type="submit" className="predict-button" disabled={loading}>
                {loading ? "Analyzing..." : "Predict Loan"}
              </button>

              <p className="privacy-note">
                This prediction is an estimate, not a bank's final decision.
              </p>

              {message && (
                <div className={`message ${messageType}`} role={messageType === "error" ? "alert" : "status"}>
                  {message}
                </div>
              )}

              {result && (
                <div
                  className={`message ${result === "Y" ? "success" : "rejected"}`}
                  role="status"
                >
                  <span className="result-label">PREDICTION RESULT</span>
                  <h2>
                    {result === "Y"
                      ? "Likely to be approved"
                      : "Likely to be rejected"}
                  </h2>
                  <p>
                    {result === "Y"
                      ? "The model predicts a positive outcome."
                      : "The model predicts a negative outcome."}
                  </p>
                  {applicationId !== null && <p>Application ID: {applicationId}</p>}
                </div>
              )}
            </form>

            <aside className="info-card">
              <div className="info-icon">✓</div>
              <h3>About LoanWise</h3>
              <p>
                LoanWise uses a trained machine-learning model to estimate a
                possible loan outcome from the details provided.
              </p>
              <div className="info-divider" />
              <h3>Important note</h3>
              <p>
                A prediction is not a guarantee of approval or rejection. The
                bank makes the final decision after its own checks.
              </p>
            </aside>
          </section>
        </>
      )}

      <footer className="footer">
        LoanWise · Predictive Loan Approval System
      </footer>
    </main>
  );
}

export default App;
