(() => {
  "use strict";
  const grid = document.getElementById("service-grid");
  const serviceOptions = document.getElementById("service-select");
  const addServicesButton = document.getElementById("add-services-button");
  const searchPanel = document.getElementById("service-search-panel");
  const serviceSearch = document.getElementById("service-search");
  const suggestions = document.getElementById("service-suggestions");
  const searchMessage = document.getElementById("service-search-message");
  const filters = document.querySelectorAll("[data-filter]");
  let services = [];
  const selectedServiceIds = new Set();
  let carouselTimer;
  let carouselPaused = false;

  const money = amount => new Intl.NumberFormat("en-JM", {
    style: "currency", currency: "JMD", maximumFractionDigits: 0
  }).format(amount).replace("JMD", "J$");

  function makeCard(service) {
    const article = document.createElement("article");
    article.className = "service-card";
    article.dataset.category = service.category;
    article.dataset.serviceId = service.id;

    const imageWrap = document.createElement("div");
    imageWrap.className = "service-image-wrap";
    const images = [service.image, ...(service.images || [])].filter(Boolean);
    const image = document.createElement("img");
    image.className = "service-image";
    image.src = images[0];
    image.alt = service.alt || service.name;
    image.loading = "lazy";
    image.classList.add("is-visible");
    const nextImage = document.createElement("img");
    nextImage.className = "service-image service-image-next";
    nextImage.alt = "";
    nextImage.setAttribute("aria-hidden", "true");
    nextImage.loading = "lazy";
    nextImage.src = images[0];
    imageWrap.append(image, nextImage);
    imageWrap.append(Object.assign(document.createElement("span"), {
      className: "service-tag",
      textContent: service.category === "hair" ? "Hair" : "Spa & body"
    }));
    const indicators = document.createElement("div");
    indicators.className = "service-image-indicators";
    indicators.setAttribute("aria-hidden", "true");
    images.forEach((_, index) => {
      const dot = document.createElement("span");
      if (index === 0) dot.classList.add("active");
      indicators.append(dot);
    });
    imageWrap.append(indicators);

    const body = document.createElement("div");
    body.className = "service-card-body";
    const meta = document.createElement("div");
    meta.className = "service-meta";
    meta.append(
      Object.assign(document.createElement("span"), { textContent: service.duration }),
      Object.assign(document.createElement("span"), {
        textContent: service.category === "hair" ? "HAIR STUDIO" : "WELLNESS ROOM"
      })
    );
    const title = document.createElement("h3");
    title.textContent = service.name;
    const description = document.createElement("p");
    description.textContent = service.description;
    const bottom = document.createElement("div");
    bottom.className = "service-card-bottom";
    const price = document.createElement("span");
    price.className = "price";
    price.textContent = money(service.price);
    const book = document.createElement("button");
    book.className = "card-book";
    book.type = "button";
    book.dataset.bookService = service.id;
    book.textContent = "Book now";
    bottom.append(price, book);
    body.append(meta, title, description, bottom);
    article.append(imageWrap, body);

    [image, nextImage].forEach(layer => {
      layer.addEventListener("error", () => {
        layer.src = "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80";
        layer.alt = layer === image ? "Salon interior" : "";
      }, { once: true });
    });
    article.dataset.carouselIndex = "0";
    return article;
  }

  function startCarousel() {
    clearInterval(carouselTimer);
    if (carouselPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    carouselTimer = window.setInterval(async () => {
      if (document.hidden) return;
      await Promise.all([...grid.querySelectorAll(".service-card")].map(async card => {
        if (card.dataset.transitioning === "true") return;
        const item = services.find(entry => entry.id === card.dataset.serviceId);
        const images = item ? [item.image, ...(item.images || [])].filter(Boolean) : [];
        if (images.length < 2) return;
        const next = (Number(card.dataset.carouselIndex) + 1) % images.length;
        const layers = [...card.querySelectorAll(".service-image")];
        const active = layers.find(layer => layer.classList.contains("is-visible"));
        const incoming = layers.find(layer => layer !== active);
        if (!active || !incoming) return;

        card.dataset.transitioning = "true";
        incoming.src = images[next];
        const loaded = incoming.complete
          ? incoming.naturalWidth > 0
          : await new Promise(resolve => {
            incoming.addEventListener("load", () => resolve(true), { once: true });
            incoming.addEventListener("error", () => resolve(false), { once: true });
          });
        if (!loaded) {
          delete card.dataset.transitioning;
          return;
        }

        incoming.alt = item.alt || item.name;
        active.alt = "";
        incoming.classList.add("is-visible");
        active.classList.remove("is-visible");
        card.dataset.carouselIndex = String(next);
        card.querySelectorAll(".service-image-indicators span").forEach((dot, index) => {
          dot.classList.toggle("active", index === next);
        });
        window.setTimeout(() => {
          delete card.dataset.transitioning;
        }, 1400);
      }));
    }, 7000);
  }

  function render(category = "all") {
    clearInterval(carouselTimer);
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
    startCarousel();
  }

  function updateSelectedServices() {
    serviceOptions.replaceChildren();
    const selected = services.filter(service => selectedServiceIds.has(service.id));
    selected.forEach(service => {
      const chip = document.createElement("span");
      chip.className = "selected-service-chip";
      const name = document.createElement("span");
      name.textContent = service.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-service-button";
      remove.dataset.removeService = service.id;
      remove.setAttribute("aria-label", `Remove ${service.name}`);
      remove.textContent = "×";
      chip.append(name, remove);
      serviceOptions.append(chip);
    });
    if (!selected.length) {
      const empty = document.createElement("span");
      empty.className = "service-selection-empty";
      empty.textContent = "No services added yet";
      serviceOptions.append(empty);
    }
    renderSuggestions(serviceSearch.value);
    window.SalonBooking?.servicesChanged([...selectedServiceIds]);
  }

  function renderSuggestions(query) {
    suggestions.replaceChildren();
    const normalizedQuery = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!normalizedQuery) {
      searchMessage.hidden = false;
      searchMessage.textContent = "Type a service name to see suggestions.";
      return;
    }

    const queryTerms = normalizedQuery.split(/\s+/);
    const matches = services.filter(service => {
      if (selectedServiceIds.has(service.id)) return false;
      const searchable = `${service.name} ${service.category} ${service.description}`
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return queryTerms.every(term => searchable.includes(term));
    });
    searchMessage.hidden = matches.length > 0;
    if (!matches.length) {
      searchMessage.textContent = "No matching services. Try another search.";
      return;
    }

    matches.forEach(service => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "service-suggestion";
      option.setAttribute("role", "option");
      option.dataset.addService = service.id;
      const copy = document.createElement("span");
      copy.className = "service-suggestion-copy";
      const name = document.createElement("strong");
      name.textContent = service.name;
      const meta = document.createElement("small");
      meta.textContent = `${service.duration} · ${money(service.price)}`;
      copy.append(name, meta);
      const add = document.createElement("span");
      add.className = "service-suggestion-add";
      add.setAttribute("aria-hidden", "true");
      add.textContent = "+";
      option.append(copy, add);
      suggestions.append(option);
    });
  }

  function selectService(id) {
    if (!services.some(service => service.id === id) || selectedServiceIds.has(id)) return;
    selectedServiceIds.add(id);
    updateSelectedServices();
  }

  function deselectService(id) {
    if (!selectedServiceIds.delete(id)) return;
    updateSelectedServices();
  }

  function setSearchOpen(open) {
    searchPanel.hidden = !open;
    addServicesButton.setAttribute("aria-expanded", String(open));
    serviceSearch.setAttribute("aria-expanded", String(open));
    if (open) {
      serviceSearch.value = "";
      renderSuggestions("");
      serviceSearch.focus();
    }
  }

  async function init() {
    try {
      const response = await fetch("js/services.json");
      if (!response.ok) throw new Error("Could not load service data.");
      services = await response.json();
      render();
      window.SalonServices = {
        all: () => services,
        find: id => services.find(service => service.id === id),
        selectedIds: () => [...selectedServiceIds],
        clearSelection: () => {
          selectedServiceIds.clear();
          updateSelectedServices();
        },
        closePicker: () => setSearchOpen(false),
        money
      };
      updateSelectedServices();
      addServicesButton.addEventListener("click", () => {
        setSearchOpen(searchPanel.hidden);
      });
      serviceSearch.addEventListener("input", () => renderSuggestions(serviceSearch.value));
      serviceSearch.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          setSearchOpen(false);
          addServicesButton.focus();
        } else if (event.key === "ArrowDown") {
          const firstSuggestion = suggestions.querySelector("[data-add-service]");
          if (firstSuggestion) {
            event.preventDefault();
            firstSuggestion.focus();
          }
        } else if (event.key === "Enter") {
          event.preventDefault();
          suggestions.querySelector("[data-add-service]")?.click();
        }
      });
      serviceOptions.addEventListener("click", event => {
        const button = event.target.closest("[data-remove-service]");
        if (button) deselectService(button.dataset.removeService);
      });
      suggestions.addEventListener("click", event => {
        const button = event.target.closest("[data-add-service]");
        if (!button) return;
        selectService(button.dataset.addService);
        serviceSearch.value = "";
        renderSuggestions("");
        serviceSearch.focus();
      });
      filters.forEach(button => button.addEventListener("click", () => {
        filters.forEach(item => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        render(button.dataset.filter);
      }));
      grid.addEventListener("pointerenter", () => {
        carouselPaused = true;
        clearInterval(carouselTimer);
      });
      grid.addEventListener("pointerleave", () => {
        carouselPaused = false;
        startCarousel();
      });
      grid.addEventListener("focusin", () => {
        carouselPaused = true;
        clearInterval(carouselTimer);
      });
      grid.addEventListener("focusout", event => {
        if (grid.contains(event.relatedTarget)) return;
        carouselPaused = false;
        startCarousel();
      });
      grid.addEventListener("click", event => {
        const button = event.target.closest("[data-book-service]");
        if (!button) return;
        selectService(button.dataset.bookService);
        window.SalonBooking?.open();
      });
    } catch (error) {
      grid.textContent = "";
      const message = document.createElement("p");
      message.className = "loading-message";
      message.textContent = "We could not load the service menu. Please refresh the page or contact the salon.";
      grid.append(message);
      console.error(error);
    }
  }
  init();
})();
