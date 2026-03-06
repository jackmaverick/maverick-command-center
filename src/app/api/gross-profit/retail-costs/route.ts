import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

interface RetailCostRow {
  id: string;
  job_jnid: string;
  store_name: string;
  amount: string;
  description: string | null;
  purchase_date: string | null;
  created_at: string;
}

function formatRow(row: RetailCostRow) {
  return {
    id: row.id,
    jobJnid: row.job_jnid,
    storeName: row.store_name,
    amount: parseFloat(row.amount),
    description: row.description,
    purchaseDate: row.purchase_date,
    createdAt: row.created_at,
  };
}

// GET — list retail costs for a job
export async function GET(request: NextRequest) {
  try {
    const jobJnid = new URL(request.url).searchParams.get("job_jnid");
    if (!jobJnid) {
      return NextResponse.json(
        { error: "job_jnid is required" },
        { status: 400 }
      );
    }

    const rows = await query<RetailCostRow>(
      "SELECT * FROM job_retail_costs WHERE job_jnid = $1 ORDER BY purchase_date DESC, created_at DESC",
      [jobJnid]
    );

    return NextResponse.json({ costs: rows.map(formatRow) });
  } catch (error) {
    console.error("Retail costs GET error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — create a retail cost entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { job_jnid, store_name, amount, description, purchase_date } = body;

    if (!job_jnid || !store_name || amount == null) {
      return NextResponse.json(
        { error: "job_jnid, store_name, and amount are required" },
        { status: 400 }
      );
    }

    const row = await queryOne<RetailCostRow>(
      `INSERT INTO job_retail_costs (job_jnid, store_name, amount, description, purchase_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [job_jnid, store_name, amount, description || null, purchase_date || null]
    );

    return NextResponse.json({ cost: row ? formatRow(row) : null });
  } catch (error) {
    console.error("Retail costs POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove a retail cost entry
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await query("DELETE FROM job_retail_costs WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Retail costs DELETE error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
