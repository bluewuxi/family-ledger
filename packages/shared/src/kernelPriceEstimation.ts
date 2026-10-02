const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export function getKernelValuationDateForNzxSession(nzxSessionDate: string): string {
  if (!datePattern.test(nzxSessionDate)) throw new Error("NZX session date must use YYYY-MM-DD format.");
  const session = new Date(`${nzxSessionDate}T00:00:00Z`);
  if (Number.isNaN(session.getTime()) || session.toISOString().slice(0, 10) !== nzxSessionDate) {
    throw new Error("NZX session date is invalid.");
  }

  const weekday = session.getUTCDay();
  if (weekday === 0 || weekday === 6) throw new Error("NZX session date must be a weekday.");
  session.setUTCDate(session.getUTCDate() - (weekday === 1 ? 3 : 1));
  return session.toISOString().slice(0, 10);
}
