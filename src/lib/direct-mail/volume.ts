import type { WeeklyReview } from "./weekly";

export type MailPieceEvidence =
  | "Confirmed mailed"
  | "Vendor invoice"
  | "Postal statement"
  | "Pending";

export function monthlyMailVolume(d: WeeklyReview) {
  const campaignById = new Map(d.campaigns.map((campaign) => [campaign.id, campaign]));

  return d.months.map((month) => {
    const campaigns = d.campaigns.filter((campaign) =>
      campaign.requestedDate.startsWith(month.month),
    );
    const allConfirmed =
      campaigns.length > 0 &&
      campaigns.every((campaign) => campaign.confirmedMailed !== null);
    const confirmedPieces = allConfirmed
      ? campaigns.reduce(
          (sum, campaign) => sum + (campaign.confirmedMailed ?? 0),
          0,
        )
      : null;
    const invoicePieces = d.invoices
      .filter((invoice) => invoice.serviceMonth === month.month)
      .reduce((sum, invoice) => sum + invoice.pieces, 0);
    const postalPieces = (d.costReview?.allocations ?? [])
      .filter(
        (allocation) =>
          allocation.postal &&
          campaignById
            .get(allocation.campaignId)
            ?.requestedDate.startsWith(month.month),
      )
      .reduce((sum, allocation) => sum + (allocation.postal?.pieces ?? 0), 0);

    let documentedPieces: number | null = null;
    let evidence: MailPieceEvidence = "Pending";
    if (confirmedPieces !== null) {
      documentedPieces = confirmedPieces;
      evidence = "Confirmed mailed";
    } else if (invoicePieces > 0) {
      documentedPieces = invoicePieces;
      evidence = "Vendor invoice";
    } else if (postalPieces > 0) {
      documentedPieces = postalPieces;
      evidence = "Postal statement";
    }

    return {
      month: month.month,
      leads: month.leads,
      requested: month.requested,
      packages: campaigns.length,
      averageRequest: campaigns.length
        ? Math.round(month.requested / campaigns.length)
        : null,
      documentedPieces,
      evidence,
    };
  });
}
