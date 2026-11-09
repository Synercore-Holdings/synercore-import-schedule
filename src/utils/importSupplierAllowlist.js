// Only these suppliers may come in through the international Excel import —
// every other row in the sheet is ignored. Matching is keyword-based on a
// normalized name (uppercase, accents stripped, punctuation removed) because
// the spreadsheets spell names inconsistently ("Qida Chemical Co. Ltd" vs
// "QIDA CHEMICAL", "AROMSA BESİN ... A.Ş." vs "AROMSA BESIN ... A.S.").
export const IMPORT_ALLOWED_SUPPLIERS = [
  { name: 'SACCO S.R.L', keys: ['SACCO'] },
  { name: 'AROMSA BESIN AROMA VE KATKI MADDELERI SAN. VE TIC. A.S.', keys: ['AROMSA'] },
  { name: 'Qida Chemical Co. Ltd', keys: ['QIDA'] },
  { name: 'GBH Bioscience', keys: ['GBH'] },
  { name: 'ECOLEX SDN. BHD', keys: ['ECOLEX'] },
  { name: 'DSM Nutritional Products SA (PTY) Ltd', keys: ['DSM'] },
  { name: 'JRS Silvateam Ingredients S.R.L.', keys: ['SILVATEAM', 'JRS'] },
  { name: 'TRISTAR GLOBAL SDN. BHD', keys: ['TRISTAR'] },
  { name: 'MARCEL CARRAGEENAN', keys: ['MARCEL'] },
  { name: 'KMC', keys: ['KMC'] },
  { name: 'Caglificio Clerici', keys: ['CAGLIFICIO', 'CLERICI'] },
  { name: 'Delta Iris', keys: ['DELTA IRIS'] },
];

const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export function isAllowedImportSupplier(supplier) {
  const n = normalize(supplier);
  if (!n) return false;
  const padded = ` ${n} `;
  return IMPORT_ALLOWED_SUPPLIERS.some(s => s.keys.some(k => padded.includes(` ${k} `)));
}
