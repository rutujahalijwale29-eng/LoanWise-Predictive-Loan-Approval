
import mysql.connector

from backend.database import get_db_connection


class ApplicationRepository:
    """Database operations for loan application history."""

    def create_application(
        self,
        user_id: int,
        application: dict,
        prediction: str,
        prediction_explanation: str,
    ):
        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor()

            # Convert model output into the database's Y/N format.
            prediction_value = str(prediction).strip().upper()

            prediction_map = {
                "1": "Y",
                "0": "N",
                "Y": "Y",
                "N": "N",
            }

            if prediction_value not in prediction_map:
                raise ValueError(
                    f"Unsupported prediction value: {prediction}"
                )

            prediction_label = prediction_map[prediction_value]

            # Convert credit history into the database's numeric format.
            credit_history_value = application["Credit_History"]

            credit_history_map = {
                "Good": 1,
                "Bad": 0,
                "1": 1,
                "0": 0,
                1: 1,
                0: 0,
            }

            credit_history_key = (
                str(credit_history_value).strip()
                if isinstance(credit_history_value, str)
                else credit_history_value
            )

            if credit_history_key not in credit_history_map:
                raise ValueError(
                    f"Unsupported Credit_History value: "
                    f"{credit_history_value}"
                )

            credit_history = credit_history_map[credit_history_key]

            explanation = (
                str(prediction_explanation).strip()
                if prediction_explanation
                else ""
            )

            if not explanation:
                explanation = self._default_explanation(
                    prediction_label
                )

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
                    prediction,
                    prediction_explanation
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s
                )
                """,
                (
                    user_id,
                    application["Gender"],
                    application["Married"],
                    application["Dependents"],
                    application["Education"],
                    application["Self_Employed"],
                    application["ApplicantIncome"],
                    application["CoapplicantIncome"],
                    application["LoanAmount"],
                    application["Loan_Amount_Term"],
                    credit_history,
                    application["Property_Area"],
                    prediction_label,
                    explanation,
                ),
            )

            application_id = cursor.lastrowid
            connection.commit()

            return application_id

        except Exception:
            if connection is not None and connection.is_connected():
                connection.rollback()
            raise

        finally:
            if cursor is not None:
                cursor.close()

            if connection is not None and connection.is_connected():
                connection.close()

    def get_application(self, application_id: int):
        """Return one saved application with all input fields."""
        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT *
                FROM loan_applications
                WHERE id = %s
                """,
                (application_id,),
            )

            record = cursor.fetchone()

            if record:
                self._format_record(record)

            return record

        finally:
            if cursor is not None:
                cursor.close()

            if connection is not None and connection.is_connected():
                connection.close()

    def get_user_history(
        self,
        user_id: int,
        page: int = 1,
        page_size: int = 10,
        search: str = "",
        status: str = "",
    ):
        """Return paginated application history for one user."""

        if page < 1 or not 1 <= page_size <= 100:
            raise ValueError("Invalid pagination values.")

        # Accept model values and common status labels.
        status_map = {
            "1": "Y",
            "Y": "Y",
            "APPROVED": "Y",
            "0": "N",
            "N": "N",
            "REJECTED": "N",
        }

        status_value = status.strip().upper()

        if status_value and status_value not in status_map:
            raise ValueError(
                "Status must be Approved, Rejected, 1, 0, Y, N, or empty."
            )

        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)

            conditions = ["user_id = %s"]
            params = [user_id]

            if search and search.strip():
                keyword = f"%{search.strip()}%"

                conditions.append(
                    """
                    (
                        CAST(id AS CHAR) LIKE %s
                        OR CAST(user_id AS CHAR) LIKE %s
                        OR Gender LIKE %s
                        OR Married LIKE %s
                        OR Dependents LIKE %s
                        OR Education LIKE %s
                        OR Self_Employed LIKE %s
                        OR CAST(ApplicantIncome AS CHAR) LIKE %s
                        OR CAST(CoapplicantIncome AS CHAR) LIKE %s
                        OR CAST(LoanAmount AS CHAR) LIKE %s
                        OR Property_Area LIKE %s
                        OR prediction LIKE %s
                        OR prediction_explanation LIKE %s
                    )
                    """
                )

                params.extend([keyword] * 13)

            if status_value:
                conditions.append("prediction = %s")
                params.append(status_map[status_value])

            where_clause = " AND ".join(conditions)

            # Get total matching records for pagination.
            cursor.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM loan_applications
                WHERE {where_clause}
                """,
                tuple(params),
            )

            total_records = cursor.fetchone()["total"]

            offset = (page - 1) * page_size

            # SELECT * returns all stored applicant inputs and explanation.
            cursor.execute(
                f"""
                SELECT *
                FROM loan_applications
                WHERE {where_clause}
                ORDER BY created_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                tuple(params + [page_size, offset]),
            )

            records = cursor.fetchall()

            for record in records:
                self._format_record(record)

            return {
                "applications": records,
                "total_records": total_records,
                "page": page,
                "page_size": page_size,
                "total_pages": (
                    (total_records + page_size - 1) // page_size
                ),
            }

        finally:
            if cursor is not None:
                cursor.close()

            if connection is not None and connection.is_connected():
                connection.close()

    @staticmethod
    def _default_explanation(prediction: str) -> str:
        """Create a fallback message when no explanation was supplied."""

        if prediction == "Y":
            return (
                "The model predicted that the loan was likely to be "
                "approved. The original explanation was not saved."
            )

        if prediction == "N":
            return (
                "The model predicted that the loan was likely to be "
                "rejected. The original explanation was not saved."
            )

        return (
            "No prediction explanation is available for this record."
        )

    @classmethod
    def _format_record(cls, record: dict):
        """Format stored values and provide fallback explanations."""

        if record.get("Credit_History") is not None:
            record["Credit_History"] = (
                "Good"
                if int(record["Credit_History"]) == 1
                else "Bad"
            )

        prediction = str(record.get("prediction") or "").strip().upper()

        # Make the prediction readable without changing the database.
        if prediction == "Y":
            record["prediction_label"] = "Approved"
        elif prediction == "N":
            record["prediction_label"] = "Rejected"
        else:
            record["prediction_label"] = "Pending"

        explanation = record.get("prediction_explanation")

        if not explanation or not str(explanation).strip():
            record["prediction_explanation"] = (
                cls._default_explanation(prediction)
            )

        return record
