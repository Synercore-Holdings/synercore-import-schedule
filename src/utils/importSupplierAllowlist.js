// The shipment Excel import only accepts rows whose supplier is set up in
// Supplier Management — every other row is ignored. To allow a new supplier,
// add it in Supplier Management first, then import.
//
// Names are compared after normalizing (uppercase, accents stripped,
// punctuation and legal suffixes like "Co. Ltd" / "(PTY)" / "SDN. BHD" /
// "S.R.L" / "A.Ş." removed), and a match is a whole-word containment either
// way, so "Qida Chemical Co. Ltd" matches "QIDA CHEMICAL" and
// "JRS Silvateam Ingredients S.R.L." matches "Silvateam".

const LEGAL_SUFFIXES = /\b(PTY|PROPRIETARY|LTD|LIMITED|CO|COMPANY|CC|INC|LLC|SA|S A|SRL|S R L|SPA|GMBH|BV|AS|A S|SDN|BHD|PLC|SAN VE TIC|TIC|SAN)\b/g;

export const normalizeSupplierName = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Returns (rowSupplierName) => boolean for the given list of known supplier names.
export function buildSupplierMatcher(supplierNames) {
  const keys = [...new Set((supplierNames || []).map(normalizeSupplierName).filter(k => k.length >= 3))];
  return (rowSupplier) => {
    const n = normalizeSupplierName(rowSupplier);
    if (!n) return false;
    const padded = ` ${n} `;
    return keys.some(k => padded.includes(` ${k} `) || (n.length >= 4 && ` ${k} `.includes(padded)));
  };
}
