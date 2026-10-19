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
      "The full mailing address of that organization, as written beside or below its name. If the address is split across lines, join them with one space and include city, state, and ZIP. Return only the street, city, state, and ZIP: never a person's name, the organization's name, or an email address.",
  },
  {
    name: "effective_date",
    prompt:
      "The single date the agreement starts. Prefer a date labeled Effective Date; otherwise take the first date of a stated contract period. If the agreement is effective on signing, take the latest signature date. Never return a date range and never the expiry of a contract being renewed. Return only that one date.",
  },
  {
    name: "expiration_date",
    prompt:
      "The single date the agreement ends. Prefer a date labeled Expiration or End Date; otherwise take the last date of a stated contract period. In a renewal, that is the end of the renewed period, not the expiry of the prior term. A signature date is not an expiration date. Never return a date range. Return only that one date.",
  },
  {
    name: "basis",
    prompt:
      "Return exactly one word for how the contractor is paid: fixed_fee, not_to_exceed, or rate_schedule_only, and only when the document states a price, a spending cap, or rates. Use fixed_fee for a set total price, not_to_exceed for a stated spending cap, rate_schedule_only when only hourly or unit rates appear. Never guess a word from the list; when the document states no price structure, reply NOTHING.",
  },
  {
    name: "yearly_cost",
    prompt:
      "The dollar amount the agreement states per year or per fiscal year, copied exactly as printed. Use only amounts from the agreement's own price or payment terms; never amounts from form filing thresholds, penalties, insurance limits, or hourly rates. Zero and invented amounts are never answers. When no yearly amount is printed, reply NOTHING.",
  },
  {
    name: "total_cost",
    prompt:
      "The dollar amount stated as the total value of the agreement or engagement, copied exactly as printed, never a fragment of a sentence. Use only amounts from the agreement's own price or payment terms; never yearly caps, hourly rates, form filing thresholds, or penalty amounts. Zero and invented amounts are never answers. When no total is printed, reply NOTHING.",
  },
  {
    name: "category",
    prompt:
      "Return exactly one word for the kind of agreement: professional_services, technology_services, equipment_maintenance, goods, construction, or lease. Words outside that list are invalid, and classify from what the agreement is for, not from attached forms. When the document gives no basis to classify, reply NOTHING.",
  },
  {
    name: "purpose_summary",
    prompt:
      "The document's own words for what the contract is for: the value of a Contract Description or Scope of Work line, or the scope sentences of the agreement. Form titles and form field labels are not a description. Return that text as written with its field label removed, or reply NOTHING when the document has no description or scope text.",
  },
  {
    name: "contract_id",
    prompt:
      "The County's number for this agreement, from a line labeled Contract, Agreement, SOW, or Renewal. Return only the bare identifier: the letters and digits themselves, with no words like Contract or Renewal and no punctuation like a hash sign. When no number is present, reply NOTHING.",
  },
  {
    name: "solicitation_id",
    prompt:
      "The bare identifier of the solicitation this agreement was awarded under, and only when the document presents one as its SOI or RFP number. A form field that runs several kinds of numbers together, such as Bid/RFP/SOI/Contract/Renewal, is not a solicitation reference, and a contract or renewal number is never a solicitation number. When none is presented, reply NOTHING.",
  },
  {
    name: "renewal_terms",
    prompt:
      "The sentences that renew, extend, or give notice about renewing the term: renewal periods, extension language, or notice to renew. Ignore insurance and certificate sentences even when they mention renewal, and never return a bare number. When not stated, reply NOTHING.",
  },
  {
    name: "payment_terms",
    prompt:
      "The sentences that state when or how the County pays, and only when they give a payment clock: days until payment, net terms, or when invoices are due. Ignore insurance, disclosure policy, renewal-notice wording, and date lines. When no sentence qualifies, reply NOTHING.",
  },
];
