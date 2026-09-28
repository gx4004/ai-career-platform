"""Application details: contact details and standing answers typed once (#374)."""

from app.auth.security import create_access_token, hash_password
from app.models.application_details import ApplicationDetails
from app.models.user import User
from app.services.data_export import export_career_data
from app.services.tool_runs import delete_all_user_data

URL = "/api/v1/applications/details"
DETAILS = {
    "full_name": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": " +44 20 7946 0958 ",
    "linkedin": "https://www.linkedin.com/in/ada",
    "website": "https://ada.dev",
    "location": "London, UK",
    "work_authorization": "Yes, UK citizen",
    "visa_sponsorship": "No",
    "notice_period": "One month",
    "salary_expectation": "90k GBP",
    "relocation": "Open to Berlin",
}


def _other_headers(db) -> dict[str, str]:
    other = User(email="other@example.com", hashed_password=hash_password("password123"))
    db.add(other)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(other.id)}"}


def test_before_saving_the_account_name_and_email_are_offered(client, auth_headers):
    response = client.get(URL, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["is_default"] is True
    assert (body["full_name"], body["email"]) == ("Test User", "test@example.com")
    assert body["phone"] == "" and body["salary_expectation"] == ""


def test_saved_details_come_back_and_stay_with_their_owner(client, db, auth_headers):
    saved = client.put(URL, json=DETAILS, headers=auth_headers)
    assert saved.status_code == 200
    assert saved.json() == {**DETAILS, "phone": "+44 20 7946 0958", "is_default": False}
    assert client.get(URL, headers=auth_headers).json() == saved.json()

    updated = client.put(URL, json={**DETAILS, "relocation": ""}, headers=auth_headers)
    assert updated.json()["relocation"] == ""
    assert db.query(ApplicationDetails).count() == 1

    other = client.get(URL, headers=_other_headers(db)).json()
    assert other["is_default"] is True and other["phone"] == ""


def test_unknown_fields_and_anonymous_callers_are_refused(client, auth_headers):
    assert client.put(URL, json={"ssn": "123"}, headers=auth_headers).status_code == 422
    assert client.put(URL, json={"phone": "1" * 51}, headers=auth_headers).status_code == 422
    assert client.get(URL).status_code == 401


def test_export_includes_details_and_account_deletion_removes_them(
    client, db, test_user, auth_headers
):
    client.put(URL, json=DETAILS, headers=auth_headers)

    exported = export_career_data(db, test_user.id).applications.details
    assert exported.phone == "+44 20 7946 0958"
    assert exported.salary_expectation == "90k GBP"

    delete_all_user_data(db, test_user.id)
    assert db.query(ApplicationDetails).count() == 0
