// Utility cost estimation engine
// Data sources: Move.org 2025, EIA, ApartmentList, SolarTech

export interface UtilityEstimates {
  electricity: number;
  gas: number;
  water: number;
  sewer: number;
  trash: number;
  internet: number;
  total: number;
}

export interface UtilityInputs {
  stateCode: string;
  squareFootage: number;
  bedrooms: number;
  // User overrides (null = use estimate)
  electricityOverride: number | null;
  gasOverride: number | null;
  waterOverride: number | null;
  sewerOverride: number | null;
  trashOverride: number | null;
  internetOverride: number | null;
}

// State-level average monthly utility costs for a typical home
// Source: Move.org 2025, EIA data, ApartmentList
const STATE_UTILITY_DATA: Record<string, {
  electricity: number;
  gas: number;
  water: number;
  sewer: number;
  trash: number;
  internet: number;
}> = {
  AL: { electricity: 184, gas: 58, water: 59, sewer: 91, trash: 63, internet: 74 },
  AK: { electricity: 144, gas: 126, water: 92, sewer: 71, trash: 63, internet: 104 },
  AZ: { electricity: 155, gas: 52, water: 58, sewer: 49, trash: 63, internet: 75 },
  AR: { electricity: 132, gas: 92, water: 35, sewer: 36, trash: 63, internet: 80 },
  CA: { electricity: 160, gas: 56, water: 115, sewer: 57, trash: 63, internet: 101 },
  CO: { electricity: 101, gas: 79, water: 45, sewer: 76, trash: 63, internet: 69 },
  CT: { electricity: 192, gas: 89, water: 45, sewer: 44, trash: 63, internet: 72 },
  DE: { electricity: 153, gas: 82, water: 68, sewer: 85, trash: 63, internet: 81 },
  DC: { electricity: 106, gas: 59, water: 41, sewer: 86, trash: 63, internet: 118 },
  FL: { electricity: 160, gas: 35, water: 38, sewer: 51, trash: 63, internet: 83 },
  GA: { electricity: 158, gas: 109, water: 43, sewer: 93, trash: 63, internet: 74 },
  HI: { electricity: 207, gas: 74, water: 85, sewer: 69, trash: 63, internet: 98 },
  ID: { electricity: 105, gas: 55, water: 55, sewer: 65, trash: 63, internet: 75 },
  IL: { electricity: 118, gas: 88, water: 40, sewer: 48, trash: 63, internet: 72 },
  IN: { electricity: 140, gas: 90, water: 37, sewer: 69, trash: 63, internet: 70 },
  IA: { electricity: 107, gas: 83, water: 29, sewer: 47, trash: 63, internet: 76 },
  KS: { electricity: 127, gas: 99, water: 39, sewer: 59, trash: 63, internet: 65 },
  KY: { electricity: 135, gas: 85, water: 42, sewer: 55, trash: 63, internet: 75 },
  LA: { electricity: 145, gas: 65, water: 45, sewer: 60, trash: 63, internet: 78 },
  ME: { electricity: 158, gas: 75, water: 35, sewer: 40, trash: 63, internet: 80 },
  MD: { electricity: 168, gas: 89, water: 60, sewer: 52, trash: 63, internet: 75 },
  MA: { electricity: 150, gas: 113, water: 38, sewer: 36, trash: 63, internet: 94 },
  MI: { electricity: 122, gas: 90, water: 27, sewer: 43, trash: 63, internet: 67 },
  MN: { electricity: 108, gas: 83, water: 36, sewer: 45, trash: 63, internet: 69 },
  MS: { electricity: 159, gas: 73, water: 38, sewer: 55, trash: 63, internet: 71 },
  MO: { electricity: 135, gas: 126, water: 75, sewer: 139, trash: 63, internet: 73 },
  MT: { electricity: 106, gas: 66, water: 50, sewer: 56, trash: 63, internet: 123 },
  NE: { electricity: 117, gas: 79, water: 35, sewer: 74, trash: 63, internet: 55 },
  NV: { electricity: 125, gas: 67, water: 72, sewer: 25, trash: 63, internet: 75 },
  NH: { electricity: 137, gas: 78, water: 40, sewer: 45, trash: 63, internet: 82 },
  NJ: { electricity: 127, gas: 85, water: 55, sewer: 60, trash: 63, internet: 78 },
  NM: { electricity: 95, gas: 55, water: 42, sewer: 40, trash: 63, internet: 70 },
  NY: { electricity: 144, gas: 90, water: 55, sewer: 65, trash: 63, internet: 85 },
  NC: { electricity: 146, gas: 68, water: 42, sewer: 55, trash: 63, internet: 75 },
  ND: { electricity: 118, gas: 75, water: 30, sewer: 35, trash: 63, internet: 65 },
  OH: { electricity: 135, gas: 88, water: 45, sewer: 65, trash: 63, internet: 72 },
  OK: { electricity: 130, gas: 75, water: 48, sewer: 55, trash: 63, internet: 72 },
  OR: { electricity: 140, gas: 72, water: 65, sewer: 75, trash: 63, internet: 80 },
  PA: { electricity: 146, gas: 85, water: 50, sewer: 60, trash: 63, internet: 75 },
  RI: { electricity: 179, gas: 80, water: 40, sewer: 45, trash: 63, internet: 78 },
  SC: { electricity: 155, gas: 55, water: 40, sewer: 50, trash: 63, internet: 75 },
  SD: { electricity: 126, gas: 63, water: 28, sewer: 40, trash: 63, internet: 56 },
  TN: { electricity: 155, gas: 65, water: 39, sewer: 82, trash: 63, internet: 77 },
  TX: { electricity: 175, gas: 69, water: 66, sewer: 86, trash: 63, internet: 73 },
  UT: { electricity: 91, gas: 70, water: 63, sewer: 143, trash: 63, internet: 69 },
  VT: { electricity: 128, gas: 98, water: 18, sewer: 38, trash: 63, internet: 83 },
  VA: { electricity: 155, gas: 91, water: 40, sewer: 64, trash: 63, internet: 87 },
  WA: { electricity: 120, gas: 92, water: 81, sewer: 83, trash: 63, internet: 67 },
  WV: { electricity: 163, gas: 106, water: 121, sewer: 130, trash: 63, internet: 86 },
  WI: { electricity: 115, gas: 69, water: 20, sewer: 19, trash: 63, internet: 74 },
  WY: { electricity: 108, gas: 80, water: 55, sewer: 65, trash: 63, internet: 75 },
};

