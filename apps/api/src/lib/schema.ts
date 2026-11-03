import { z } from 'zod';

/** A link other people may click, so only http(s): javascript: and data: links can run code. */
export const webUrl = (max: number) =>
  z.url({ protocol: /^https?$/, error: 'Enter a valid http(s) link' }).max(max);
