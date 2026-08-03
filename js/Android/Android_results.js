
// ---------------------------------------------------------
// results.js — Show products that FIT based on width
// ---------------------------------------------------------

/* ------------------------
   URL parameters
------------------------- */
const url = new URL(window.location.href);
const measuredWidth = parseFloat(url.searchParams.get("width")) || 0;
const type = url.searchParams.get("type") || "Knee";
const selectedProductId = url.searchParams.get("prod") || "";
const retailer = url.searchParams.get("retailer") || "All";

const container = document.getElementById("results-container");

/* ------------------------
   Helper: fit calculation
------------------------- */
function calculateFit(width, sizeRanges) {
  for (const size in sizeRanges) {
    const { low, high } = sizeRanges[size];
    if (width >= low && width <= high) {
      return size;
    }
  }
  return "No-Fit";
}

/* ------------------------
   Main logic
------------------------- */
async function loadAndEvaluate() {
  try {

    const dataUrl =
      selectedProductId && selectedProductId.length < 10
        ? "/assets/ProductData/ProductsJsonFileCompact.json"
        : "/assets/ProductData/ProductsJsonFile.json";

    const res = await fetch(dataUrl);
    const products = await res.json();

    // ✅ Filter ONLY by type (FIXED)
    const filtered = products.filter(p =>
      !p.obsolete &&
      p.product_type.toLowerCase() === type.toLowerCase()
    );

    /* -----------------------------------------------------
       MODE 1 — Selected product (Browse or Scan)
    ----------------------------------------------------- */
    if (selectedProductId !== "") {

      const product = products.find(p => p.id === selectedProductId);

      if (!product) {
        container.innerHTML = "<p>Product not found.</p>";
        return;
      }

      const fit = calculateFit(measuredWidth, product.size_ranges);

      renderProductCard(product, fit);

      if (fit === "No-Fit") {
        renderSeeRecommendationsButton(products, product);
      }

      return;
    }

    /* -----------------------------------------------------
       MODE 2 — Measure-only / Recommendation flow
    ----------------------------------------------------- */

    const fittingProducts = [];

    filtered.forEach(product => {

      // ✅ Apply retailer filter ONLY for measure flow
      if (
        retailer !== "All" &&
        product.Retail !== retailer
      ) {
        return;
      }

      const fit = calculateFit(measuredWidth, product.size_ranges);

      if (fit !== "No-Fit") {
        fittingProducts.push({ product, fit });
      }
    });

    if (fittingProducts.length === 0) {
      container.innerHTML =
        "<p>No products fit your measured size.</p>";
      renderSeeRecommendationsButton(products, null);
      return;
    }

    fittingProducts.sort(
      (a, b) => (b.product.rating || 0) - (a.product.rating || 0)
    );

    fittingProducts.forEach(entry => {
      renderProductCard(entry.product, entry.fit);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML =
      "<p>Error loading recommendations.</p>";
  }
}

/* ------------------------
   Helper display size
------------------------- */
function calculateDisplaySize(type, width) {
  if (type === "Knee") {
    if (width >= 4 && width < 5) return "S";
    if (width >= 5 && width < 6) return "M";
    if (width >= 6 && width < 7) return "L";
    if (width >= 7 && width <= 8) return "XL";
  }

  if (type === "Ankle") {
    if (width >= 3 && width < 3.75) return "S";
    if (width >= 3.75 && width < 4.5) return "M";
    if (width >= 4.5 && width < 5.25) return "L";
    if (width >= 4.25 && width <= 5) return "XL";
  }

  return "—";
}

/* ------------------------
   UI helpers
------------------------- */
function renderProductCard(product, fit) {

  const isNoFit = fit === "No-Fit";
  const displaySize = calculateDisplaySize(type, measuredWidth);

  const card = document.createElement("div");
  card.className = "product-card";

  card.innerHTML = `
    <img src="/${product.image}" class="product-image">

    <div class="fit-badge">
      Your Size: ${displaySize}
    </div>

    <div class="fit-badge ${isNoFit ? "no-fit" : ""}">
      Product Fit: ${fit}
      <span class="fit-check">
        ${isNoFit ? "❌" : "✔️"}
      </span>
    </div>

    <div class="product-title">${product.name}</div>

    ${product.desc.map(d =>
      `<div class="product-desc-line">• ${d}</div>`
    ).join("")}

    <div class="product-section-title">Sizes</div>
    ${product.sizes.map(s =>
      `<div class="product-size-line">• ${s}</div>`
    ).join("")}

    <div class="product-vendor"><strong>Retail:</strong> ${product.Retail}</div>
    <div class="product-vendor">
      Measured: ${measuredWidth.toFixed(2)} in
    </div>

    
<div class="product-disclaimer">
  Disclaimer: This is for optional testing and results may vary
</div>

  `;

  container.appendChild(card);
}

/* ------------------------
   See Recommendations
------------------------- */
function renderSeeRecommendationsButton(products, selectedProduct) {

  const btn = document.createElement("button");
  btn.textContent = "See Recommendations";

  btn.style.cssText = `
    display:block;
    margin: 2rem auto 0 auto;
    padding: 1rem 2rem;
    font-size: 20px;
    font-weight: bold;
    background: linear-gradient(135deg, #00c896, #009f75);
    color:white;
    border:none;
    border-radius:12px;
    cursor:pointer;
    box-shadow:0 6px 14px rgba(0,0,0,0.25);
  `;

  btn.onclick = () => {

    let effectiveRetailer = retailer;

    // ✅ FIX: force product retailer for browse/scan
    if (selectedProduct && selectedProduct.Retail) {
      effectiveRetailer = selectedProduct.Retail;
    }

    window.location.href =
      `/pages/Android/Android_results.html` +
      `?width=${measuredWidth}` +
      `&type=${type}` +
      `&retailer=${encodeURIComponent(effectiveRetailer)}`;
  };

  container.appendChild(btn);
}


/* ------------------------
   Home Button
------------------------- */

const homeBtn = document.createElement("a");

homeBtn.href =
  "/main_Android.html";

homeBtn.innerHTML =
  '<span class="material-icons">home</span>';

homeBtn.style.position = "fixed";
homeBtn.style.top = "16px";
homeBtn.style.right = "16px";

homeBtn.style.color = "#2563eb";
homeBtn.style.textDecoration = "none";

homeBtn.style.zIndex = "1000";

document.body.appendChild(homeBtn);



/* ------------------------
   Boot
------------------------- */
loadAndEvaluate();
