export default function DashboardLoading() {
  return (
    <div className="dashboardSkeleton" aria-label="Loading dashboard">
      <div className="skeletonHero shimmer" />
      <div className="skeletonGrid">
        <div className="shimmer" />
        <div className="shimmer" />
        <div className="shimmer" />
      </div>
      <div className="skeletonPanel shimmer" />
      <div className="skeletonPanel shimmer" />
    </div>
  );
}
