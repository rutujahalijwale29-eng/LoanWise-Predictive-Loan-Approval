
import * as yup from "yup";

const numericField = (label) =>
  yup
    .number()
    .transform((value, originalValue) => {
      if (
        typeof originalValue === "string" &&
        originalValue.trim() === ""
      ) {
        return NaN;
      }

      if (typeof originalValue === "string") {
        return Number(originalValue.replace(/,/g, ""));
      }

      return value;
    })
    .typeError(`Enter a valid ${label}`)
    .required(`${label} is required`);

export const loanValidationSchema = yup.object({
  Gender: yup
    .string()
    .oneOf(["Female", "Male"], "Please select a valid gender")
    .required("Please select your gender"),

  Married: yup
    .string()
    .oneOf(["Yes", "No"], "Please select a valid marital status")
    .required("Please select marital status"),

  Dependents: yup
    .string()
    .oneOf(["0", "1", "2", "3+"], "Please select valid dependents")
    .required("Please select dependents"),

  Education: yup
    .string()
    .oneOf(["Graduate", "Not Graduate"], "Please select valid education")
    .required("Please select education"),

  Self_Employed: yup
    .string()
    .oneOf(["Yes", "No"], "Please select a valid option")
    .required("Please select self-employment status"),

  ApplicantIncome: numericField("applicant income").min(
    0,
    "Applicant income cannot be negative"
  ),

  CoapplicantIncome: numericField("co-applicant income").min(
    0,
    "Co-applicant income cannot be negative"
  ),

  LoanAmount: numericField("loan amount").moreThan(
    0,
    "Loan amount must be greater than zero"
  ),

  Loan_Amount_Term: numericField("loan term").moreThan(
    0,
    "Loan term must be greater than zero"
  ),

  Credit_History: yup
    .string()
    .oneOf(["Good", "Bad"], "Please select a valid credit history")
    .required("Please select credit history"),

  Property_Area: yup
    .string()
    .oneOf(
      ["Rural", "Semiurban", "Urban"],
      "Please select a valid property area"
    )
    .required("Please select property area"),
});
