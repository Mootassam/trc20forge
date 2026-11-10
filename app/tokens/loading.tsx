import { MyTokensSkeleton } from "@/components/MyTokens";

/** Instant route-level fallback (React Suspense) while /tokens loads. Same shape as the page. */
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">My tokens</h1>
        <div className="h-10" />
      </div>
      <MyTokensSkeleton />
    </div>
  );
}
