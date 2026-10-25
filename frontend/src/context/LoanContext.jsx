
import { createContext, useContext, useState } from "react";

const LoanContext = createContext(null);

export function LoanProvider({ children }) {
  const [loanForm, setLoanForm] = useState({
    Gender: "",
    Married: "",
    Dependents: "",
    Education: "",
    Self_Employed: "",
    ApplicantIncome: "",
    CoapplicantIncome: "",
    LoanAmount: "",
    Loan_Amount_Term: "",
    Credit_History: "Good",
    Property_Area: "",
  });

  const updateLoanForm = (field, value) => {
    setLoanForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const resetLoanForm = () => {
    setLoanForm({
      Gender: "",
      Married: "",
      Dependents: "",
      Education: "",
      Self_Employed: "",
      ApplicantIncome: "",
      CoapplicantIncome: "",
      LoanAmount: "",
      Loan_Amount_Term: "",
      Credit_History: "Good",
      Property_Area: "",
    });
  };

  return (
    <LoanContext.Provider
      value={{ loanForm, setLoanForm, updateLoanForm, resetLoanForm }}
    >
      {children}
    </LoanContext.Provider>
  );
}

export function useLoan() {
  const context = useContext(LoanContext);

  if (!context) {
    throw new Error("useLoan must be used inside LoanProvider");
  }

  return context;
}
