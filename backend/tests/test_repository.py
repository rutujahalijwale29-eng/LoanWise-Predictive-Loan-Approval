
from unittest.mock import MagicMock, patch

import pytest

from backend.repository import ApplicationRepository


@pytest.fixture
def repository():
    return ApplicationRepository()


@pytest.fixture
def sample_application():
    return {
        "Gender": "Male",
        "Married": "Yes",
        "Dependents": "0",
        "Education": "Graduate",
        "Self_Employed": "No",
        "ApplicantIncome": 5000,
        "CoapplicantIncome": 1000,
        "LoanAmount": 150,
        "Loan_Amount_Term": 360,
        "Credit_History": 1,
        "Property_Area": "Urban",
    }


@patch("backend.repository.get_db_connection")
def test_create_application_commits(
    mock_connect, repository, sample_application
):
    connection = MagicMock()
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    cursor.lastrowid = 25
    mock_connect.return_value = connection

    result = repository.create_application(
        3, sample_application, "1"
    )

    assert result == 25
    cursor.execute.assert_called_once()
    connection.commit.assert_called_once()
    connection.rollback.assert_not_called()
    cursor.close.assert_called_once()
    connection.close.assert_called_once()


@patch("backend.repository.get_db_connection")
def test_create_application_rolls_back_on_database_error(
    mock_connect, repository, sample_application
):
    import mysql.connector

    connection = MagicMock()
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    mock_connect.return_value = connection

    cursor.execute.side_effect = mysql.connector.Error(
        "Simulated database failure"
    )

    with pytest.raises(mysql.connector.Error):
        repository.create_application(
            3, sample_application, "1"
        )

    connection.commit.assert_not_called()
    connection.rollback.assert_called_once()
    connection.close.assert_called_once()


@patch("backend.repository.get_db_connection")
def test_get_application_returns_record(mock_connect, repository):
    connection = MagicMock()
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    mock_connect.return_value = connection

    expected = {"id": 25, "user_id": 3, "prediction": "1"}
    cursor.fetchone.return_value = expected

    result = repository.get_application(25)

    assert result == expected
    cursor.execute.assert_called_once()
    cursor.close.assert_called_once()
    connection.close.assert_called_once()


@patch("backend.repository.get_db_connection")
def test_delete_application_commits(mock_connect, repository):
    connection = MagicMock()
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    mock_connect.return_value = connection
    cursor.rowcount = 1

    result = repository.delete_application(25)

    assert result is True
    connection.commit.assert_called_once()
    connection.rollback.assert_not_called()


@patch("backend.repository.get_db_connection")
def test_delete_missing_application_returns_false(
    mock_connect, repository
):
    connection = MagicMock()
    cursor = MagicMock()
    connection.cursor.return_value = cursor
    mock_connect.return_value = connection
    cursor.rowcount = 0

    result = repository.delete_application(99999)

    assert result is False
    connection.commit.assert_called_once()


def test_history_rejects_invalid_pagination(repository):
    with pytest.raises(ValueError):
        repository.get_user_history(3, page=0, page_size=10)

    with pytest.raises(ValueError):
        repository.get_user_history(3, page=1, page_size=101)
