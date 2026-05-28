export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return (
    <span className="loading-state" role="status" aria-live="polite">
      <span>{label}</span>
      <span className="loading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function LoadingBlock({ label = "正在加载" }: { label?: string }) {
  return (
    <div className="loading-block">
      <LoadingState label={label} />
    </div>
  );
}
