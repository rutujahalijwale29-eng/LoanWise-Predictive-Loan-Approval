
import mysql.connector

from backend.database import get_db_connection


class ApplicationRepository:
    """Database operations for loan application history."""

    def create_application(self, user_id: int, application: dict, prediction: str):
        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor()

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
                    prediction
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s
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
                  {"Good": 1, "Bad": 0}[application["Credit_History"]],
                    application["Property_Area"],
                    prediction,
                ),
            )

            application_id = cursor.lastrowid
            connection.commit()
            return application_id

        except mysql.connector.Error:
            if connection is not None and connection.is_connected():
                connection.rollback()
            raise

        finally:
            if cursor is not None:
                cursor.close()
            if connection is not None and connection.is_connected():
                connection.close()

    def get_application(self, application_id: int):
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

            return cursor.fetchone()

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
    ):
        if page < 1 or not 1 <= page_size <= 100:
            raise ValueError("Invalid pagination values.")

        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM loan_applications
                WHERE user_id = %s
                """,
                (user_id,),
            )
            total = cursor.fetchone()["total"]

            offset = (page - 1) * page_size

            cursor.execute(
                """
                SELECT *
                FROM loan_applications
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                (user_id, page_size, offset),
            )

            records = cursor.fetchall()

            return {
                "applications": records,
                "total_records": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
            }

        finally:
            if cursor is not None:
                cursor.close()
            if connection is not None and connection.is_connected():
                connection.close()

    def delete_application(self, application_id: int) -> bool:
        connection = None
        cursor = None

        try:
            connection = get_db_connection()
            cursor = connection.cursor()

            cursor.execute(
                "DELETE FROM loan_applications WHERE id = %s",
                (application_id,),
            )

            deleted = cursor.rowcount > 0
            connection.commit()
            return deleted

        except mysql.connector.Error:
            if connection is not None and connection.is_connected():
                connection.rollback()
            raise

        finally:
            if cursor is not None:
                cursor.close()
            if connection is not None and connection.is_connected():
                connection.close()
