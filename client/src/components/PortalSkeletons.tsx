import { cn } from '@/lib/utils';

type SkeletonProps = {
  className?: string;
};

export function SkeletonBlock({ className }: SkeletonProps) {
  return <div className={cn('app-skeleton-line', className)} aria-hidden="true" />;
}

export function InlineLoadingBlock({ className }: SkeletonProps) {
  return (
    <div className={cn('app-card-surface app-page app-page-stagger p-4', className)} aria-hidden="true">
      <SkeletonBlock className="h-3 w-48" />
      <SkeletonBlock className="mt-3 h-10 w-full" />
      <SkeletonBlock className="mt-3 h-10 w-[88%]" />
    </div>
  );
}

export function TableLoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center">
        <div className="mx-auto max-w-xl">
          <SkeletonBlock className="h-8 w-full" />
        </div>
      </td>
    </tr>
  );
}

function LoadingCard() {
  return (
    <div className="app-card-surface app-page-stagger p-5 min-h-28" aria-hidden="true">
      <SkeletonBlock className="h-3 w-44" />
      <SkeletonBlock className="mt-3 h-3 w-64 max-w-full" />
      <SkeletonBlock className="mt-3 h-3 w-36" />
    </div>
  );
}

export function DashboardSkeleton() {
  return <LoadingCard />;
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="app-card-surface app-page-stagger p-6">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="mt-3 h-12 w-72 max-w-full" />
        <SkeletonBlock className="mt-4 h-24 w-full" />
      </div>
      <LoadingCard />
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="app-card-surface app-page-stagger p-5">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="mt-3 h-8 w-56 max-w-full" />
      </div>
      <div className="app-card-surface app-page-stagger p-5">
        <SkeletonBlock className="h-2.5 w-full" />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
      </div>
      <TablePageSkeleton rows={5} />
    </div>
  );
}

export function TablePageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
        <div key={index} style={{ animationDelay: `${Math.min(index * 55, 520)}ms` }} className="app-reveal-down">
          <LoadingCard />
        </div>
      ))}
    </div>
  );
}

export function InlineUpdatingBadge({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
      <span className="app-loading-dot" />
      Updating
    </span>
  );
}
