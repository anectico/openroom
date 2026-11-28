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

## Cloudflare Email Sending

Choose **Cloudflare** to send over HTTPS from the OpenRoom server. Onboard the sender domain in Cloudflare DNS under **Email Service → Email Sending**. Create an API token scoped to that account with **Email Sending: Edit** permission. Enter the account ID, token and a sender on the onboarded domain, then save and send a test. The token is encrypted. Leave it blank when editing the saved configuration to keep it for the same account.

Sending to addresses verified in your Cloudflare account is free. Other recipients require Workers Paid. [Cloudflare setup](https://developers.cloudflare.com/email-service/get-started/send-emails/) · [Plan details](https://developers.cloudflare.com/email-service/platform/pricing/)

## Existing SMTP

Choose SMTP to use a mail server you already have. Copy its host, port, username, password and
permitted sender from that server's settings. Port 465 uses TLS immediately; port 587 starts with
SMTP and negotiates TLS. Use the provider's application password where required, rather than a
personal sign-in password. This does not require another OpenRoom-specific service. A saved
password is kept only while the host and username stay the same; changing either asks for the
password again.

## Problems and limits

- If verification codes are not arriving, send a test, inspect the last error, check the sender's
  verified domain and the spam folder, and confirm that the daily cap has not been reached.
- A provider outage never bypasses the verification gate. Investors can retry or contact the owner.
- Notices use only part of the daily quota so they cannot consume all capacity reserved for gates.
- Environment variables take precedence over saved settings and make the form read only. See
  [configuration](configuration.md) for provider-specific variables. When multiple environment providers are configured, OpenRoom uses Resend, then SMTP, then Cloudflare.
- The setup card reports that email is configured. Use a test to confirm actual delivery.