// Default/national averages
const NATIONAL_AVG = {
  electricity: 138,
  gas: 85,
  water: 49,
  sewer: 67,
  trash: 63,
  internet: 77,
};

// Scale factor by square footage (base = ~1800 sqft typical home)
function getSqftScale(sqft: number): number {
  const baseSqft = 1800;
  // Not linear — diminishing returns. Use sqrt-based scaling
  return Math.pow(sqft / baseSqft, 0.6);
}

// Scale factor for bedrooms (affects water/sewer primarily)
function getBedroomWaterScale(bedrooms: number): number {
  // More bedrooms = more people = more water
  const baseOccupancy = 2.5; // avg household
  const estOccupancy = Math.max(1, bedrooms * 0.8);
  return estOccupancy / baseOccupancy;
}

export function estimateUtilities(inputs: UtilityInputs): UtilityEstimates {
  const stateData = STATE_UTILITY_DATA[inputs.stateCode] || NATIONAL_AVG;
  const sqftScale = getSqftScale(inputs.squareFootage || 1800);
  const waterScale = getBedroomWaterScale(inputs.bedrooms || 3);

  // Electricity and gas scale with home size
  const electricity = inputs.electricityOverride ?? Math.round(stateData.electricity * sqftScale);
  const gas = inputs.gasOverride ?? Math.round(stateData.gas * sqftScale);
  
  // Water and sewer scale more with occupancy than size
  const water = inputs.waterOverride ?? Math.round(stateData.water * waterScale);
  const sewer = inputs.sewerOverride ?? Math.round(stateData.sewer * waterScale);
  
  // Trash and internet are flat fees
  const trash = inputs.trashOverride ?? stateData.trash;
  const internet = inputs.internetOverride ?? stateData.internet;

  return {
    electricity,
    gas,
    water,
    sewer,
    trash,
    internet,
    total: electricity + gas + water + sewer + trash + internet,
  };
}

export function getStateUtilityData(stateCode: string) {
  return STATE_UTILITY_DATA[stateCode] || NATIONAL_AVG;
}
