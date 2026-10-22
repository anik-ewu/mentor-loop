import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { unauthorized } from '../../lib/errors';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

const client = new OAuth2Client();

/** Wrapped in an object so tests can replace `verify` without a real Google token. */
export const googleVerifier = {
  async verify(credential: string): Promise<GoogleProfile> {
    const ticket = await client
      .verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })
      .catch(() => {
        throw unauthorized('Google sign-in failed, please try again');
      });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) {
      throw unauthorized('Your Google account email is not verified');
    }
    return {
      googleId: p.sub,
      email: p.email.toLowerCase(),
      name: p.name ?? p.email.split('@')[0],
      avatarUrl: p.picture,
    };
  },
};
