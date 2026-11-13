# Email setup

Email is optional. Without it, copy investor links and member invitation addresses manually. Email
verification requires delivery; OpenRoom refuses to enable that gate without an email configuration.
In-app notifications and document access continue to work without a provider.

An owner opens **Settings → General and email**, chooses a provider, enters the sender and
credentials, saves, then uses **Send a test email** to an address they control. A saved configuration
alone does not prove delivery: check the test result and the receiving inbox before requiring email
verification on investor links.

## Resend

The [free plan](https://resend.com/pricing) includes a daily sending limit of 100 emails as checked
on 11 November 2026. OpenRoom's default cap is 90 emails per rolling day; verification, invitations,
notices and tests share it. Check the provider's current monthly and daily allowances before
changing that cap.

Verify a domain you own using the provider's [domain setup](https://resend.com/docs/dashboard/domains/introduction).
Create a [sending API key](https://resend.com/docs/dashboard/api-keys/introduction) for that domain.
In OpenRoom, choose Resend, enter a sender on that verified domain such as
`Team <rooms@example.com>`, and paste the key. Credentials are encrypted and not returned by the API.

## Existing SMTP

Choose SMTP to use a mail server you already have. Copy its host, port, username, password and
permitted sender from that server's settings. Port 465 uses TLS immediately; port 587 starts with
SMTP and negotiates TLS. Use the provider's application password where required, rather than a
personal sign-in password. This does not require another OpenRoom-specific service.

## Problems and limits

- If verification codes are not arriving, send a test, inspect the last error, check the sender's
  verified domain and the spam folder, and confirm that the daily cap has not been reached.
- A provider outage never bypasses the verification gate. Investors can retry or contact the owner.
- Notices use only part of the daily quota so they cannot consume all capacity reserved for gates.
- Environment variables take precedence over saved settings and make the form read only. See
  [configuration](configuration.md) for `EMAIL_FROM`, `RESEND_API_KEY` and `SMTP_*`.
- The setup card reports that email is configured. Use a test to confirm actual delivery.
