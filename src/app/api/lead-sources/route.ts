import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isValidPeriodKey } from "@/lib/dates";
import { buildAcquisitionReport, reportingWindow, reportingChannel, META_ACCOUNT, type CostEvidence } from "@/lib/acquisition-report";
import { META_COST_SQL, AGENCY_COST_SQL, MAIL_COST_SQL, LSA_COST_SQL, CRM_COHORT_SQL, BUDGET_SQL, PLANNED_ONE_TIME_SQL } from "@/lib/acquisition-queries";

interface CostRow {
  source: string; id: string; channel: string; kind: CostEvidence["kind"]; date: string;
  amount: string | null; platform_leads?: string | null; synced_at: string | null;
  service_start?: string | null; service_end?: string | null; reference?: string | null; currency?: string;
}
interface CohortRow {
  source: string; job_records: string; contact_groups: string; existing_contacts: string;
  missing_contact_jobs: string; approved_job_records: string; approved_contact_groups: string;
  dated_signed_job_records: string; dated_signed_contact_groups: string;
  latest_sync: string | null; oldest_sync: string | null;
}
export async function GET(request: NextRequest) {
  const period = new URL(request.url).searchParams.get("period") ?? "last_month";
  if (!isValidPeriodKey(period)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  const window = reportingWindow(period);
  const unavailableSources: string[] = [];
  const optional = <T,>(name: string, sql: string, params: unknown[]) => query<T>(sql,params)
    .catch(() => { unavailableSources.push(name); return null; });
  try {
    const [meta,agency,mail,lsa,cohorts,budget,planned] = await Promise.all([
      optional<CostRow>("meta_ads_daily_insights",META_COST_SQL,[META_ACCOUNT]),
      optional<CostRow>("meta_ads_agency_cost_events",AGENCY_COST_SQL,[META_ACCOUNT]),
      optional<CostRow>("marketing_campaigns",MAIL_COST_SQL,[]),
      optional<CostRow>("lsa_leads",LSA_COST_SQL,[]),
      query<CohortRow>(CRM_COHORT_SQL,[Date.parse(window.start)/1000,Date.parse(window.end)/1000]),
      optional<{ amount: string; frequency: string | null }>("app_recurring_expenses",BUDGET_SQL,[window.startDate,window.endDate]),
      optional<{ amount: string | null }>("app_one_time_expenses",PLANNED_ONE_TIME_SQL,[window.startDate,window.endDate]),
    ]);
    const monthlyFactors: Record<string,number> = {monthly:1,weekly:52/12,biweekly:26/12,quarterly:1/3,annual:1/12,annually:1/12,yearly:1/12,daily:30};
    const monthlyKnown = budget && budget.length>0 && budget.every(r=>monthlyFactors[(r.frequency??"monthly").toLowerCase()]!==undefined);
    return NextResponse.json(buildAcquisitionReport({ window, unavailableSources,
      costs: [...(meta??[]),...(agency??[]),...(mail??[]),...(lsa??[])].map(r=>({
        source:r.source,id:r.id,channel:reportingChannel(r.channel),kind:r.kind,date:r.date,
        amount:r.amount===null?null:Number(r.amount),platformLeads:r.platform_leads==null?null:Number(r.platform_leads),
        syncedAt:r.synced_at,serviceStart:r.service_start,serviceEnd:r.service_end,reference:r.reference,currency:r.currency,
      })),
      cohorts: cohorts.map(r=>({channel:reportingChannel(r.source),jobRecords:Number(r.job_records),contactGroups:Number(r.contact_groups),
        existingContacts:Number(r.existing_contacts),missingContactJobs:Number(r.missing_contact_jobs),
        approvedJobRecords:Number(r.approved_job_records),approvedContactGroups:Number(r.approved_contact_groups),datedSignedJobRecords:Number(r.dated_signed_job_records),datedSignedContactGroups:Number(r.dated_signed_contact_groups),latestSync:r.latest_sync,oldestSync:r.oldest_sync})),
      budget:{ recurringMonthly:monthlyKnown ? Math.round(budget.reduce((n,r)=>n+Number(r.amount)*monthlyFactors[(r.frequency??"monthly").toLowerCase()],0)*100)/100:null,
        oneTimePlanned:planned?.[0]?.amount==null?null:Number(planned[0].amount) },
    }));
  } catch {
    return NextResponse.json({error:"CRM cohort evidence unavailable; acquisition metrics were not calculated."},{status:503});
  }
}
