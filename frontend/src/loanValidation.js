
import * as yup from "yup";

export const loanValidationSchema = yup.object({
  Gender: yup
    .string()
    .oneOf(["Female", "Male"])
    .required("Please select your gender"),

  Married: yup
    .string()
    .oneOf(["Yes", "No"])
    .required("Please select marital status"),

  Dependents: yup
    .string()
    .oneOf(["0", "1", "2", "3+"])
    .required("Please select dependents"),

  Education: yup
    .string()
    .oneOf(["Graduate", "Not Graduate"])
    .required("Please select education"),

  Self_Employed: yup
    .string()
    .oneOf(["Yes", "No"])
    .required("Please select self-employment status"),

  ApplicantIncome: yup
    .number()
    .typeError("Enter a valid applicant income")
    .min(0, "Income cannot be negative")
    .required("Applicant income is required"),

  CoapplicantIncome: yup
    .number()
    .typeError("Enter a valid co-applicant income")
    .min(0, "Income cannot be negative")
    .required("Co-applicant income is required"),

  LoanAmount: yup
    .number()
    .typeError("Enter a valid loan amount")
    .moreThan(0, "Loan amount must be greater than zero")
    .required("Loan amount is required"),

  Loan_Amount_Term: yup
    .number()
    .typeError("Enter a valid loan term")
    .moreThan(0, "Loan term must be greater than zero")
    .required("Loan term is required"),

  Credit_History: yup
    .string()
    .oneOf(["Good", "Bad"])
    .required("Please select credit history"),

  Property_Area: yup
    .string()
    .oneOf(["Rural", "Semiurban", "Urban"])
    .required("Please select property area"),
});
