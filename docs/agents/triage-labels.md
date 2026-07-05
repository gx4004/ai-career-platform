# Triage Labels

The Matt Pocock skills use five canonical triage roles. They map directly to these
GitHub labels:

| Canonical role | GitHub label | Meaning |
|---|---|---|
| `needs-triage` | `needs-triage` | A maintainer must evaluate the issue. |
| `needs-info` | `needs-info` | Work is waiting for information from the reporter. |
| `ready-for-agent` | `ready-for-agent` | The issue is decision-complete and safe for an agent to implement. |
| `ready-for-human` | `ready-for-human` | The issue requires human implementation or judgement. |
| `wontfix` | `wontfix` | The issue will not be actioned. |

Use exactly one workflow-state label at a time. Domain, risk, and release labels may
coexist with the workflow-state label.
