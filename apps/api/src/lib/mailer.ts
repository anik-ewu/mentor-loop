import { env } from '../config/env';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Brevo only sends from a sender verified there, which the default (Resend's) address can't be. */
const brevoReady = () => Boolean(env.BREVO_API_KEY) && !env.EMAIL_FROM.includes('resend.dev');

/** Production without a provider can't send, so reset and email signup are off there. */
export const emailEnabled = () =>
  brevoReady() || Boolean(env.RESEND_API_KEY) || env.NODE_ENV !== 'production';

/** Splits "Name <a@b.c>", the format EMAIL_FROM uses, for APIs that want the parts separately. */
function parseSender(from: string) {
  const match = from.match(/^\s*(.*?)\s*<(.+)>\s*$/);
  return match ? { name: match[1]!, email: match[2]! } : { email: from.trim() };
}

/** Free without owning a domain: it can send from one verified address to anyone. */
async function sendWithBrevo(email: Email) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: parseSender(env.EMAIL_FROM),
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${await res.text()}`);
}

/** Wrapped in an object so tests can replace `send` without a real email provider. */
export const mailer = {
  async send(email: Email): Promise<void> {
    if (brevoReady()) return sendWithBrevo(email);
    if (!env.RESEND_API_KEY) {
      // Never log the body in production: it holds reset links, and logs are widely readable.
      if (env.NODE_ENV === 'production') {
        console.warn(`[mail] skipped "${email.subject}": no email provider is set`);
        return;
      }
      // Local dev: print the email so the link can still be used.
      console.info(`[mail] to=${email.to} subject="${email.subject}"\n${email.text}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...email }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  },
};
