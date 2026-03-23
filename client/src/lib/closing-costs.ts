// ─── Closing Costs Estimator ──────────────────
// Estimates buyer-side closing costs based on home price, loan amount, and state.
// All values are one-time costs paid at closing.

export interface ClosingCostInputs {
  homePrice: number;
  loanAmount: number;
  stateCode: string;
  // Override any line item (null = use estimate)
  loanOriginationOverride: number | null;
  appraisalOverride: number | null;
  creditReportOverride: number | null;
  titleSearchOverride: number | null;
  lenderTitleInsuranceOverride: number | null;
  ownerTitleInsuranceOverride: number | null;
  escrowFeeOverride: number | null;
  recordingFeeOverride: number | null;
  transferTaxOverride: number | null;
  homeInspectionOverride: number | null;
  pestInspectionOverride: number | null;
  surveyOverride: number | null;
  attorneyFeeOverride: number | null;
  prepaidInterestOverride: number | null;
  // Optional: user can toggle whether to include prepaids
  includePrepaidTaxes: boolean;
  includePrepaidInsurance: boolean;
}

export interface ClosingCostBreakdown {
  // Lender fees
  loanOrigination: number;
  appraisal: number;
  creditReport: number;
  // Title & escrow
  titleSearch: number;
  lenderTitleInsurance: number;
  ownerTitleInsurance: number;
  escrowFee: number;
  // Government
  recordingFee: number;
  transferTax: number;
  // Inspections
  homeInspection: number;
  pestInspection: number;
  survey: number;
  // Legal
  attorneyFee: number;
  // Prepaid
  prepaidInterest: number;
  // Totals
  totalLenderFees: number;
  totalTitleEscrow: number;
  totalGovernment: number;
  totalInspections: number;
  totalOther: number;
  totalClosingCosts: number;
}

// ─── State-level transfer tax rates ───
// Rates per $1,000 of sale price (buyer portion)
// Most states: buyer pays recording + some split of transfer tax
// In many states the seller pays transfer tax, but we include it as a line item
// the user can zero out if seller covers it.
const STATE_TRANSFER_TAX: Record<string, number> = {
  // Rate per $1,000 of sale price
  AL: 0.50, AK: 0, AZ: 0, AR: 1.10, CA: 1.10,
  CO: 0.01, CT: 7.50, DE: 4.00, FL: 0.70, GA: 1.00,
  HI: 0.10, ID: 0, IL: 0.50, IN: 0, IA: 0.80,
  KS: 0, KY: 0.50, LA: 0, ME: 2.20, MD: 2.50,
  MA: 2.28, MI: 3.75, MN: 1.65, MS: 0, MO: 0,
  MT: 0, NE: 2.25, NV: 1.95, NH: 7.50, NJ: 2.00,
  NM: 0, NY: 2.00, NC: 1.00, ND: 0, OH: 1.00,
  OK: 0.75, OR: 1.00, PA: 10.00, RI: 2.30, SC: 1.85,
  SD: 0, TN: 0.37, TX: 0, UT: 0, VT: 7.50,
  VA: 1.00, WA: 1.10, WV: 1.10, WI: 0.30, WY: 0,
  DC: 1.10,
};

// States that commonly require attorney at closing
const ATTORNEY_REQUIRED_STATES = new Set([
  "CT", "DE", "GA", "MA", "NY", "NC", "SC", "WV",
  "AL", "KY", "ME", "MD", "MS", "NH", "NJ", "RI", "VT", "VA",
]);

export function estimateClosingCosts(inputs: ClosingCostInputs): ClosingCostBreakdown {
  const { homePrice, loanAmount, stateCode } = inputs;

  // ─── Lender Fees ───
  // Loan origination: typically 0.5%–1% of loan amount
  const loanOrigination = inputs.loanOriginationOverride ?? Math.round(loanAmount * 0.0075);
  // Appraisal: $500–$800 depending on value
  const appraisal = inputs.appraisalOverride ?? (homePrice > 1000000 ? 800 : homePrice > 500000 ? 650 : 500);
  // Credit report: flat fee
  const creditReport = inputs.creditReportOverride ?? 50;

  // ─── Title & Escrow ───
  // Title search: $200–$400
  const titleSearch = inputs.titleSearchOverride ?? 350;
  // Lender's title insurance: roughly 0.05%–0.1% of loan
  const lenderTitleInsurance = inputs.lenderTitleInsuranceOverride ?? Math.round(loanAmount * 0.0006);
  // Owner's title insurance: roughly 0.1%–0.3% of purchase price
  const ownerTitleInsurance = inputs.ownerTitleInsuranceOverride ?? Math.round(homePrice * 0.002);
  // Escrow fee: typically $1–$2 per $1,000 of sale price
  const escrowFee = inputs.escrowFeeOverride ?? Math.round(homePrice * 0.0015);

  // ─── Government Fees ───
  // Recording: flat $100–$250
  const recordingFee = inputs.recordingFeeOverride ?? 200;
  // Transfer tax: state-specific rate per $1,000
  const taxRate = STATE_TRANSFER_TAX[stateCode] || 1.10;
  const transferTax = inputs.transferTaxOverride ?? Math.round((homePrice / 1000) * taxRate);

  // ─── Inspections ───
  const homeInspection = inputs.homeInspectionOverride ?? (homePrice > 1000000 ? 700 : homePrice > 500000 ? 550 : 400);
  const pestInspection = inputs.pestInspectionOverride ?? 200;
  const survey = inputs.surveyOverride ?? 0; // not always required

  // ─── Legal ───
  const attorneyFee = inputs.attorneyFeeOverride ?? (ATTORNEY_REQUIRED_STATES.has(stateCode) ? 1500 : 0);

  // ─── Prepaid Interest ───
  // ~15 days of interest (average closing mid-month)
  const dailyInterest = loanAmount > 0 ? (loanAmount * 0.07) / 365 : 0; // use ~7% as a reasonable estimate
  const prepaidInterest = inputs.prepaidInterestOverride ?? Math.round(dailyInterest * 15);

  // ─── Category Totals ───
  const totalLenderFees = loanOrigination + appraisal + creditReport;
  const totalTitleEscrow = titleSearch + lenderTitleInsurance + ownerTitleInsurance + escrowFee;
  const totalGovernment = recordingFee + transferTax;
  const totalInspections = homeInspection + pestInspection + survey;
  const totalOther = attorneyFee + prepaidInterest;
  const totalClosingCosts = totalLenderFees + totalTitleEscrow + totalGovernment + totalInspections + totalOther;

  return {
    loanOrigination,
    appraisal,
    creditReport,
    titleSearch,
    lenderTitleInsurance,
    ownerTitleInsurance,
    escrowFee,
    recordingFee,
    transferTax,
    homeInspection,
    pestInspection,
    survey,
    attorneyFee,
    prepaidInterest,
    totalLenderFees,
    totalTitleEscrow,
    totalGovernment,
    totalInspections,
    totalOther,
    totalClosingCosts,
  };
}

// Helper: format as percentage of home price
export function closingCostPercentage(totalClosingCosts: number, homePrice: number): string {
  if (homePrice <= 0) return "0%";
  return (totalClosingCosts / homePrice * 100).toFixed(1) + "%";
}
