
import { createContext, useContext, useState } from "react";

const LoanContext = createContext(null);

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

export function LoanProvider({ children }) {
  const [loanForm, setLoanForm] = useState({ ...initialLoan });

  const updateLoanForm = (field, value) => {
    setLoanForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const resetLoanForm = () => {
    setLoanForm({ ...initialLoan });
  };

  return (
    <LoanContext.Provider
      value={{
        loanForm,
        setLoanForm,
        updateLoanForm,
        resetLoanForm,
      }}
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
