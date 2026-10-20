exports.default = async ({ page }) => {
  const allowed = process.env.JOB_SEEKER_TEST_ORIGIN;
  if (!allowed) throw new Error('Missing isolated test origin');
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === allowed ? route.continue() : route.abort('blockedbyclient');
  });
};
