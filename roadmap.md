# Sign-in fixes
- [x] Send a neutral sign-in email for an existing-account signup.
- [x] Resend verification for an unconfirmed password sign-in without counting a failed attempt.
- [x] Support links and codes on verification screens, including Outlook access.
- [x] Redirect successful non-recovery email links to inbox; preserve recovery and account switching.
- [x] Check cross-browser link format; run unit tests and type check only.

Manual verification remains: real email delivery, live cross-browser/mail-app links, inbox/onboarding navigation, recovery and the resend timer. No browser tests were run.