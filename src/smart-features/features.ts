export type SmartFeature = { name: string; prompt: string };

// Names must be unique. If there are duplicates then the last wins.
export const SMART_FEATURES: readonly SmartFeature[] = [
  {
    name: "counterparty_name",
    prompt:
      "The organization the County of Lake is contracting with, named near the top of the agreement or letter. Ignore the County of Lake, its departments, individual people, and subcontractors. Return only the organization's name.",
  },
  {
    name: "counterparty_address",
    prompt:
      "The full mailing address of that organization, as written beside or below its name. If the address is split across lines, join them with one space and include city, state, and ZIP. Ignore County of Lake addresses and email addresses.",
  },
  {
    name: "effective_date",
    prompt:
      "The single date the agreement starts. Prefer a date labeled Effective Date; otherwise take the first date of a stated contract period. If the agreement is effective on signing, take the latest signature date. Never return a date range and never the expiry of a contract being renewed. Return only that one date.",
  },
  {
    name: "expiration_date",
    prompt:
      "The single date the agreement ends. Prefer a date labeled Expiration or End Date; otherwise take the last date of a stated contract period. In a renewal, that is the end of the renewed period, not the expiry of the prior term. Never return a date range. Return only that one date.",
  },
  {
    name: "basis",
    prompt:
      "Return exactly one word for how the contractor is paid: fixed_fee, not_to_exceed, or rate_schedule_only. Use fixed_fee for a set total price, not_to_exceed for a stated spending cap, rate_schedule_only when only hourly or unit rates appear. Return nothing if the document states no price structure.",
  },
  {
    name: "yearly_cost",
    prompt:
      "The dollar amount the agreement states per year or per fiscal year. Use only amounts from the agreement's own price or payment terms; never amounts from form filing thresholds, penalties, insurance limits, or hourly rates. Return only the amount as written, or nothing if not stated.",
  },
  {
    name: "total_cost",
    prompt:
      "The dollar amount stated as the total value of the agreement or engagement. Use only amounts from the agreement's own price or payment terms; never yearly caps, hourly rates, form filing thresholds, or penalty amounts. Return only the amount as written, or nothing if not stated.",
  },
  {
    name: "category",
    prompt:
      "Return exactly one word for the kind of agreement: professional_services, technology_services, equipment_maintenance, goods, construction, or lease. Classify from what the agreement is for, not from attached forms. Return nothing if the document gives no basis to classify.",
  },
  {
    name: "purpose_summary",
    prompt:
      "The document's own words for what the contract is for: the value of a Contract Description or Scope of Work line, or the scope sentences of the agreement. Return that text as written with its field label removed.",
  },
  {
    name: "contract_id",
    prompt:
      "The County's number for this agreement, from a line labeled Contract, Agreement, SOW, or Renewal. Return only the identifier itself, a run of letters and numbers, with no label words around it.",
  },
  {
    name: "solicitation_id",
    prompt:
      "The identifier of the solicitation this agreement was awarded under, and only when the document presents one as SOI, RFP, or RFQ. A contract or renewal number is not a solicitation number. Return only the identifier, or nothing if no solicitation is named.",
  },
  {
    name: "renewal_terms",
    prompt:
      "The sentences that renew, extend, or give notice about renewing the term: renewal periods, extension language, or notice to renew. Ignore insurance, disclosure, and signature instructions. Return those sentences as written, or nothing if not stated.",
  },
  {
    name: "payment_terms",
    prompt:
      "The sentences that state when or how the County pays: payment timing, invoicing, or net terms. Ignore disclosure forms, acknowledgments, and renewal-notice wording. Return those sentences as written, or nothing if not stated.",
  },
];
