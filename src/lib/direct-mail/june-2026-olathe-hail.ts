export type DirectMailCampaignStatus =
  | "intake"
  | "sent_to_ron"
  | "confirmed_sent"
  | "responding"
  | "resend_due";

export interface DirectMailCampaignCell {
  id: string;
  name: string;
  city: string;
  county: string;
  segment: "storm_insurance";
  touch: number;
  sheetRows: number;
  usableRows: number;
  status: DirectMailCampaignStatus;
  sentToRonAt: string | null;
  confirmedSentAt: string | null;
  sourceSheetTab: string;
  notes: string;
  map: {
    x: number;
    y: number;
    radius: number;
  };
}

export const DIRECT_MAIL_BATCH = {
  id: "2026-06-10-april-26-olathe-hail",
  label: "April 26 Hail - Olathe West / NW Cells",
  googleFolderUrl:
    "https://drive.google.com/drive/folders/1h0_qordr8zV-7s5H-fRAf1Y2z-RpZzLm",
  googleSheetUrl:
    "https://docs.google.com/spreadsheets/d/130mOajlXsx3hkHjwHcUWLmquMYaxYHLrjkh6L2BLsLM/edit?gid=141047032#gid=141047032",
  sourceMessage: "April storm inspection / claim guidance",
  importedAt: "2026-06-10T10:27:39-05:00",
};

export const DIRECT_MAIL_CAMPAIGNS: DirectMailCampaignCell[] = [
  {
    id: "brookfield-park-2026-06-10",
    name: "Brookfield Park",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 431,
    usableRows: 431,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T11:46:15-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Brookfield Park",
    notes: "Template PDF was reviewed from Downloads/Hail April 27.pdf.",
    map: { x: 46, y: 41, radius: 4.7 },
  },
  {
    id: "canyon-creek-2026-06-10",
    name: "Canyon Creek",
    city: "Shawnee",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 498,
    usableRows: 498,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T11:47:28-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Canyon Creek",
    notes: "Western Shawnee campaign cell; farther north than the core Olathe batch.",
    map: { x: 33, y: 25, radius: 5.1 },
  },
  {
    id: "cedar-creek-outskirts-2026-06-10",
    name: "Cedar Creek Outskirts",
    city: "Olathe / De Soto",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 307,
    usableRows: 307,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T11:48:40-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Cedar Creek Outskirts",
    notes: "Includes 98 De Soto rows; keep if this is intentional for the boundary.",
    map: { x: 18, y: 47, radius: 4.0 },
  },
  {
    id: "cedar-niles-park-2026-06-10",
    name: "Cedar Niles Park",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 1405,
    usableRows: 1403,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T11:49:48-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Cedar Niles Park",
    notes: "Two NS rows should be excluded from internal sync even if printer strips them.",
    map: { x: 24, y: 54, radius: 8.0 },
  },
  {
    id: "clearwater-creek-2026-06-10",
    name: "Clearwater Creek",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 447,
    usableRows: 447,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:02:06-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Clearwater Creek",
    notes: "Olathe west-side storm cell.",
    map: { x: 43, y: 55, radius: 4.8 },
  },
  {
    id: "concord-square-2026-06-10",
    name: "Concord Square",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 675,
    usableRows: 675,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:03:24-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Concord Square",
    notes: "Central Olathe campaign cell.",
    map: { x: 48, y: 48, radius: 5.8 },
  },
  {
    id: "edgmire-2026-06-10",
    name: "Edgmire",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 530,
    usableRows: 530,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:04:31-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Edgmire",
    notes: "Google tab spells Edgmire; row care-of values spell Edgemire.",
    map: { x: 50, y: 52, radius: 5.2 },
  },
  {
    id: "fairview-hills-2026-06-10",
    name: "Fairview Hills",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 304,
    usableRows: 304,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:06:42-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Fairview Hills",
    notes: "Smaller Olathe cell suitable for a clean first-touch campaign.",
    map: { x: 52, y: 43, radius: 4.0 },
  },
  {
    id: "hunters-creek-estates-2026-06-10",
    name: "Hunters Creek Estates",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 826,
    usableRows: 826,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:07:47-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Hunters Creek Estates",
    notes: "Large Olathe cell near the west-side storm corridor.",
    map: { x: 37, y: 61, radius: 6.7 },
  },
  {
    id: "lakeview-hills-2026-06-10",
    name: "Lakeview Hills",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 662,
    usableRows: 662,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:08:58-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Lakeview Hills",
    notes: "Tab title differs slightly from care-of values: Lake View Hills.",
    map: { x: 40, y: 50, radius: 5.7 },
  },
  {
    id: "olathe-west-2026-06-10",
    name: "Olathe West",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 349,
    usableRows: 349,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:10:13-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Olathe West",
    notes: "School-adjacent positioning can work here; avoid overclaiming exact school district fit.",
    map: { x: 35, y: 45, radius: 4.2 },
  },
  {
    id: "permission-hills-2026-06-10",
    name: "Permission Hills",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 983,
    usableRows: 983,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:11:06-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Permission Hills",
    notes: "Large Olathe cell; verify spelling if this should be Persimmon Hills.",
    map: { x: 55, y: 57, radius: 7.2 },
  },
  {
    id: "ravenwood-place-2026-06-10",
    name: "Ravenwood Place",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 896,
    usableRows: 896,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:12:03-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Ravenwood Place",
    notes: "Large Olathe campaign cell.",
    map: { x: 31, y: 58, radius: 6.9 },
  },
  {
    id: "rolling-ridge-south-2026-06-10",
    name: "Rolling Ridge South",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 311,
    usableRows: 311,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:12:44-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Rolling Ridge South",
    notes: "Smaller Olathe cell with blank grid rows below the real list.",
    map: { x: 50, y: 59, radius: 4.1 },
  },
  {
    id: "mahaffie-creek-2026-06-10",
    name: "Mahaffie Creek",
    city: "Olathe",
    county: "Johnson County",
    segment: "storm_insurance",
    touch: 1,
    sheetRows: 723,
    usableRows: 723,
    status: "sent_to_ron",
    sentToRonAt: "2026-06-10T12:13:28-05:00",
    confirmedSentAt: null,
    sourceSheetTab: "Mahaffie Creek",
    notes: "Northeast Olathe campaign cell.",
    map: { x: 58, y: 39, radius: 6.0 },
  },
];

export function getDirectMailSummary() {
  const totalSheetRows = DIRECT_MAIL_CAMPAIGNS.reduce(
    (sum, campaign) => sum + campaign.sheetRows,
    0
  );
  const totalUsableRows = DIRECT_MAIL_CAMPAIGNS.reduce(
    (sum, campaign) => sum + campaign.usableRows,
    0
  );
  const awaitingMailDate = DIRECT_MAIL_CAMPAIGNS.filter(
    (campaign) => campaign.status !== "confirmed_sent" && !campaign.confirmedSentAt
  ).length;
  const sentToMailhouse = DIRECT_MAIL_CAMPAIGNS.filter(
    (campaign) => campaign.sentToRonAt
  ).length;
  return {
    totalCampaigns: DIRECT_MAIL_CAMPAIGNS.length,
    totalSheetRows,
    totalUsableRows,
    pendingRon: awaitingMailDate,
    sentToMailhouse,
  };
}
