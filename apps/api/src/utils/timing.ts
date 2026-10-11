import { logCaughtError } from "./errorLogging";
export async function timed<T>(operation: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await work();
    console.info(JSON.stringify({ event: "api-timing", operation, durationMs: Math.round(performance.now() - start), rows: Array.isArray(result) ? result.length : undefined }));
    return result;
  } catch (error) {
    logCaughtError(operation, error);
    console.info(JSON.stringify({ event: "api-timing", operation, durationMs: Math.round(performance.now() - start), failed: true }));
    throw error;
  }
}
