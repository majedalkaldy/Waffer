// Server-only, optional production attribution. Format validation is not account approval.
export function getEbayAffiliateCampaignConfig(value) {
  const configured = value !== undefined && value !== null && value !== '';
  const valid = !configured || (typeof value === 'string' && value.length === 10 && /^[0-9]{10}$/.test(value));
  return { configured, valid, campaignId: configured && valid ? value : null };
}
