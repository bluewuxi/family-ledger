import { useEffect } from "react";
import type { Pagination } from "@family-ledger/shared";

interface PaginationControlsProps {
  pagination: Pagination;
  loading: boolean;
  onPageChange: (offset: number) => void;
}

export function PaginationControls({ pagination, loading, onPageChange }: PaginationControlsProps) {
  const pages = Math.ceil(pagination.total / pagination.limit);
  const page = pages ? Math.min(pages, Math.floor(pagination.offset / pagination.limit) + 1) : 0;
  const lastOffset = Math.max(0, (pages - 1) * pagination.limit);
  useEffect(() => {
    if (!loading && pagination.offset > lastOffset) onPageChange(lastOffset);
  }, [loading, pagination.offset, lastOffset, onPageChange]);

  return (
    <div className="pagination-controls">
      <button
        className="secondary-button"
        type="button"
        disabled={loading || !pagination.total || pagination.offset === 0}
        onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
      >
        上一页
      </button>
      <span>{pagination.total ? `第 ${page} / ${pages} 页 · 共 ${pagination.total} 条` : "共 0 条"}</span>
      <button
        className="secondary-button"
        type="button"
        disabled={loading || !pagination.hasMore || !pagination.total}
        onClick={() => onPageChange(pagination.offset + pagination.limit)}
      >
        下一页
      </button>
    </div>
  );
}
