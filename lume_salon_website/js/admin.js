(() => {
  "use strict";

  const STORAGE_KEY = "lume-salon-admin-demo-v1";
  const days = [
    { id: "sun", label: "Sunday" },
    { id: "mon", label: "Monday" },
    { id: "tue", label: "Tuesday" },
    { id: "wed", label: "Wednesday" },
    { id: "thu", label: "Thursday" },
    { id: "fri", label: "Friday" },
    { id: "sat", label: "Saturday" }
  ];
  const services = [
    "Silk Press & Finish",
    "Signature Braids",
    "Calm Body Massage",
    "Glow Facial"
  ];
  const stylists = ["Nia", "Amara", "Jade"];
  const errorBox = document.getElementById("admin-error");
  const hoursForm = document.getElementById("hours-form");
  const dateForm = document.getElementById("date-form");
  const dateInput = document.getElementById("special-date");
  const statusSelect = document.getElementById("special-status");
  const dateHours = document.getElementById("date-hours");
  const specialList = document.getElementById("special-list");
  const appointmentList = document.getElementById("appointment-list");

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(amount) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function defaultState() {
    return {
      hours: {
        sun: { closed: true, opens: "09:00", closes: "17:00" },
        mon: { closed: false, opens: "09:00", closes: "17:00" },
        tue: { closed: false, opens: "09:00", closes: "17:00" },
        wed: { closed: false, opens: "09:00", closes: "17:00" },
        thu: { closed: false, opens: "09:00", closes: "17:00" },
        fri: { closed: false, opens: "09:00", closes: "18:00" },
        sat: { closed: false, opens: "10:00", closes: "16:00" }
      },
      exceptions: {},
      appointments: [
        { id: "sample-1", name: "Aaliyah Brown", phone: "(876) 555-0142", service: services[0], stylist: stylists[0], date: dateKey(addDays(1)), time: "10:00", status: "confirmed" },
        { id: "sample-2", name: "Mika Thompson", phone: "(876) 555-0186", service: services[2], stylist: stylists[1], date: dateKey(addDays(2)), time: "12:30", status: "confirmed" },
        { id: "sample-3", name: "Zara Campbell", phone: "(876) 555-0125", service: services[3], stylist: stylists[2], date: dateKey(addDays(4)), time: "14:00", status: "confirmed" }
      ]
    };
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState();
    const parsed = JSON.parse(saved);
    if (!parsed || !parsed.hours || !parsed.exceptions || !Array.isArray(parsed.appointments)) {
      throw new Error("The saved demo data is invalid. Use “Reset demo” to restore the sample setup.");
    }
    return parsed;
  }

  let state;
  try {
    state = loadState();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    state = defaultState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      errorBox.hidden = true;
      return true;
    } catch (error) {
      errorBox.textContent = `Could not save demo changes in this browser: ${error.message}`;
      errorBox.hidden = false;
      return false;
    }
  }

  function setMessage(id, message) {
    document.getElementById(id).textContent = message;
  }

  function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function renderHours() {
    hoursForm.replaceChildren();
    days.forEach(day => {
      const hours = state.hours[day.id] || { closed: true, opens: "09:00", closes: "17:00" };
      const row = document.createElement("div");
      row.className = "hours-row";
      const label = addText(row, "label", "", day.label);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = `${day.id}-closed`;
      checkbox.checked = Boolean(hours.closed);
      checkbox.setAttribute("aria-label", `${day.label} closed`);
      label.htmlFor = checkbox.id = `${day.id}-closed`;
      row.append(checkbox);

      const opens = document.createElement("input");
      opens.type = "time";
      opens.name = `${day.id}-opens`;
      opens.value = hours.opens;
      opens.disabled = checkbox.checked;
      opens.setAttribute("aria-label", `${day.label} opening time`);
      row.append(opens);

      const closes = document.createElement("input");
      closes.type = "time";
      closes.name = `${day.id}-closes`;
      closes.value = hours.closes;
      closes.disabled = checkbox.checked;
      closes.setAttribute("aria-label", `${day.label} closing time`);
      row.append(closes);
      checkbox.addEventListener("change", () => {
        opens.disabled = closes.disabled = checkbox.checked;
      });
      hoursForm.append(row);
    });
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("en-JM", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(`${date}T12:00:00`));
  }

  function formatTime(time) {
    const [hour, minute] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return new Intl.DateTimeFormat("en-JM", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function renderSpecialDates() {
    specialList.replaceChildren();
    const dates = Object.keys(state.exceptions).sort();
    if (!dates.length) {
      addText(specialList, "li", "empty-special", "No special dates set. Add an extra open day or block a date above.");
      return;
    }

    dates.forEach(date => {
      const exception = state.exceptions[date];
      const item = document.createElement("li");
      item.className = "special-item";
      const description = document.createElement("div");
      addText(description, "span", "special-date-label", formatDate(date));
      addText(description, "span", "special-hours-label",
        exception.status === "open" ? `${formatTime(exception.opens)}–${formatTime(exception.closes)}` : "Closed all day");
      item.append(description);
      const status = addText(item, "span", `status-pill${exception.status === "closed" ? " closed" : ""}`,
        exception.status === "open" ? "Open" : "Closed");
      status.setAttribute("aria-label", `Date status: ${exception.status}`);
      const remove = addText(item, "button", "remove-special", "Remove");
      remove.type = "button";
      remove.dataset.removeDate = date;
      remove.setAttribute("aria-label", `Remove special hours for ${formatDate(date)}`);
      specialList.append(item);
    });
  }

  function renderAppointments() {
    appointmentList.replaceChildren();
    const appointments = [...state.appointments].sort((a, b) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const upcoming = appointments.filter(appointment =>
      appointment.date >= dateKey(new Date()) && appointment.status === "confirmed");
    document.getElementById("stat-appointments").textContent = upcoming.length;
    document.getElementById("appointment-count").textContent =
      `${appointments.length} ${appointments.length === 1 ? "booking" : "bookings"}`;
    document.getElementById("appointment-empty").hidden = appointments.length > 0;

    const next = upcoming[0];
    document.getElementById("stat-next").textContent = next ? formatDate(next.date).split(",")[0] : "—";
    document.getElementById("stat-next-name").textContent = next
      ? `${formatTime(next.time)} · ${next.name}`
      : "No upcoming appointments";

    appointments.forEach(appointment => {
      const row = document.createElement("tr");
      const guest = document.createElement("td");
      addText(guest, "span", "guest-name", appointment.name);
      addText(guest, "span", "guest-phone", appointment.phone);
      row.append(guest);
      addText(row, "td", "", appointment.service);
      const dateCell = document.createElement("td");
      addText(dateCell, "span", "", formatTime(appointment.time));
      addText(dateCell, "span", "appointment-date", formatDate(appointment.date));
      row.append(dateCell);
      addText(row, "td", "", appointment.stylist);
      const statusCell = document.createElement("td");
      addText(statusCell, "span", `status-pill${appointment.status === "cancelled" ? " cancelled" : ""}`,
        appointment.status === "confirmed" ? "Confirmed" : "Cancelled");
      row.append(statusCell);
      const actionCell = document.createElement("td");
      if (appointment.status === "confirmed") {
        const cancel = addText(actionCell, "button", "cancel-booking", "Cancel");
        cancel.type = "button";
        cancel.dataset.cancelBooking = appointment.id;
        cancel.setAttribute("aria-label", `Cancel demo booking for ${appointment.name}`);
      }
      row.append(actionCell);
      appointmentList.append(row);
    });
  }

  function renderStats() {
    document.getElementById("stat-open-days").textContent =
      days.filter(day => !state.hours[day.id]?.closed).length;
  }

  function render() {
    renderHours();
    renderSpecialDates();
    renderAppointments();
    renderStats();
  }

  dateInput.min = dateKey(new Date());
  dateInput.value = dateKey(addDays(7));
  statusSelect.addEventListener("change", () => {
    dateHours.hidden = statusSelect.value === "closed";
  });

  hoursForm.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(hoursForm);
    for (const day of days) {
      const opens = String(data.get(`${day.id}-opens`) || "09:00");
      const closes = String(data.get(`${day.id}-closes`) || "17:00");
      const closed = data.has(`${day.id}-closed`);
      if (!closed && opens >= closes) {
        setMessage("hours-message", `${day.label}: closing time must be later than opening time.`);
        return;
      }
      state.hours[day.id] = { closed, opens, closes };
    }
    if (saveState()) {
      renderStats();
      setMessage("hours-message", "Weekly hours saved on this device.");
    }
  });

  dateForm.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(dateForm);
    const date = String(data.get("date") || "");
    const status = String(data.get("status") || "open");
    const opens = String(data.get("opens") || "");
    const closes = String(data.get("closes") || "");
    if (!date || date < dateKey(new Date())) {
      setMessage("date-message", "Choose today or a future date.");
      return;
    }
    if (status === "open" && (!opens || !closes || opens >= closes)) {
      setMessage("date-message", "Closing time must be later than opening time.");
      return;
    }

    state.exceptions[date] = { status, opens, closes };
    if (saveState()) {
      renderSpecialDates();
      setMessage("date-message", `${formatDate(date)} saved as ${status === "open" ? "open" : "closed"}.`);
    }
  });

  specialList.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-date]");
    if (!button) return;
    delete state.exceptions[button.dataset.removeDate];
    if (saveState()) renderSpecialDates();
  });

  appointmentList.addEventListener("click", event => {
    const button = event.target.closest("[data-cancel-booking]");
    if (!button) return;
    const appointment = state.appointments.find(item => item.id === button.dataset.cancelBooking);
    if (!appointment) return;
    appointment.status = "cancelled";
    if (saveState()) renderAppointments();
  });

  document.getElementById("reset-demo").addEventListener("click", () => {
    state = defaultState();
    if (saveState()) {
      render();
      setMessage("hours-message", "Demo reset to the original sample data.");
      setMessage("date-message", "");
    }
  });

  render();
})();
