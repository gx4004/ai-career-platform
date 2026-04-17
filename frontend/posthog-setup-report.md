<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Career Workbench. `posthog-js` (v1.367.0) was installed and `PostHogProvider` was added to `src/routes/__root.tsx`, wrapping the entire app tree. A `/ingest` reverse proxy was added to `vite.config.ts` to route PostHog requests through the dev server. Environment variables `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` were written to `frontend/.env`. User identification fires automatically on auth state resolution via `posthog.identify()`, and `posthog.reset()` is called on logout. Six client-side events are captured across five files.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully created a new account via email/password | `src/components/auth/RegisterForm.tsx` |
| `user_logged_in` | User successfully signed in via email/password | `src/components/auth/LoginForm.tsx` |
| `user_logged_out` | Authenticated user explicitly signed out (also calls `posthog.reset()`) | `src/lib/auth/session.tsx` |
| `resume_uploaded` | User successfully uploaded and parsed a resume file | `src/components/tooling/DropzoneHero.tsx` |
| `tool_submitted` | User submitted a tool form to start an AI analysis run (includes `tool_id` and `is_regenerate`) | `src/components/tooling/toolPageShared.tsx` |
| `guest_sign_in_prompted` | Guest user clicked the sign-in link in the save-results banner | `src/components/tooling/GuestSaveBanner.tsx` |

User identification: `posthog.identify(user.id, { email, name })` fires in `SessionProvider` whenever the authenticated user resolves, ensuring all subsequent events are attributed correctly.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/380016/dashboard/1460595
- **New signups over time**: https://us.posthog.com/project/380016/insights/4UrcySNF
- **Tool submissions by tool**: https://us.posthog.com/project/380016/insights/bSrz8DWJ
- **Signup → Tool submission funnel**: https://us.posthog.com/project/380016/insights/gOlG5jxV
- **Resume uploads vs tool runs**: https://us.posthog.com/project/380016/insights/HV14KPsJ
- **Guest conversion: save banner → signup**: https://us.posthog.com/project/380016/insights/eUVcRoKE

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-tanstack-start/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
