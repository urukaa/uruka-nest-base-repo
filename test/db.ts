/**
 * Use in place of `describe` for specs that need a live database. The flag is
 * set by test/global-setup.ts.
 */
export const describeWithDb =
  process.env.DB_AVAILABLE === 'true' ? describe : describe.skip;
