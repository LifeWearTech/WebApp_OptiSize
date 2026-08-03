
function normalize(code) {
  let d = String(code || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("0")) d = d.slice(1);
  return d;
}

export async function findProductByBarcode(barcode) {
  const res = await fetch("/assets/ProductData/ProductsJsonFile.json");
  const products = await res.json();

  const scanned = normalize(barcode);
  return products.find(p => !p.obsolete && normalize(p.id) === scanned) || null;
}
