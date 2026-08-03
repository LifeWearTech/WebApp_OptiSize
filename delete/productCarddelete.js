
export function renderProductCard(container, product, onSelect) {
  const card = document.createElement("div");
  card.className = "product-card";

  card.innerHTML = `
    <img src="../${product.image}" />
    <div class="product-title">${product.name}</div>
    ${product.desc.map(d => `<div>• ${d}</div>`).join("")}
  `;

  card.onclick = () => {
    container.querySelectorAll(".product-card")
      .forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    onSelect();
  };

  container.appendChild(card);
}
