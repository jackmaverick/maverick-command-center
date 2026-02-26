const JOB_TYPES = [
  { name: "Roofing", color: "#58a6ff" },
  { name: "Siding", color: "#a371f7" },
  { name: "Gutters", color: "#3fb950" },
  { name: "Windows", color: "#d29922" },
  { name: "Repairs", color: "#f0883e" },
  { name: "Other", color: "#8b949e" },
];

export default function JobTypesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#e6edf3] mb-2">Job Types</h1>
      <p className="text-[#8b949e] mb-8">
        Compare performance across job types — volume, revenue, close rates, and
        average ticket sizes.
      </p>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Jobs", value: "---" },
          { label: "Total Revenue", value: "$---" },
          { label: "Job Types Tracked", value: JOB_TYPES.length.toString() },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#161b22] border border-[#30363d] rounded-lg p-4"
          >
            <p className="text-xs text-[#8b949e] mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold text-[#e6edf3]">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Job type breakdown chart placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Revenue by Job Type
          </h2>
          <div className="space-y-3">
            {JOB_TYPES.map((jt) => (
              <div key={jt.name} className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: jt.color }}
                />
                <span className="text-sm text-[#e6edf3] w-20">{jt.name}</span>
                <div className="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
                  <div
                    className="h-full rounded opacity-40"
                    style={{
                      width: "0%",
                      backgroundColor: jt.color,
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-[#8b949e] w-16 text-right">
                  $---
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
            Job Volume Distribution
          </h2>
          <div className="h-48 flex items-center justify-center border border-dashed border-[#30363d] rounded-lg">
            <span className="text-sm text-[#8b949e]">
              Pie / donut chart placeholder
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {JOB_TYPES.map((jt) => (
              <div key={jt.name} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: jt.color }}
                />
                <span className="text-xs text-[#8b949e]">{jt.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">
          Job Type Comparison
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d]">
                {[
                  "Job Type",
                  "Total Jobs",
                  "Won",
                  "Lost",
                  "Close Rate",
                  "Revenue",
                  "Avg Ticket",
                  "Avg Cycle",
                ].map((col) => (
                  <th
                    key={col}
                    className={`pb-3 font-medium text-[#8b949e] ${
                      col === "Job Type" ? "text-left" : "text-right"
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {JOB_TYPES.map((jt) => (
                <tr key={jt.name} className="border-b border-[#21262d]">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: jt.color }}
                      />
                      <span className="text-[#e6edf3]">{jt.name}</span>
                    </div>
                  </td>
                  {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <td key={i} className="py-3 text-right">
                      <div className="h-4 w-12 bg-[#21262d] rounded animate-pulse ml-auto" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
