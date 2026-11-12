export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getJwtSecretKey } = await import("./lib/auth-secret");
    getJwtSecretKey();
    const { initInProcessCronJobs } = await import("./jobs/scheduler");
    initInProcessCronJobs();
  }
}
