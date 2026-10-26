(() => {
  "use strict";
  const modal = document.getElementById("booking-modal");
  const form = document.getElementById("booking-form");
  const dateInput = document.getElementById("booking-date");
  const selectedServicesSummary = document.getElementById("selected-services-summary");
  const stylistSelect = document.getElementById("stylist");
  const timeSelect = document.getElementById("booking-time");
  const submitButton = form.querySelector('[type="submit"]');
  const errorBox = document.getElementById("form-error");
  const toast = document.getElementById("site-toast");
  const config = window.SalonBookingConfig;
  let lastFocused = null;
  let toastTimer;
  let availabilityRequest = 0;
  let visibleSlots = [];

  function selectedServiceIds() {
    return window.SalonServices?.selectedIds() || [];
  }

  function servicesChanged(ids = selectedServiceIds()) {
    const selected = ids.map(id => window.SalonServices?.find(id)).filter(Boolean);
    selectedServicesSummary.textContent = selected.length
      ? `${selected.length} service${selected.length === 1 ? "" : "s"} selected.`
      : "Choose at least one service to continue.";
    loadAvailability();
  }

  function salonDateNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config?.timeZone || "America/Jamaica",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  dateInput.min = salonDateNow();

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 6000);
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function open() {
    lastFocused = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => document.getElementById("customer-name").focus(), 50);
  }

  function close() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  async function rpc(functionName, parameters) {
    if (!config || !config.url || !config.anonKey ||
        config.url.includes("YOUR_PROJECT") || config.anonKey.includes("YOUR_SUPABASE")) {
      throw new Error("Online booking is not configured yet. Please contact the salon directly.");
    }
    const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parameters)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.message || result?.details || "The booking service could not complete the request.";
      throw new Error(message);
    }
    return result;
  }

  function formatSlotTime(value) {
    return new Intl.DateTimeFormat("en-JM", {
      timeZone: config?.timeZone || "America/Jamaica",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function setTimePlaceholder(message) {
    timeSelect.replaceChildren(new Option(message, ""));
    timeSelect.disabled = true;
    submitButton.disabled = true;
    visibleSlots = [];
  }

  async function loadAvailability() {
    const requestId = ++availabilityRequest;
    const serviceIds = selectedServiceIds();
    const date = dateInput.value;
    errorBox.hidden = true;
    setTimePlaceholder("Checking availability…");
    if (!serviceIds.length || !date) {
      setTimePlaceholder("Choose a service and date first");
      return;
    }

    try {
      const slots = await rpc("get_available_slots", {
        p_service_ids: serviceIds,
        p_date: date,
        p_stylist_id: stylistSelect.value || null
      });
      if (requestId !== availabilityRequest) return;
      renderAvailability(Array.isArray(slots) ? slots : []);
    } catch (error) {
      if (requestId !== availabilityRequest) return;
      setTimePlaceholder("Availability unavailable");
      showError(error.message);
      console.error("Could not load appointment availability:", error);
    }
  }

  function renderAvailability(slots) {
    visibleSlots = slots;
    timeSelect.replaceChildren();
    if (!slots.length) {
      timeSelect.append(new Option("No available times for this date", ""));
      timeSelect.disabled = true;
      submitButton.disabled = true;
      return;
    }

    const selectedStylist = stylistSelect.value;
    const stylists = [...new Map(slots.map(slot => [slot.staff_id, slot.staff_name])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    stylistSelect.replaceChildren(new Option("Any available stylist", ""));
    stylists.forEach(([id, name]) => stylistSelect.add(new Option(name, id)));
    if (selectedStylist && stylists.some(([id]) => id === selectedStylist)) {
      stylistSelect.value = selectedStylist;
    }

    const seenTimes = new Set();
    const options = [];
    slots.forEach((slot, index) => {
      const timeLabel = formatSlotTime(slot.starts_at);
      const key = `${slot.starts_at}|${stylistSelect.value || ""}`;
      if (seenTimes.has(key)) return;
      seenTimes.add(key);
      options.push({
        index,
        label: stylistSelect.value ? timeLabel : `${timeLabel} — ${slot.staff_name}`
      });
    });
    timeSelect.append(new Option("Choose an available time", ""));
    options.forEach(({ index, label }) => {
      const option = new Option(label, String(index));
      timeSelect.append(option);
    });
    timeSelect.disabled = false;
    submitButton.disabled = true;
  }

  document.querySelectorAll("[data-open-booking]").forEach(button => button.addEventListener("click", open));
  document.querySelectorAll("[data-close-booking]").forEach(button => button.addEventListener("click", close));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) close();
    if (event.key === "Tab" && modal.classList.contains("is-open")) {
      const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')]
        .filter(element => !element.closest("[hidden]"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  dateInput.addEventListener("change", loadAvailability);
  stylistSelect.addEventListener("change", loadAvailability);
  timeSelect.addEventListener("change", () => {
    submitButton.disabled = !timeSelect.value;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.hidden = true;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const serviceIds = selectedServiceIds();
    const date = String(data.get("date") || "");
    const notes = String(data.get("notes") || "").trim();
    const slot = visibleSlots[Number(timeSelect.value)];

    if (!name || !phone || !serviceIds.length || !date || !slot) {
      showError("Please enter your details and choose an available appointment time.");
      return;
    }
    if (date < dateInput.min) {
      showError("Please choose today or a future date.");
      dateInput.focus();
      return;
    }
    if (!/^[+\d\s().-]{7,25}$/.test(phone)) {
      showError("Please enter a valid phone number.");
      document.getElementById("customer-phone").focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Confirming…";
    try {
      const result = await rpc("create_booking", {
        p_service_ids: serviceIds,
        p_staff_id: slot.staff_id,
        p_starts_at: slot.starts_at,
        p_customer_name: name,
        p_customer_phone: phone,
        p_notes: notes || null
      });
      const booking = Array.isArray(result) ? result[0] : result;
      if (!booking || booking.status !== "confirmed") {
        throw new Error("The booking service did not confirm this appointment. Please try again.");
      }
      const time = formatSlotTime(booking.starts_at);
      const readableDate = new Intl.DateTimeFormat("en-JM", {
        timeZone: config?.timeZone || "America/Jamaica",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(new Date(booking.starts_at));
      close();
      form.reset();
      window.SalonServices?.clearSelection();
      window.SalonServices?.closePicker();
      stylistSelect.replaceChildren(new Option("Any available stylist", ""));
      setTimePlaceholder("Choose a service and date first");
      dateInput.min = salonDateNow();
      showToast(`Appointment confirmed: ${readableDate} at ${time}.`);
    } catch (error) {
      showError(error.message.includes("slot is no longer available")
        ? "That time was just booked by someone else. Please choose another available time."
        : error.message);
      console.error("Could not confirm appointment:", error);
      await loadAvailability();
    } finally {
      submitButton.textContent = "Confirm appointment";
      submitButton.disabled = !timeSelect.value;
    }
  });

  window.SalonBooking = { open, close, servicesChanged };
})();
