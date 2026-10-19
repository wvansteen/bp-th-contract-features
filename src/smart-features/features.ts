export type SmartFeature = { name: string; prompt: string };

// Names must be unique. If there are duplicates then the last wins.
export const SMART_FEATURES: readonly SmartFeature[] = [
  {
    name: "counterparty_name",
    prompt:
      'The name of the organization the County of Lake is contracting with, usually right after "between" or "and" in the agreement\'s opening paragraph. Ignore the County of Lake itself and any subcontractors or teaming partners. Return the organization name exactly as written, for example `Stanley Consultants, Inc.`.',
  },
  {
    name: "counterparty_address",
    prompt:
      "The street address of the organization the County of Lake is contracting with, stated beside its name in the opening paragraph or in the signature block. Ignore addresses belonging to the County of Lake, subcontractors, or project locations. Return the address exactly as written.",
  },
  {
    name: "effective_date",
    prompt:
      'The date the agreement becomes effective. Prefer a date labeled "Effective Date" or introduced by "effective as of". If the agreement is effective on execution or when the last party signs, use the date of the latest signature shown in the document. Return the date exactly as written, for example `11/22/2022`.',
  },
  {
    name: "expiration_date",
    prompt:
      'The date the agreement ends. Prefer an explicit end or expiration date, for example "through September 30, 2024". Otherwise use the end of the initial term as stated in the term section. Ignore renewal option periods. Return the date exactly as written.',
  },
  {
    name: "basis",
    prompt:
      "The phrase in the agreement's price, fee, or compensation section that shows how the contractor is paid: a fixed fee, a not-to-exceed amount, or billing rates alone. Return that phrase exactly as written, for example `FIXED FEES`, `not-to-exceed amount of $20,000`, or `2024 Billing Rates`.",
  },
  {
    name: "yearly_cost",
    prompt:
      'The dollar amount the agreement states per year or per fiscal year, for example `$1,000,000` in "shall not exceed $1,000,000 in a fiscal year". Ignore hourly rates, one-time fees, and total contract values. Return the amount exactly as written.',
  },
  {
    name: "total_cost",
    prompt:
      'The dollar amount stated as the total value of the agreement or the engagement, for example `$20,300.00` in "the amount invoiced for the Services will be $20,300.00". Ignore per-year caps and individual hourly rates. Return the amount exactly as written.',
  },
  {
    name: "category",
    prompt:
      "The words that say what kind of agreement this is, usually the document's title or first heading, for example `STATEMENT OF WORK`, `AGREEMENT #24216-3 FOR PROFESSIONAL SERVICES`, or `Master Service Agreement`. Return that text exactly as written.",
  },
  {
    name: "purpose_summary",
    prompt:
      "The sentences in the agreement's scope of work or project description that say what the work is for, for example the description under \"SECTION 2. SCOPE OF WORK\". Prefer the executed agreement's scope over proposal, cover letter, or solicitation text. Return those sentences exactly as written.",
  },
  {
    name: "contract_id",
    prompt:
      "The identifier of this agreement or order as the County numbers it, usually in a heading like `AGREEMENT #23173-5`, `SOW 141301`, or `Purchasing Agreement # 2019.001564`. Return only the identifier, for example `23173-5`.",
  },
  {
    name: "solicitation_id",
    prompt:
      "The identifier of the solicitation this agreement was awarded under, labeled SOI, RFP, RFQ, or solicitation number, for example `SOI No. 23173`. Return only the identifier, for example `23173`. If the agreement comes from a cooperative purchasing program with no County solicitation, return nothing.",
  },
  {
    name: "renewal_terms",
    prompt:
      'The sentences that state the renewal options: how many renewal periods, how long each one is, and any notice required, for example "UC may renew the Agreement for Five (5) successive One (1)-year periods". Prefer the executed agreement over solicitation or proposal text. Return those sentences exactly as written.',
  },
  {
    name: "payment_terms",
    prompt:
      'The sentences that state when and how the County pays, for example "Lake County shall make periodic payments to Consultant based upon actual progress within 30 days after receipt and approval of invoice". Include invoice or purchase order requirements that control payment timing. Return those sentences exactly as written.',
  },
];
