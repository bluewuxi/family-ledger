/** Observe unexpected failures at React event/effect boundaries; domain handlers retain their own feedback. */
export function observeAsync(task: PromiseLike<unknown> | void): void {
  Promise.resolve(task).catch(() => {
    // Do not expose request payloads, credentials, or internal diagnostics in browser logs.
    console.error("Unexpected asynchronous UI operation failure.");
  });
}
