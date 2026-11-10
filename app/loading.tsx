import { Skeleton } from "@/components/ui";

/** Fallback for the Forge (and any route without its own loading.tsx). */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="max-w-3xl space-y-3"><Skeleton className="h-9 w-80 max-w-full" /><Skeleton className="h-4 w-full" /></div>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        <Skeleton className="h-[28rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}
