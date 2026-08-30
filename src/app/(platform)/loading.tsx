import { CardSkeleton, Skeleton } from '@/components/ui/states';

/** Route-transition skeleton, shaped like the page it precedes. */
export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2.5 h-7 w-64" />
        <Skeleton className="mt-2.5 h-3 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} rows={1} />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <CardSkeleton rows={6} />
        <CardSkeleton rows={6} className="lg:col-span-2" />
      </div>
    </div>
  );
}
