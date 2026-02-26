export function SkeletonCard() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 animate-pulse">
      <div className="space-y-4">
        <div className="h-4 w-24 bg-[#30363d] rounded" />
        <div className="h-10 w-32 bg-[#30363d] rounded" />
        <div className="h-3 w-40 bg-[#30363d] rounded" />
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 animate-pulse">
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-20 bg-[#30363d] rounded flex-shrink-0" />
            <div className="h-4 w-32 bg-[#30363d] rounded flex-1" />
            <div className="h-4 w-24 bg-[#30363d] rounded flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonGrid({ cols = 3 }: { cols?: number }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-${cols} gap-4 animate-pulse`}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-[#161b22] border border-[#30363d] rounded-lg p-6"
        >
          <div className="h-4 w-24 bg-[#30363d] rounded mb-4" />
          <div className="h-10 w-20 bg-[#30363d] rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 animate-pulse">
      <div className="h-4 w-32 bg-[#30363d] rounded mb-6" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-2 bg-[#30363d] rounded" style={{ width: `${50 + i * 10}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
