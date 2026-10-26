(function () {
  const LOW_DIST = 25.0;
  const HIGH_DIST = 51.2;

  const centers = [
    4.5,
    5.5,
    6.675,
    7.7
  ];

  function clampDistance(d) {
    return Math.min(Math.max(d, LOW_DIST), HIGH_DIST);
  }

  function calculateWidth(distance) {
    const clamped = clampDistance(distance);
    return (0.1522 * clamped + 0.1957);
  }

  function erfUpdate(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const poly = (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t);
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
      return 1.0 - phi / (ax + 1.0 / (ax + 2.0 / (ax + 3.0)));
    }

    return phi / (ax + 1.0 / (ax + 2.0 / (ax + 3.0)));
  }

  function probabilityInRange(lower, upper, measuredValue, sd) {
    const zLower = (lower - measuredValue) / sd;
    const zUpper = (upper - measuredValue) / sd;

    return (phiUpdate(zUpper) - phiUpdate(zLower)) * 100;
  }

  function computeWeightedEstimate(probabilities, centers) {
    const total = probabilities.reduce((a, b) => a + b, 0);

    if (total === 0) {
      return centers[0];
    }

    let weighted = 0;

    for (let i = 0; i < probabilities.length; i++) {
      weighted += centers[i] * probabilities[i];
    }

    return weighted / total;
  }

  function computeWidthFromHeight(heightIn) {

    const est = calculateWidth(heightIn);

    const probs = [
      probabilityInRange(4.0, 5.25, est, 0.2) / 100,
      probabilityInRange(5.0, 6.3,  est, 0.2) / 100,
      probabilityInRange(6.0, 7.35, est, 0.2) / 100,
      probabilityInRange(7.0, 8.4,  est, 0.2) / 100
    ].map(p => Math.min(Math.max(p, 0), 1));

    return computeWeightedEstimate(probs, centers);
  }

  window.KneeModel = {
    computeWidthFromHeight,
    calculateWidth
  };

})();