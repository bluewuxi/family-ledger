export function isInteractiveRowTarget(target: EventTarget | null, row?: Element): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveTarget = target.closest(
    "button, a, input, select, textarea, [role='button'], [data-row-interactive='true']"
  );

  return Boolean(interactiveTarget && interactiveTarget !== row);
}

export function isRowActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}
