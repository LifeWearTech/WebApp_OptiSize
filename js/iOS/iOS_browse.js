
// =========================================================
// browse.js
// ---------------------------------------------------------
// Responsibilities:
// - Load compact product data (browse-only dataset)
// - Filter products by selected TYPE (Knee / Ankle)
// - Render selectable product cards
// - Hand off selected product to instructions page
//
// IMPORTANT:
// - Uses ProductsJsonFileCompact.json ONLY
// - Does NOT resolve barcodes
// - Does NOT load full SKU dataset
// =========================================================

/* --------------------------------------------------------
   1. Parse URL parameters safely
-------------------------------------------------------- */

const params = new URLSearchParams(window.location.search);
const selectedType = params.get("type");
const selectedRetailer = params.get("retailer") || "All";

const container = document.getElementById("products-container");
const continueBtn = document.getElementById("continue-btn");

const actionRow = document.getElementById("action-row");

let selectedProduct = null;

// Guard: product type is required for browsing
if (!selectedType) {
  container.innerHTML = "<p>Missing product type.</p>";
  throw new Error("Browse page loaded without product type");
}

/* --------------------------------------------------------
   2. Load compact product data and render cards
-------------------------------------------------------- */

async function loadProducts() {
  try {
    const res = await fetch(
      "/assets/ProductData/ProductsJsonFileCompact.json",
      { cache: "force-cache" }
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const products = await res.json();

    // Filter by product type and non-obsolete products

      const filtered = products.filter(p => {
        if (p.obsolete) return false;

        const matchesType =
         p.product_type.toLowerCase() === selectedType.toLowerCase();

        const matchesRetailer =
         selectedRetailer === "All" ||
         (p.Retail && p.Retail === selectedRetailer);

        return matchesType && matchesRetailer;
});


    if (filtered.length === 0) {
      container.innerHTML =
        "<p>No products available for this category.</p>";
      return;
    }

    filtered.forEach(product => {
      const card = document.createElement("div");
      card.className = "product-card";

      card.innerHTML = `
        <img
          class="product-image"
          src="/${product.image}"
          alt="${product.name}"
        />

        <div class="product-title">${product.name}</div>

        ${product.desc.map(d =>
          `<div class="product-desc-line">• ${d}</div>`
        ).join("")}

        <div class="product-section-title">Sizes</div>
        ${product.sizes.map(s =>
          `<div class="product-size-line">• ${s}</div>`
        ).join("")}

        <div class="product-vendor"><strong>Retail:</strong> ${product.Retail}</div>
      `;

      // Handle product selection
      card.addEventListener("click", () => {
        selectedProduct = product;

        document
          .querySelectorAll(".product-card")
          .forEach(c => c.classList.remove("selected"));

        card.classList.add("selected");
        actionRow.style.display = "flex";
      });

      container.appendChild(card);
    });

    
    /* ----------------------------------------------------
       Auto-select first product
       Makes Back/Continue visible immediately
    ---------------------------------------------------- */

    const firstCard =
      container.querySelector(".product-card");

    if (firstCard) {

      firstCard.classList.add("selected");

      selectedProduct = filtered[0];

      actionRow.style.display = "flex";
    }


  } catch (err) {
    console.error("Failed to load browse products:", err);
    container.innerHTML =
      "<p>Unable to load products. Please try again.</p>";
  }
}


const homeBtn = document.createElement("a");

homeBtn.href =
  "/main_iOS.html";
homeBtn.innerHTML ='<span class="material-icons">home</span>';

homeBtn.style.position = "fixed";
homeBtn.style.top = "16px";
homeBtn.style.right = "16px";

homeBtn.style.color = "#2563eb";
homeBtn.style.textDecoration = "none";

homeBtn.style.zIndex = "1000";

document.body.appendChild(homeBtn);

// Load products immediately on page load
loadProducts();

/* --------------------------------------------------------
   3. Continue → Instructions (TYPE + PRODUCT ID)
-------------------------------------------------------- */

continueBtn.onclick = () => {
  if (!selectedProduct) return;

  const type = selectedProduct.product_type;
  const productId = selectedProduct.id;

  
window.location.href =
  `/pages/iOS/iOS_instructions.html` +
  `?p=${encodeURIComponent(type)}` +
  `&prod=${encodeURIComponent(productId)}` +
  `&retailer=${encodeURIComponent(selectedRetailer)}`;

};

