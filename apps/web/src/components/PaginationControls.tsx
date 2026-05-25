import type { Pagination } from "@family-ledger/shared";

interface PaginationControlsProps {
  pagination: Pagination;
  loading: boolean;
  onPageChange: (offset: number) => void;
}

export function PaginationControls({ pagination, loading, onPageChange }: PaginationControlsProps) {
  const page = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="pagination-controls">
      <button
        className="secondary-button"
        type="button"
        disabled={loading || pagination.offset === 0}
        onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
      >
        上一页
      </button>
      <span>第 {page} 页</span>
      <button
        className="secondary-button"
        type="button"
        disabled={loading || !pagination.hasMore}
        onClick={() => onPageChange(pagination.offset + pagination.limit)}
      >
        下一页
      </button>
    </div>
  );
}
