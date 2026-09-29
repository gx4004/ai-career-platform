"""Per-ATS knowledge of the application form's DOM (#375).

Each adapter is a small selector contract: where the form is, what one
question's container and label look like, which input takes the resume (and
cover letter), and which inputs are standard contact fields. The runner does
the same work for every ATS with these selectors; the fixtures in
``tests/fixtures/autofill/`` pin each contract.

When an ATS changes its markup, this file and that ATS's fixture change together.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlsplit

from app.services.autopilot.policy import ASHBY_HOST, GREENHOUSE_HOSTS, LEVER_HOST


@dataclass(frozen=True)
class Adapter:
    name: str
    hosts: frozenset[str]
    form: str  # present once the form has rendered; controls are read inside it
    question: str  # the container of one question
    label: str  # the question's text inside that container
    resume: str  # the resume file input (may sit outside the form)
    cover: str = ""  # the cover-letter file input, when the ATS has a fixed one
    contact: dict[str, str] = field(default_factory=dict)  # selector → contact field

    def script_args(self) -> dict:
        return {
            "form": self.form, "question": self.question, "label": self.label,
            "resume": self.resume, "cover": self.cover, "contact": self.contact,
        }


GREENHOUSE_LEGACY = Adapter(
    name="greenhouse-legacy",
    hosts=GREENHOUSE_HOSTS,
    form="form#application_form",
    question=".field, fieldset",
    label="label, legend",
    # The resume and cover letter upload through their own small forms.
    resume="#s3_upload_for_resume input[type=file], #resume_fieldset input[type=file]",
    cover="#s3_upload_for_cover_letter input[type=file], #cover_letter_fieldset input[type=file]",
    contact={"#first_name": "first_name", "#last_name": "last_name", "#email": "email",
             "#phone": "phone"},
)

GREENHOUSE_JOB_BOARDS = Adapter(
    name="greenhouse-job-boards",
    hosts=GREENHOUSE_HOSTS,
    form="form#application-form",
    question=".input-wrapper, .select__container, .file-upload, fieldset, .checkbox",
    label="label, legend, .upload-label",
    resume="input#resume[type=file]",
    cover="input#cover_letter[type=file]",
    contact={"#first_name": "first_name", "#last_name": "last_name", "#email": "email",
             "#phone": "phone"},
)

LEVER = Adapter(
    name="lever",
    hosts=frozenset({LEVER_HOST}),
    form="form#application-form",
    question="li.application-question",
    label=".application-label",
    resume="input#resume-upload-input[type=file]",
    contact={"input[name=name]": "full_name", "input[name=email]": "email",
             "input[name=phone]": "phone", "input[name='urls[LinkedIn]']": "linkedin"},
)

ASHBY = Adapter(
    name="ashby",
    hosts=frozenset({ASHBY_HOST}),
    form=".ashby-application-form-container",
    question=".ashby-application-form-field-entry, fieldset",
    label=".ashby-application-form-question-title, legend",
    # Only the resume question: the "autofill from resume" box above the form
    # would overwrite fields with parsed text.
    resume="input#_systemfield_resume[type=file]",
    contact={"#_systemfield_name": "full_name", "#_systemfield_email": "email"},
)

ADAPTERS = (GREENHOUSE_LEGACY, GREENHOUSE_JOB_BOARDS, LEVER, ASHBY)


def adapters_for(url: str) -> tuple[Adapter, ...]:
    host = urlsplit(url or "").hostname
    return tuple(adapter for adapter in ADAPTERS if host in adapter.hosts)


# Tags every control inside the adapter's form and returns what a person reads
# as its question. Radios and checkboxes in one question become one control
# whose ``options`` are their labels. Nothing here changes a value.
DESCRIBE_CONTROLS = """(a) => {
  const form = document.querySelector(a.form);
  if (!form) return [];
  const blocks = [...document.querySelectorAll(a.question)];
  const files = [a.resume, a.cover].filter(Boolean).join(', ');
  const els = [...new Set([...form.querySelectorAll('input, textarea, select'),
                           ...document.querySelectorAll(files)])];
  const text = n => ((n && (n.innerText || n.textContent)) || '').replace(/\\s+/g, ' ').trim();
  const shown = n => {
    const s = getComputedStyle(n);
    return s.display !== 'none' && s.visibility !== 'hidden' && n.offsetParent !== null;
  };
  const ownLabel = el => {
    const by = el.getAttribute('aria-labelledby');
    return text(el.labels && el.labels[0])
      || (by ? text(document.getElementById(by.split(' ')[0])) : '')
      || el.getAttribute('aria-label') || '';
  };
  const out = [], groups = new Map(), hiddenGroups = [];
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    let type = tag === 'select' ? 'select' : (el.type || '').toLowerCase();
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list')
      type = 'combobox';
    const block = el.closest(a.question);
    const grouped = type === 'radio' || type === 'checkbox';
    const option = grouped ? (ownLabel(el) || el.getAttribute('value') || '') : '';
    const groupKey = type + ':' + (block ? 'b' + blocks.indexOf(block) : 'n' + el.name);
    const group = grouped && groups.get(groupKey);
    if (group) {  // one more option of a question already listed
      el.setAttribute('data-cw-autofill', String(group.idx));
      if (option) group.options.push(option);
      group.empty = group.empty && !el.checked;
      continue;
    }
    const idx = out.length;
    el.setAttribute('data-cw-autofill', String(idx));
    const contact = Object.keys(a.contact).find(sel => el.matches(sel));
    const slot = type !== 'file' ? '' : el.matches(a.resume) ? 'resume'
      : (a.cover && el.matches(a.cover)) ? 'cover' : '';
    const label = (block && text(block.querySelector(a.label))) || ownLabel(el)
      || ({resume: 'Resume/CV', cover: 'Cover letter'})[slot]
      || el.placeholder || el.name || el.id || '';
    let options = [];
    if (tag === 'select') options = [...el.options].map(o => o.text.trim());
    else if (grouped && option) options = [option];
    else if (type === 'combobox') {
      const list = document.getElementById(el.getAttribute('aria-controls') || '');
      options = list ? [...list.querySelectorAll('[role=option]')].map(text) : [];
    }
    const control = {
      idx, tag, type, name: el.name || '', id: el.id || '', label, options, slot,
      contact: contact ? a.contact[contact] : '',
      // Styled radios, checkboxes and Yes/No buttons hide the real input.
      visible: shown(el) || (grouped && !!block && shown(block)),
      empty: type === 'file' ? el.files.length === 0 : grouped ? !el.checked : !el.value,
    };
    out.push(control);
    if (grouped) groups.set(groupKey, control);
    if (grouped && block && !shown(el)) hiddenGroups.push([control, block]);
  }
  // A hidden input behind Yes/No buttons has no option labels: the buttons are the options.
  for (const [control, block] of hiddenGroups) {
    const buttons = [...block.querySelectorAll('button[type=button], [role=radio]')]
      .map(text).filter(Boolean);
    if (control.options.length < 2 && buttons.length > 1) control.options = buttons;
  }
  return out;
}"""
