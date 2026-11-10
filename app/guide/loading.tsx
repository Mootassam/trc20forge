import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6" aria-busy="true" aria-label="Loading the guide">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /></div>
      ))}
    </div>
  );
}
