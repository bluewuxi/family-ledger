export function isInteractiveRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("button, a, input, select, textarea, [role='button'], [data-row-interactive='true']")
  );
}
