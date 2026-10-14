import { PageSkeleton } from "@/components/ui/layout";

/**
 * Skeleton for this list page only. It lives in a (list) route group so that
 * detail pages keep a real HTTP 404 (a loading boundary above them would start
 * streaming with status 200 before notFound()).
 */
export default function Loading() {
  return <PageSkeleton />;
}
