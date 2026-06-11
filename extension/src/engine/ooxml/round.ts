// Python-compatible round() for byte-exact `details` parity with the oracle.
//
// Python `round()` uses banker's rounding (round-half-to-even); JS Math.round
// rounds half up. The OOXML `details` numbers (euclidean ΔE, size_pt) flow
// straight into the differential tuple, so they must match the Python value
// exactly. The corpus values are exact (ΔE=0, size_pt=1.0), but we port the
// real semantics so any future fixture stays parity-safe.
export function pyRound(value: number, ndigits: number): number {
  const m = 10 ** ndigits;
  const scaled = value * m;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1; // half → nearest even
  return rounded / m;
}
