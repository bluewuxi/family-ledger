import { Cog } from "lucide-react";

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return (
    <span className="loading-state" role="status" aria-live="polite">
      <Cog className="loading-gear" size={21} strokeWidth={1.6} aria-hidden="true" />
      <span>{label}</span>
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
