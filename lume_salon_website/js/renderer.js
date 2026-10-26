(() => {
  "use strict";
  const grid = document.getElementById("service-grid");
  const serviceOptions = document.getElementById("service-select");
  const filters = document.querySelectorAll("[data-filter]");
  let services = [];
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
    imageWrap.append(image);
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

    image.addEventListener("error", () => {
      image.src = "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80";
      image.alt = "Salon interior";
    }, { once: true });
    article.dataset.carouselIndex = "0";
    return article;
  }

  function startCarousel() {
    clearInterval(carouselTimer);
    if (carouselPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    carouselTimer = window.setInterval(() => {
      if (document.hidden) return;
      grid.querySelectorAll(".service-card").forEach(card => {
        const item = services.find(entry => entry.id === card.dataset.serviceId);
        const images = item ? [item.image, ...(item.images || [])].filter(Boolean) : [];
        if (images.length < 2) return;
        const next = (Number(card.dataset.carouselIndex) + 1) % images.length;
        const image = card.querySelector(".service-image");
        image.classList.add("is-changing");
        window.setTimeout(() => {
          image.src = images[next];
          card.dataset.carouselIndex = String(next);
          card.querySelectorAll(".service-image-indicators span").forEach((dot, index) => {
            dot.classList.toggle("active", index === next);
          });
          image.classList.remove("is-changing");
        }, 350);
      });
    }, 4200);
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

  function populateSelect() {
    serviceOptions.replaceChildren();
    const groups = [
      { label: "Hair", category: "hair" },
      { label: "Spa & body", category: "spa" }
    ];
    groups.forEach(group => {
      const heading = document.createElement("p");
      heading.className = "booking-service-group";
      heading.textContent = group.label;
      const options = document.createElement("div");
      options.className = "booking-service-group-options";
      services.filter(service => service.category === group.category).forEach(service => {
        const label = document.createElement("label");
        label.className = "booking-service-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "service";
        checkbox.value = service.id;
        checkbox.addEventListener("change", () => {
          const selected = [...serviceOptions.querySelectorAll('input[name="service"]:checked')];
          window.SalonBooking?.servicesChanged(selected.map(item => item.value));
        });
        const copy = document.createElement("span");
        copy.className = "booking-service-copy";
        const name = document.createElement("strong");
        name.textContent = service.name;
        const meta = document.createElement("small");
        meta.textContent = `${service.duration} · ${money(service.price)}`;
        copy.append(name, meta);
        label.append(checkbox, copy);
        options.append(label);
      });
      serviceOptions.append(heading, options);
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
        const checkbox = serviceOptions.querySelector(`input[name="service"][value="${CSS.escape(button.dataset.bookService)}"]`);
        if (checkbox) {
          checkbox.checked = true;
          window.SalonBooking?.servicesChanged(
            [...serviceOptions.querySelectorAll('input[name="service"]:checked')].map(item => item.value)
          );
        }
        window.SalonBooking?.open();
      });
      window.SalonServices = { all: () => services, find: id => services.find(service => service.id === id), money };
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
