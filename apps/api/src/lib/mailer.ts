import { env } from '../config/env';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Production without a provider can't send, so password reset is hidden there. */
export const emailEnabled = () => Boolean(env.RESEND_API_KEY) || env.NODE_ENV !== 'production';

/** Wrapped in an object so tests can replace `send` without a real email provider. */
export const mailer = {
  async send(email: Email): Promise<void> {
    if (!env.RESEND_API_KEY) {
      // Never log the body in production: it holds reset links, and logs are widely readable.
      if (env.NODE_ENV === 'production') {
        console.warn(`[mail] skipped "${email.subject}": RESEND_API_KEY isn't set`);
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
