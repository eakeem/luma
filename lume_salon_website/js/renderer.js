(() => {
  "use strict";
  const grid = document.getElementById("service-grid");
  const serviceSelect = document.getElementById("service-select");
  const filters = document.querySelectorAll("[data-filter]");
  let services = [];

  const money = (amount) => new Intl.NumberFormat("en-JM", {
    style: "currency", currency: "JMD", maximumFractionDigits: 0
  }).format(amount).replace("JMD", "J$");

  function makeCard(service) {
    const article = document.createElement("article");
    article.className = "service-card";
    article.dataset.category = service.category;
    article.innerHTML = `
      <div class="service-image-wrap">
        <img class="service-image" src="${service.image}" alt="${service.alt || service.name}" loading="lazy">
        <span class="service-tag">${service.category === "hair" ? "Hair" : "Spa & body"}</span>
      </div>
      <div class="service-card-body">
        <div class="service-meta"><span>${service.duration}</span><span>${service.category === "hair" ? "HAIR STUDIO" : "WELLNESS ROOM"}</span></div>
        <h3>${service.name}</h3>
        <p>${service.description}</p>
        <div class="service-card-bottom"><span class="price">${money(service.price)}</span><button class="card-book" type="button" data-book-service="${service.id}">Book this <span aria-hidden="true">↗</span></button></div>
      </div>`;
    const image = article.querySelector("img");
    image.addEventListener("error", () => {
      image.src = "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80";
      image.alt = "Salon interior";
    }, { once: true });
    return article;
  }

  function render(category = "all") {
    grid.replaceChildren();
    const filtered = services.filter(service => category === "all" || service.category === category);
    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "loading-message";
      empty.textContent = "No services found in this category.";
      grid.append(empty);
      return;
    }
    filtered.forEach(service => grid.append(makeCard(service)));
  }

  function populateSelect() {
    const groups = [
      { label: "Hair", items: services.filter(s => s.category === "hair") },
      { label: "Spa & body", items: services.filter(s => s.category === "spa") }
    ];
    groups.forEach(group => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      group.items.forEach(service => {
        const option = document.createElement("option");
        option.value = service.id;
        option.textContent = `${service.name} — ${money(service.price)}`;
        optgroup.append(option);
      });
      serviceSelect.append(optgroup);
    });
  }

  async function init() {
    try {
      const response = await fetch("js/services.json");
      if (!response.ok) throw new Error("Could not load service data.");
      services = await response.json();
      render();
      populateSelect();
      filters.forEach(button => button.addEventListener("click", () => {
        filters.forEach(item => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        render(button.dataset.filter);
      }));
      grid.addEventListener("click", event => {
        const button = event.target.closest("[data-book-service]");
        if (!button) return;
        serviceSelect.value = button.dataset.bookService;
        window.SalonBooking?.open();
      });
      window.SalonServices = { all: () => services, find: id => services.find(s => s.id === id), money };
    } catch (error) {
      grid.innerHTML = '<p class="loading-message">We could not load the service menu. Please refresh the page or contact the salon.</p>';
      console.error(error);
    }
  }
  init();
})();