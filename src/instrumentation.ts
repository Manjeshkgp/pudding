export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initInProcessCronJobs } = await import("./jobs/scheduler");
    initInProcessCronJobs();
  }
}
