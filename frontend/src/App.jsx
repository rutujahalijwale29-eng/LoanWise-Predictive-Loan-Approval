
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { useLoan } from "./context/LoanContext";
import "./App.css";
import AdminDashboard from "./AdminDashboard";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { loanValidationSchema } from "./loanValidation";
import { predictLoan } from "./services/loanService";

const API = "http://127.0.0.1:8000";

function getSavedUser() {
  try {
    return JSON.parse(sessionStorage.getItem("loanwise_user") || "null");
  } catch {
    return null;
  }
}

// Accept plain numbers and Indian comma formatting.
function parseAmount(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return {
      valid: false,
      message: "Please enter the Loan Amount.",
    };
  }

  const validFormat =
    /^\d+(\.\d+)?$/.test(text) ||
    /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/.test(text);

  if (!validFormat) {
    return {
      valid: false,
      message:
        "Enter a valid Loan Amount, e.g. 100000 or 1,00,000.",
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
  const navigate = useNavigate();
  const location = useLocation();

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

  const { loanForm: loan, setLoanForm: setLoan } = useLoan();

const {
  register,
  handleSubmit,
  watch,
  setError,
  formState: { errors },
} = useForm({
  mode: "onChange",
});
  
  const creditScore = watch("Credit_Score", loan.Credit_Score ?? "");

  const [result, setResult] = useState("");
  const [predictionExplanation, setPredictionExplanation] = useState("");
  const [applicationId, setApplicationId] = useState(null);
  const [submittedLoan, setSubmittedLoan] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setLoading] = useState(false);

  // Network notifications.
  useEffect(() => {
    const handleOnline = () => {
      toast.success("Network connection restored.");
    };

    const handleOffline = () => {
      toast.warning("You are offline. Check your network connection.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Synchronize routes and protect authenticated pages.
  useEffect(() => {
    const pathToPage = {
      "/": "home",
      "/login": "login",
      "/register": "register",
      "/predict": "predict",
      "/admin": "admin",
    };

    const requestedPage = pathToPage[location.pathname];

    if (!requestedPage) {
      navigate("/", { replace: true });
      return;
    }

    if (requestedPage === "predict" && (!token || !user)) {
      setPage("login");
      navigate("/login", { replace: true });
      return;
    }

    if (
      requestedPage === "admin" &&
      (!token || !user || user.role !== "admin")
    ) {
      if (!token || !user) {
        setPage("login");
        navigate("/login", { replace: true });
      } else {
        setPage("predict");
        navigate("/predict", { replace: true });
      }
      return;
    }

    setPage(requestedPage);
  }, [location.pathname, navigate, token, user]);

  function goTo(nextPage) {
    setMessage("");
    setMessageType("error");

    const routes = {
      home: "/",
      login: "/login",
      register: "/register",
      predict: "/predict",
      admin: "/admin",
    };

    setPage(nextPage);
    navigate(routes[nextPage] || "/");
  }

  function updateAuth(event) {
    setAuthForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  function updateLoan(event) {
    const { name, value, type } = event.target;

    setLoan((previous) => ({
      ...previous,
      [name]:
        type === "number" && value !== ""
          ? Number(value)
          : value,
    }));
  }

  // Login and registration.
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
          headers: {
            "Content-Type": "application/json",
          },
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

        toast.success("Registration successful! Please log in.");
        goTo("login");
      } else {
        if (!data.access_token || !data.user) {
          throw new Error(
            "Login response did not contain a token and user."
          );
        }

        sessionStorage.setItem("loanwise_token", data.access_token);
        sessionStorage.setItem(
          "loanwise_user",
          JSON.stringify(data.user)
        );

        setToken(data.access_token);
        setUser(data.user);
        setResult("");
        setPredictionExplanation("");
        setApplicationId(null);
        setSubmittedLoan(null);
        setMessage("");

        const destination =
          data.user.role === "admin" ? "admin" : "predict";

        setPage(destination);
        navigate(destination === "admin" ? "/admin" : "/predict");

        toast.success(
          `Welcome to LoanWise, ${data.user.full_name || "User"}!`
        );
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to connect to LoanWise.");
      toast.error(error.message || "Unable to connect to LoanWise.");
    } finally {
      setLoading(false);
    }
  }

  // Submit a loan prediction.
  async function handlePrediction(validatedLoan) {
    const savedToken = sessionStorage.getItem("loanwise_token");

    if (!savedToken) {
      setToken("");
      setUser(null);
      setResult("");
      setPredictionExplanation("");
      setApplicationId(null);
      setSubmittedLoan(null);
      setMessageType("error");
      setMessage("Please log in before submitting a loan application.");
      goTo("login");
      return;
    }

    const parsedLoanAmount = parseAmount(validatedLoan.LoanAmount);

    if (!parsedLoanAmount.valid) {
      setMessageType("error");
      setMessage(parsedLoanAmount.message);
      toast.error(parsedLoanAmount.message);
      setResult("");
      setPredictionExplanation("");
      setApplicationId(null);
      setSubmittedLoan(null);
      return;
    }

    // Validate the new numeric score.
    const score = Number(validatedLoan.Credit_Score);

    if (
      validatedLoan.Credit_Score === "" ||
      validatedLoan.Credit_Score === undefined ||
      !Number.isInteger(score) ||
      score < 300 ||
      score > 900
    ) {
      const errorMessage =
        "Enter a whole-number credit score between 300 and 900.";
      setError("Credit_Score", {
  type: "manual",
  message: errorMessage,
});
return;

      setMessageType("error");
      setMessage(errorMessage);
      toast.error(errorMessage);
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("error");
    setResult("");
    setPredictionExplanation("");
    setApplicationId(null);
    setSubmittedLoan(null);

    const payload = {
      ...loan,
      ...validatedLoan,
      ApplicantIncome: Number(validatedLoan.ApplicantIncome),
      CoapplicantIncome: Number(validatedLoan.CoapplicantIncome),
      LoanAmount: parsedLoanAmount.value,
      Loan_Amount_Term: Number(validatedLoan.Loan_Amount_Term),
      Credit_Score: score,
    };

    try {
      const data = await predictLoan(payload, savedToken);
      const rawPrediction = data.prediction;

      if (rawPrediction === undefined || rawPrediction === null) {
        throw new Error(
          "The API response does not contain a prediction."
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
        throw new Error(`Unexpected prediction value: ${raw}`);
      }

      setResult(normalizedPrediction);

      setPredictionExplanation(
        typeof data.prediction_explanation === "string" &&
          data.prediction_explanation.trim()
          ? data.prediction_explanation
          : normalizedPrediction === "Y"
            ? "The model predicts that the loan is likely to be approved."
            : "The model predicts that the loan is likely to be rejected."
      );

      setApplicationId(data.application_id ?? null);
      setSubmittedLoan({ ...payload });

      const successMessage =
        data.application_id !== undefined &&
        data.application_id !== null
          ? `Prediction saved successfully. Application ID: ${data.application_id}`
          : "Prediction generated successfully.";

      setMessageType("success");
      setMessage(successMessage);
      toast.success(successMessage);
    } catch (error) {
      setMessageType("error");
      setResult("");
      setPredictionExplanation("");
      setApplicationId(null);
      setSubmittedLoan(null);

      if (error.message === "SESSION_EXPIRED") {
        sessionStorage.removeItem("loanwise_token");
        sessionStorage.removeItem("loanwise_user");

        setToken("");
        setUser(null);
        setMessage("Your session expired. Please log in again.");
        toast.error("Your session expired. Please log in again.");
        goTo("login");
      } else {
        setMessage(
          error.message || "Prediction failed. Please try again."
        );
        toast.error(
          error.message || "Prediction failed. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // Logout.
  function logout() {
    sessionStorage.removeItem("loanwise_token");
    sessionStorage.removeItem("loanwise_user");

    setToken("");
    setUser(null);
    setResult("");
    setPredictionExplanation("");
    setApplicationId(null);
    setSubmittedLoan(null);
    setMessage("");
    setMessageType("error");
    setPage("home");
    navigate("/");

    toast.info("You have been logged out.");
  }

  const selectFields = [
    ["Gender", "Gender", ["Female", "Male"]],
    ["Married", "Marital Status", ["No", "Yes"]],
    ["Dependents", "Dependents", ["0", "1", "2", "3+"]],
    ["Education", "Education", ["Graduate", "Not Graduate"]],
    ["Self_Employed", "Self Employed", ["No", "Yes"]],
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
          href="/"
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
              <span className="topbar-note">
                {user?.full_name || "User"}
              </span>

              <button
                type="button"
                className="nav-button"
                onClick={logout}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="nav-button"
                onClick={() => goTo("login")}
              >
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
                <h2>
                  {page === "register"
                    ? "Create your account"
                    : "Welcome back"}
                </h2>

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
                autoComplete={
                  page === "register" ? "new-password" : "current-password"
                }
                minLength={page === "register" ? 8 : undefined}
                maxLength={128}
                required
              />
            </div>

            <button
              type="submit"
              className="predict-button"
              disabled={loading}
            >
              {loading
                ? "Please wait..."
                : page === "register"
                  ? "Create Account"
                  : "Login"}
            </button>

            {message && (
              <div
                className={`message ${messageType}`}
                role={messageType === "error" ? "alert" : "status"}
              >
                {message}
              </div>
            )}

            <p className="privacy-note">
              {page === "register"
                ? "Already have an account?"
                : "Don't have an account?"}{" "}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  goTo(page === "register" ? "login" : "register")
                }
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
            <form
              className="form-card"
              noValidate
              onSubmit={handleSubmit(handlePrediction)}
            >
              <div className="section-heading">
                <div>
                  <h2>Applicant details</h2>
                  <p>Complete all required fields.</p>
                </div>

                <span className="step-label">12 FIELDS</span>
              </div>

              <div className="form-grid">
                {selectFields.map(([name, label, options]) => {
                  const fieldRegistration = register(name);

                  return (
                    <div className="field" key={name}>
                      <label htmlFor={name}>{label}</label>

                      <select
                        id={name}
                        {...fieldRegistration}
                        value={loan[name] ?? ""}
                        onChange={(event) => {
                          fieldRegistration.onChange(event);
                          updateLoan(event);
                        }}
                        aria-invalid={Boolean(errors[name])}
                      >
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>

                      {errors[name] && (
                        <p className="field-error" role="alert">
                          {errors[name].message}
                        </p>
                      )}
                    </div>
                  );
                })}

{/* Separate numeric credit score field. */}
<div className="field">
  <label htmlFor="Credit_Score">
    Credit Score (300–900)
  </label>

  <input
    id="Credit_Score"
    type="number"
    min={300}
    max={900}
    step={1}
    placeholder="Enter credit score"
    {...register("Credit_Score", {
      required: "Credit score is required",
      valueAsNumber: true,
      validate: (value) => {
        if (!Number.isFinite(value)) {
          return "Please enter a valid credit score.";
        }

        if (!Number.isInteger(value)) {
          return "Credit score must be a whole number.";
        }

        if (value < 300 || value > 900) {
          return "Credit score must be between 300 and 900.";
        }

        return true;
      },
    })}
    value={creditScore ?? ""}
    onChange={(event) => {
      register("Credit_Score").onChange(event);
      updateLoan(event);
      void trigger("Credit_Score");
    }}
    aria-invalid={Boolean(errors.Credit_Score)}
    aria-describedby={
      errors.Credit_Score ? "credit-score-error" : undefined
    }
  />

  {errors.Credit_Score && (
    <p
      id="credit-score-error"
      className="field-error"
      role="alert"
    >
      {errors.Credit_Score.message}
    </p>
  )}

  {creditScore !== "" &&
    creditScore !== undefined &&
    Number.isFinite(Number(creditScore)) &&
    Number.isInteger(Number(creditScore)) &&
    Number(creditScore) >= 300 &&
    Number(creditScore) <= 900 && (
      <p className="privacy-note">
        Credit rating:{" "}
        <strong>
          {Number(creditScore) >= 650 ? "Good" : "Bad"}
        </strong>
      </p>
    )}
</div>


                {numberFields.map(([name, label, min]) => {
                  const fieldRegistration = register(name);

                  return (
                    <div className="field" key={name}>
                      <label htmlFor={name}>{label}</label>

                      <input
                        id={name}
                        {...fieldRegistration}
                        type={name === "LoanAmount" ? "text" : "number"}
                        inputMode="decimal"
                        min={name === "LoanAmount" ? undefined : min}
                        step="any"
                        placeholder={
                          name === "LoanAmount" ? "e.g. 1,00,000" : undefined
                        }
                        value={loan[name] ?? ""}
                        onChange={(event) => {
                          fieldRegistration.onChange(event);
                          updateLoan(event);
                        }}
                        aria-invalid={Boolean(errors[name])}
                      />

                      {errors[name] && (
                        <p className="field-error" role="alert">
                          {errors[name].message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="submit"
                className="predict-button"
                disabled={loading}
              >
                {loading ? "Analyzing..." : "Predict Loan"}
              </button>

              <p className="privacy-note">
                This prediction is an estimate, not a bank's final decision.
              </p>

              {message && (
                <div
                  className={`message ${messageType}`}
                  role={messageType === "error" ? "alert" : "status"}
                >
                  {message}
                </div>
              )}

              {result && (
                <div
                  className={`message ${
                    result === "Y" ? "success" : "rejected"
                  } prediction-result`}
                  role="status"
                >
                  <span className="result-label">PREDICTION RESULT</span>

                  <div className="result-status-row">
                    <span
                      className={`result-badge ${
                        result === "Y" ? "approved-badge" : "rejected-badge"
                      }`}
                    >
                      {result === "Y" ? "APPROVED" : "REJECTED"}
                    </span>
                  </div>

                  <h2>
                    {result === "Y"
                      ? "Likely to be approved"
                      : "Likely to be rejected"}
                  </h2>

                  <p>{predictionExplanation}</p>

                  {applicationId !== null && (
                    <p>
                      <strong>Application ID:</strong> {applicationId}
                    </p>
                  )}

                  {submittedLoan && (
                    <>
                      <hr />
                      <h3>Applicant Details</h3>

                      <div className="result-details">
                        <p><strong>Gender:</strong> {submittedLoan.Gender}</p>
                        <p><strong>Marital Status:</strong> {submittedLoan.Married}</p>
                        <p><strong>Dependents:</strong> {submittedLoan.Dependents}</p>
                        <p><strong>Education:</strong> {submittedLoan.Education}</p>
                        <p><strong>Self Employed:</strong> {submittedLoan.Self_Employed}</p>
                        <p>
                          <strong>Applicant Income:</strong>{" "}
                          {Number(submittedLoan.ApplicantIncome).toLocaleString("en-IN")}
                        </p>
                        <p>
                          <strong>Co-applicant Income:</strong>{" "}
                          {Number(submittedLoan.CoapplicantIncome).toLocaleString("en-IN")}
                        </p>
                        <p>
                          <strong>Loan Amount:</strong>{" "}
                          {Number(submittedLoan.LoanAmount).toLocaleString("en-IN")}
                        </p>
                        <p><strong>Loan Term:</strong> {submittedLoan.Loan_Amount_Term} months</p>
                        <p><strong>Credit History:</strong> {submittedLoan.Credit_History}</p>
                        <p>
                          <strong>Credit Score:</strong>{" "}
                          {submittedLoan.Credit_Score}
                          {" — "}
                          {submittedLoan.Credit_Score >= 650 ? "Good" : "Bad"}
                        </p>
                        <p><strong>Property Area:</strong> {submittedLoan.Property_Area}</p>
                      </div>
                    </>
                  )}

                  <p className="result-disclaimer">
                    This is a machine-learning estimate, not a guarantee of
                    the bank's final decision.
                  </p>
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
                bank makes the final decision.
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
