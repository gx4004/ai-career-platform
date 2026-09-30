"""Autopilot experiment: fill an application form, then stop (#325).

``policy`` decides what may be opened and what goes into which field,
``adapters`` hold each ATS's form DOM contract, ``runner`` drives the browser,
and ``materials`` collects what to fill from an application.
"""

from app.services.autopilot.materials import build_materials
from app.services.autopilot.policy import (
    AutofillBusy,
    AutofillMaterials,
    AutofillRefused,
    ats_form_url,
)
from app.services.autopilot.runner import (
    AutofillReport,
    AutofillRun,
    FormNotFound,
    cancel_run,
    get_run,
    start_autofill,
)

__all__ = [
    "AutofillBusy",
    "AutofillMaterials",
    "AutofillRefused",
    "AutofillReport",
    "AutofillRun",
    "FormNotFound",
    "ats_form_url",
    "build_materials",
    "cancel_run",
    "get_run",
    "start_autofill",
]
