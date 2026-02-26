import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(request: NextRequest) {
  try {
    // Return agent status data
    // In a real integration, this would query Command Center database
    // For now, return static agent definitions with placeholder heartbeat data
    const agents: Array<{
      id: string;
      name: string;
      role: string;
      description: string;
      status: "idle" | "active" | "sleeping" | "error";
      lastHeartbeat: string;
      tasksProcessed: number;
      tasksToday: number;
      uptime: string;
    }> = [
      {
        id: "coordinator",
        name: "Coordinator",
        role: "Task routing & orchestration",
        description:
          "Routes tasks to correct projects and coordinates multi-agent workflows",
        status: "idle",
        lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
        tasksProcessed: 47,
        tasksToday: 5,
        uptime: "99.2%",
      },
      {
        id: "compound-engineer",
        name: "Compound Engineer",
        role: "Session learning extraction",
        description: "Extracts learnings from sessions and updates memory files",
        status: "sleeping",
        lastHeartbeat: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hrs ago
        tasksProcessed: 12,
        tasksToday: 0,
        uptime: "98.8%",
      },
      {
        id: "developer",
        name: "Developer",
        role: "Feature implementation",
        description: "Builds features, fixes bugs, and refactors code",
        status: "active",
        lastHeartbeat: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
        tasksProcessed: 156,
        tasksToday: 12,
        uptime: "99.7%",
      },
      {
        id: "content-writer",
        name: "Content Writer",
        role: "Copy & documentation",
        description: "Writes copy, documentation, and educational materials",
        status: "idle",
        lastHeartbeat: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hr ago
        tasksProcessed: 89,
        tasksToday: 3,
        uptime: "99.5%",
      },
    ];

    // Return with proper response format
    return NextResponse.json(
      {
        agents,
        summary: {
          totalAgents: agents.length,
          activeAgents: agents.filter((a) => a.status === "active").length,
          idleAgents: agents.filter((a) => a.status === "idle").length,
          sleepingAgents: agents.filter((a) => a.status === "sleeping").length,
          errorAgents: agents.filter((a) => a.status === "error").length,
          totalTasksToday: agents.reduce((sum, a) => sum + a.tasksToday, 0),
          averageUptime:
            (
              agents.reduce(
                (sum, a) => sum + parseFloat(a.uptime),
                0
              ) / agents.length
            ).toFixed(1) + "%",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
