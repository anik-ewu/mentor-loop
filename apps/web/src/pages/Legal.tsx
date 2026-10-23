import s from './Legal.module.css';

const UPDATED = 'October 23, 2026';

/** Linked from the footer and from the Google OAuth consent screen (Branding page). */
export function Privacy() {
  return (
    <article className={`container ${s.page}`}>
      <h1>Privacy Policy</h1>
      <p className={s.updated}>Last updated: {UPDATED}</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name and email address.</li>
        <li>
          If you sign in with Google: your Google account ID, name, email and profile picture. We
          never see your Google password.
        </li>
        <li>If you sign up with a password: a one-way hash of it, never the password itself.</li>
        <li>Bookings: the service, time, and any note or CV link you add.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run MentorLoop: to sign you in, show your bookings and let the mentor prepare for
        and manage your sessions. We do not sell your data, show ads, or share it with anyone else.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one essential cookie to keep you signed in. There are no tracking or advertising
        cookies.
      </p>

      <h2>Where it is stored</h2>
      <p>
        Data is stored in a PostgreSQL database hosted by Neon. The app runs on Vercel and Render.
        All traffic uses HTTPS.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask the mentor to correct or delete your account and bookings at any time. Deleting
        your account removes your bookings too.
      </p>
    </article>
  );
}

export function Terms() {
  return (
    <article className={`container ${s.page}`}>
      <h1>Terms of Service</h1>
      <p className={s.updated}>Last updated: {UPDATED}</p>

      <h2>Using MentorLoop</h2>
      <p>
        MentorLoop lets you book 1:1 mentoring sessions. Please provide accurate details and keep
        your login secure. You are responsible for activity on your account.
      </p>

      <h2>Bookings</h2>
      <p>
        A booking is a request until the mentor confirms it. You can cancel your own booking, and
        the mentor may decline or cancel a session if needed.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not misuse the service, try to access other people's accounts, or interfere with how it
        runs. We may suspend accounts that do.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided "as is". Mentoring advice is guidance, not a guarantee of any
        outcome such as a job offer.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The date above shows the latest version.</p>
    </article>
  );
}
