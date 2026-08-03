
// ---------------------------------------------------------
// WidthModeliOS.js — Dart → JS translation of knee-width model
// ---------------------------------------------------------

export const LOW_DIST = 30.0;
export const HIGH_DIST = 40.0;

export function clampDistance(d) {
  return Math.min(Math.max(d, LOW_DIST), HIGH_DIST);
}



export function calculateWidth(distance) {
  const clamped = clampDistance(distance);
  return (0.2 * clamped - 3.0);
}



function erfUpdate(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p  = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const poly = (((((a5*t + a4)*t + a3)*t + a2)*t + a1)*t);
  const y = 1.0 - poly * Math.exp(-x * x);

  return Math.min(Math.max(sign * y, -1), 1);
}

function phiUpdate(x) {
  const sqrt2 = 1.4142135623730951;
  const ax = Math.abs(x);

  if (ax < 8.0) {
    return 0.5 * (1.0 + erfUpdate(x / sqrt2));
  }

  const invSqrt2pi = 0.3989422804014327;
  const phi = invSqrt2pi * Math.exp(-0.5 * x * x);

  if (x > 0) {
    return 1.0 - phi / (ax + 1.0/(ax + 2.0/(ax + 3.0)));
  } else {
    return phi / (ax + 1.0/(ax + 2.0/(ax + 3.0)));
  }
}

function probabilityInRange(lower, upper, measuredValue, sd) {
  const tolU = 0.00 * upper;
  const tolL = 0.00 * lower;

  const adjUpper = upper - tolU;
  const adjLower = lower - tolL;

  const zLower = (adjLower - measuredValue) / sd;
  const zUpper = (adjUpper - measuredValue) / sd;

  const prob = phiUpdate(zUpper) - phiUpdate(zLower);
  return prob * 100.0;
}

function computeWeightedEstimate(probabilities, centers) {
  if (!probabilities.length ||
      !centers.length ||
      probabilities.length !== centers.length) {
    throw new Error("Probabilities and centers must match.");
  }

  const total = probabilities.reduce((a,b)=>a+b, 0);
  if (total === 0) return centers[0];

  let weighted = 0;
  for (let i = 0; i < probabilities.length; i++) {
    weighted += centers[i] * probabilities[i];
  }
  return weighted / total;
}

export function computeWidthFromHeight(heightIn) {

  const est = calculateWidth(heightIn);

  const probs = [
    probabilityInRange(3.0, 3.6, est, 0.05) / 100.0,
    probabilityInRange(3.5, 4.1,  est, 0.05) / 100.0,
    probabilityInRange(4.0, 4.6, est, 0.05) / 100.0,
    probabilityInRange(4.5, 5.25,  est, 0.05) / 100.0
  ].map(p => Math.min(Math.max(p, 0), 1));

  const centers = [3.25, 3.75, 4.25, 4.75];

  const finalWidth = computeWeightedEstimate(probs, centers);

  return finalWidth;
}


// ✅ THIS LINE FIXES THE FREEZE
window.computeWidthFromHeight = computeWidthFromHeight;