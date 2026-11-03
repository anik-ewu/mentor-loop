/** Shared accounts anyone can sign in to while demo mode is on. */
export const DEMO_EMAILS = { user: 'demo@mentorloop.dev', admin: 'admin@mentorloop.dev' } as const;

export const isDemoEmail = (email: string) =>
  (Object.values(DEMO_EMAILS) as string[]).includes(email);

/** What the demo mentor may see of other people's data: only the demo client's. */
export const demoOwnerFilter = { email: { in: Object.values(DEMO_EMAILS) as string[] } };
