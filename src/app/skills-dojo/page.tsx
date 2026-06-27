import { bottleneckLoops, dojoSkills, dojoSummary } from "@/lib/skills-dojo";

const statusStyles = {
  Missing: "bg-[#f85149]/10 text-[#ff7b72] border-[#f85149]/20",
  Partial: "bg-[#d29922]/10 text-[#f2cc60] border-[#d29922]/20",
  "Has harness": "bg-[#238636]/10 text-[#56d364] border-[#238636]/20",
};

const priorityStyles = {
  P0: "bg-[#f85149]/10 text-[#ff7b72] border-[#f85149]/20",
  P1: "bg-[#d29922]/10 text-[#f2cc60] border-[#d29922]/20",
  P2: "bg-[#388bfd]/10 text-[#79c0ff] border-[#388bfd]/20",
};

const riskStyles = {
  high: "text-[#ff7b72]",
  medium: "text-[#f2cc60]",
  low: "text-[#56d364]",
};

const firstTwenty = dojoSkills.slice(0, 20);

export default function SkillsDojoPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#58a6ff]">
          Skills Dojo
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#e6edf3]">
          Maverick Skill Evals
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8b949e]">
          The rule is simple: no skill becomes live until it has an eval and at least one reviewed real historical run. This page is the scoreboard so the dojo does not become another folder full of good intentions.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Tracked skills" value={dojoSummary.totalSkills} note="Maverick Hermes skills" />
        <SummaryCard label="Missing evals" value={dojoSummary.missingEvals} note="Need harness" tone="danger" />
        <SummaryCard label="Partial evals" value={dojoSummary.partialEvals} note="Rubric signals only" tone="warning" />
        <SummaryCard label="Harnessed" value={dojoSummary.harnessed} note="Runnable eval file found" tone="good" />
        <SummaryCard label="P0 risks" value={dojoSummary.p0} note="High risk, no eval" tone="danger" />
      </section>

      <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3]">Weekly bottleneck tracks</h2>
            <p className="text-sm text-[#8b949e]">
              These are the first two loops Jack named for the dojo. Sales prep first, insurance process second.
            </p>
          </div>
          <span className="rounded-full border border-[#58a6ff]/20 bg-[#58a6ff]/10 px-3 py-1 text-xs font-medium text-[#79c0ff]">
            Build evals before automation
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {bottleneckLoops.map((loop) => (
            <article key={loop.name} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">{loop.priority} track</p>
                  <h3 className="mt-1 text-base font-semibold text-[#e6edf3]">{loop.name}</h3>
                </div>
                <span className="rounded-full border border-[#d29922]/20 bg-[#d29922]/10 px-2.5 py-1 text-xs text-[#f2cc60]">
                  Eval needed
                </span>
              </div>
              <p className="text-sm leading-6 text-[#c9d1d9]">{loop.bottleneck}</p>
              <div className="mt-4 rounded-md bg-[#161b22] p-3">
                <p className="text-xs font-semibold uppercase text-[#8b949e]">Trigger</p>
                <p className="mt-1 text-sm text-[#c9d1d9]">{loop.trigger}</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Checklist title="Eval bar" items={loop.evalBar} />
                <Checklist title="Stop rules" items={loop.stopRules} />
              </div>
              <p className="mt-4 text-xs text-[#8b949e]">Next: {loop.status}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3]">Eval backlog</h2>
            <p className="text-sm text-[#8b949e]">
              First 20 skills sorted by risk and missing eval coverage. This is the audit list, not a beauty contest.
            </p>
          </div>
          <span className="text-xs text-[#8b949e]">{dojoSummary.p0 + dojoSummary.p1} P0/P1 items</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#30363d]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0d1117] text-xs uppercase tracking-wide text-[#8b949e]">
              <tr>
                <th className="px-4 py-3">Skill</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Eval</th>
                <th className="px-4 py-3">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {firstTwenty.map((skill) => (
                <tr key={skill.slug} className="bg-[#161b22] align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#e6edf3]">{skill.name}</div>
                    <div className="mt-1 max-w-xl text-xs leading-5 text-[#8b949e]">{skill.description || skill.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-[#c9d1d9]">{skill.domain}</td>
                  <td className={`px-4 py-3 font-medium capitalize ${riskStyles[skill.risk]}`}>{skill.risk}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${statusStyles[skill.evalStatus]}`}>
                      {skill.evalStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${priorityStyles[skill.priority]}`}>
                      {skill.priority}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <h2 className="text-lg font-semibold text-[#e6edf3]">Dojo promotion rule</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {["Skill owner", "Five eval cases", "One historical run", "Human review", "Live status"].map((step, index) => (
            <div key={step} className="rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#58a6ff]/10 text-xs font-bold text-[#79c0ff]">
                {index + 1}
              </div>
              <p className="text-sm font-medium text-[#e6edf3]">{step}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, note, tone = "default" }: { label: string; value: number; note: string; tone?: "default" | "danger" | "warning" | "good" }) {
  const toneClass = tone === "danger" ? "text-[#ff7b72]" : tone === "warning" ? "text-[#f2cc60]" : tone === "good" ? "text-[#56d364]" : "text-[#e6edf3]";
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[#8b949e]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[#8b949e]">{note}</p>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-[#8b949e]">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-5 text-[#c9d1d9]">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#58a6ff]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
