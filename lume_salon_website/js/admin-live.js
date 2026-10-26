(() => {
  "use strict";

  const config = window.SalonBookingConfig;
  const errorBox = document.getElementById("admin-error");
  const messageBox = document.getElementById("admin-message");
  const setupNotice = document.getElementById("setup-notice");
  const loginPanel = document.getElementById("login-panel");
  const dashboardPanel = document.getElementById("dashboard-panel");
  const loginForm = document.getElementById("login-form");
  const loginButton = document.getElementById("login-button");
  const hoursForm = document.getElementById("hours-form");
  const hoursStaff = document.getElementById("hours-staff");
  const dateStaff = document.getElementById("date-staff");
  const addStaffForm = document.getElementById("add-staff-form");
  const staffServiceOptions = document.getElementById("staff-service-options");
  const dateForm = document.getElementById("date-form");
  const dateInput = document.getElementById("special-date");
  const statusSelect = document.getElementById("special-status");
  const dateHours = document.getElementById("date-hours");
  const specialList = document.getElementById("special-list");
  const appointmentList = document.getElementById("appointment-list");
  const days = [
    { id: 0, label: "Sunday" }, { id: 1, label: "Monday" }, { id: 2, label: "Tuesday" },
    { id: 3, label: "Wednesday" }, { id: 4, label: "Thursday" }, { id: 5, label: "Friday" },
    { id: 6, label: "Saturday" }
  ];

  let session = null;
  let dashboard = null;

  if (!config?.url || !config?.anonKey || config.url.includes("YOUR_PROJECT") ||
      config.anonKey.includes("YOUR_SUPABASE")) {
    setupNotice.textContent = "Setup required: add your Supabase project URL and anon key in js/supabase-config.js before staff sign-in can connect.";
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    messageBox.textContent = "";
  }

  function showMessage(message) {
    errorBox.hidden = true;
    messageBox.textContent = message;
  }

  async function request(path, { method = "GET", body, token } = {}) {
    if (!config?.url || !config?.anonKey || config.url.includes("YOUR_PROJECT") ||
        config.anonKey.includes("YOUR_SUPABASE")) {
      throw new Error("Supabase is not configured. Add your project URL and anon key in js/supabase-config.js.");
    }
    const headers = { apikey: config.anonKey };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${config.url.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.msg || result?.message || result?.error_description || result?.details;
      throw new Error(detail || "The database request failed.");
    }
    return result;
  }

  async function rpc(name, parameters = {}) {
    if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");
    return request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      body: parameters,
      token: session.access_token
    });
  }

  async function refreshSession() {
    if (!session?.refresh_token) return false;
    try {
      session = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token }
      });
      document.getElementById("admin-user").textContent = session.user.email;
      return true;
    } catch (error) {
      session = null;
      loginPanel.hidden = false;
      dashboardPanel.hidden = true;
      showError(`Your sign-in session expired. Please sign in again. (${error.message})`);
      return false;
    }
  }

  async function withFreshSession(operation) {
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
      if (!await refreshSession()) throw new Error("Your sign-in session expired. Please sign in again.");
    }
    try {
      return await operation();
    } catch (error) {
      if (/jwt expired|invalid jwt|token is expired/i.test(error.message) && await refreshSession()) {
        return operation();
      }
      throw error;
    }
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-JM", {
      timeZone: config?.timeZone || "America/Jamaica",
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    }).format(new Date(`${value}T12:00:00`));
  }

  function formatTimestamp(value) {
    return new Intl.DateTimeFormat("en-JM", {
      timeZone: config?.timeZone || "America/Jamaica",
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit"
    }).format(new Date(value));
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("en-JM", {
      timeZone: config?.timeZone || "America/Jamaica",
      hour: "numeric", minute: "2-digit"
    }).format(new Date(`2000-01-01T${value}`));
  }

  function todayInSalonTime() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config?.timeZone || "America/Jamaica",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function renderStaffSelects() {
    [hoursStaff, dateStaff].forEach(select => {
      const selected = select.value;
      select.replaceChildren();
      dashboard.staff.forEach(staff => {
        const option = new Option(staff.name, staff.id);
        select.add(option);
      });
      if (dashboard.staff.some(staff => staff.id === selected)) select.value = selected;
    });
  }

  function renderServiceOptions() {
    staffServiceOptions.replaceChildren();
    (dashboard.services || []).forEach(service => {
      const label = element("label", null, "staff-service-option");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "services";
      checkbox.value = service.id;
      const copy = element("span", null, "staff-service-copy");
      copy.append(element("strong", service.name));
      copy.append(element("small", `${service.duration_minutes} min`));
      label.append(checkbox, copy);
      staffServiceOptions.append(label);
    });
  }

  function renderHours() {
    hoursForm.replaceChildren();
    const staffId = hoursStaff.value;
    const byWeekday = new Map(dashboard.hours
      .filter(item => item.staff_id === staffId)
      .map(item => [Number(item.weekday), item]));
    days.forEach(day => {
      const existing = byWeekday.get(day.id);
      const row = element("div", null, "hours-row");
      const label = element("label", day.label);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = `day-${day.id}-closed`;
      checkbox.id = `day-${day.id}-closed`;
      checkbox.checked = !existing;
      checkbox.setAttribute("aria-label", `${day.label} closed`);
      label.htmlFor = checkbox.id;
      row.append(label, checkbox);

      const opens = document.createElement("input");
      opens.type = "time";
      opens.name = `day-${day.id}-opens`;
      opens.value = existing?.opens_at?.slice(0, 5) || "09:00";
      opens.disabled = checkbox.checked;
      opens.setAttribute("aria-label", `${day.label} opening time`);
      row.append(opens);

      const closes = document.createElement("input");
      closes.type = "time";
      closes.name = `day-${day.id}-closes`;
      closes.value = existing?.closes_at?.slice(0, 5) || "17:00";
      closes.disabled = checkbox.checked;
      closes.setAttribute("aria-label", `${day.label} closing time`);
      row.append(closes);
      checkbox.addEventListener("change", () => { opens.disabled = closes.disabled = checkbox.checked; });
      hoursForm.append(row);
    });
  }

  function renderSpecialDates() {
    specialList.replaceChildren();
    const entries = dashboard.overrides
      .filter(item => item.override_date >= todayInSalonTime())
      .sort((a, b) => a.override_date.localeCompare(b.override_date));
    if (!entries.length) {
      specialList.append(element("li", "No special dates set.", "empty-special"));
      return;
    }
    entries.forEach(item => {
      const staff = dashboard.staff.find(person => person.id === item.staff_id);
      const row = element("li", null, "special-item");
      const details = element("div");
      details.append(element("span", formatDate(item.override_date), "special-date-label"));
      details.append(element("span",
        `${staff?.name || "Stylist"} · ${item.status === "open"
          ? `${formatTime(item.opens_at)}–${formatTime(item.closes_at)}`
          : "Closed all day"}`,
        "special-hours-label"));
      row.append(details);
      row.append(element("span", item.status === "open" ? "Open" : "Closed",
        `status-pill${item.status === "closed" ? " closed" : ""}`));
      const remove = element("button", "Remove", "remove-special");
      remove.type = "button";
      remove.dataset.overrideId = item.id;
      remove.setAttribute("aria-label", `Remove special hours for ${staff?.name || "stylist"} on ${formatDate(item.override_date)}`);
      row.append(remove);
      specialList.append(row);
    });
  }

  function renderAppointments() {
    appointmentList.replaceChildren();
    const appointments = dashboard.appointments || [];
    const upcoming = appointments.filter(item => item.status === "confirmed" && new Date(item.starts_at) >= new Date());
    document.getElementById("stat-appointments").textContent = upcoming.length;
    document.getElementById("appointment-count").textContent =
      `${appointments.length} ${appointments.length === 1 ? "booking" : "bookings"}`;
    document.getElementById("appointment-empty").hidden = appointments.length > 0;
    const next = upcoming[0];
    document.getElementById("stat-next").textContent = next
      ? new Intl.DateTimeFormat("en-JM", {
        timeZone: config?.timeZone || "America/Jamaica",
        weekday: "short", month: "short", day: "numeric"
      }).format(new Date(next.starts_at))
      : "—";
    document.getElementById("stat-next-name").textContent = next
      ? `${formatTimestamp(next.starts_at)} · ${next.customer_name}`
      : "No upcoming appointments";

    appointments.forEach(item => {
      const row = document.createElement("tr");
      const guest = element("td");
      guest.append(element("span", item.customer_name, "guest-name"));
      guest.append(element("span", item.customer_phone, "guest-phone"));
      row.append(guest);
      row.append(element("td", item.service_name));
      const date = element("td");
      date.append(element("span", formatTimestamp(item.starts_at)));
      row.append(date);
      row.append(element("td", item.staff_name));
      const status = element("td");
      status.append(
        element("span", item.status === "confirmed" ? "Confirmed" : "Cancelled",
          `status-pill${item.status === "cancelled" ? " cancelled" : ""}`)
      );
      row.append(status);
      const action = element("td");
      if (item.status === "confirmed") {
        const cancel = element("button", "Cancel", "cancel-booking");
        cancel.type = "button";
        cancel.dataset.bookingId = item.id;
        cancel.setAttribute("aria-label", `Cancel appointment for ${item.customer_name}`);
        action.append(cancel);
      }
      row.append(action);
      appointmentList.append(row);
    });
  }

  function renderDashboard() {
    renderStaffSelects();
    renderServiceOptions();
    renderHours();
    renderSpecialDates();
    renderAppointments();
    document.getElementById("stat-stylists").textContent = dashboard.staff.filter(person => person.active).length;
  }

  async function loadDashboard() {
    const data = await withFreshSession(() => rpc("admin_get_dashboard"));
    if (!data) return;
    if (!Array.isArray(data.staff) || !Array.isArray(data.services) ||
        !Array.isArray(data.hours) || !Array.isArray(data.overrides) ||
        !Array.isArray(data.appointments)) {
      throw new Error("The database is missing the latest salon admin and multi-service setup. Run the updated supabase/schema.sql in Supabase SQL Editor, then refresh this page.");
    }
    dashboard = data;
    renderDashboard();
    loginPanel.hidden = true;
    dashboardPanel.hidden = false;
    document.getElementById("admin-user").textContent = session.user.email;
    if (dashboard.staff.length) {
      showMessage("");
    } else {
      showError("No stylists are configured yet. Add salon staff, service assignments, and initial working hours in Supabase to enable schedule management.");
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.hidden = true;
    loginButton.disabled = true;
    loginButton.textContent = "Signing in…";
    const data = new FormData(loginForm);
    try {
      session = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: {
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || "")
        }
      });
      await loadDashboard();
    } catch (error) {
      session = null;
      showError(error.message.includes("not authorized")
        ? "This account is not authorized for salon administration. Ask the owner to add it to the admin list."
        : error.message);
    } finally {
      loginButton.disabled = false;
      loginButton.innerHTML = 'Sign in <span aria-hidden="true">↗</span>';
    }
  });

  hoursStaff.addEventListener("change", renderHours);

  addStaffForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(addStaffForm);
    const name = String(data.get("name") || "").trim();
    const serviceIds = data.getAll("services").map(String);
    if (!name || name.length > 80) {
      showError("Enter a stylist name between 1 and 80 characters.");
      return;
    }
    if (!serviceIds.length) {
      showError("Select at least one service this stylist can perform.");
      return;
    }
    try {
      const staffId = await withFreshSession(() => rpc("admin_add_staff", {
        p_name: name,
        p_service_ids: serviceIds
      }));
      addStaffForm.reset();
      await loadDashboard();
      if (typeof staffId === "string" && dashboard.staff.some(staff => staff.id === staffId)) {
        hoursStaff.value = staffId;
        dateStaff.value = staffId;
        renderHours();
      }
      showMessage(`${name} was added. Default hours are Monday–Friday 9:00 AM–5:00 PM and Saturday 10:00 AM–4:00 PM. Review the schedule before publishing.`);
    } catch (error) {
      showError(error.message);
    }
  });

  hoursForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(hoursForm);
    const hours = days.map(day => ({
      staff_id: hoursStaff.value,
      weekday: day.id,
      closed: data.has(`day-${day.id}-closed`),
      opens_at: data.get(`day-${day.id}-opens`),
      closes_at: data.get(`day-${day.id}-closes`)
    }));
    const invalid = hours.find(item => !item.closed && (!item.opens_at || !item.closes_at || item.opens_at >= item.closes_at));
    if (invalid) {
      showError(`${days[invalid.weekday].label}: closing time must be later than opening time.`);
      return;
    }
    try {
      await withFreshSession(() => rpc("admin_save_staff_hours", { p_hours: hours }));
      showMessage("Weekly hours saved. Customer availability has been updated.");
      await loadDashboard();
    } catch (error) { showError(error.message); }
  });

  statusSelect.addEventListener("change", () => { dateHours.hidden = statusSelect.value === "closed"; });
  dateInput.min = todayInSalonTime();

  dateForm.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(dateForm);
    const date = String(data.get("date") || "");
    const status = String(data.get("status") || "open");
    const opens = String(data.get("opens") || "");
    const closes = String(data.get("closes") || "");
    if (!date || date < todayInSalonTime()) { showError("Choose today or a future date."); return; }
    if (status === "open" && (!opens || !closes || opens >= closes)) {
      showError("Closing time must be later than opening time.");
      return;
    }
    try {
      await withFreshSession(() => rpc("admin_set_date_override", {
        p_staff_id: String(data.get("staff")),
        p_date: date,
        p_status: status,
        p_opens_at: status === "open" ? opens : null,
        p_closes_at: status === "open" ? closes : null
      }));
      showMessage(`Special availability saved for ${formatDate(date)}.`);
      await loadDashboard();
    } catch (error) { showError(error.message); }
  });

  specialList.addEventListener("click", async event => {
    const button = event.target.closest("[data-override-id]");
    if (!button) return;
    try {
      await withFreshSession(() => rpc("admin_delete_date_override", { p_override_id: button.dataset.overrideId }));
      showMessage("Special date removed.");
      await loadDashboard();
    } catch (error) { showError(error.message); }
  });

  appointmentList.addEventListener("click", async event => {
    const button = event.target.closest("[data-booking-id]");
    if (!button) return;
    if (!window.confirm("Cancel this appointment? The time will become available again.")) return;
    try {
      await withFreshSession(() => rpc("admin_cancel_booking", { p_booking_id: button.dataset.bookingId }));
      showMessage("Appointment cancelled. Its time is available for booking again.");
      await loadDashboard();
    } catch (error) { showError(error.message); }
  });

  document.getElementById("refresh-dashboard").addEventListener("click", async () => {
    try { await loadDashboard(); }
    catch (error) { showError(error.message); }
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    const accessToken = session?.access_token;
    session = null;
    dashboard = null;
    dashboardPanel.hidden = true;
    loginPanel.hidden = false;
    loginForm.reset();
    if (accessToken) {
      try {
        await request("/auth/v1/logout", { method: "POST", token: accessToken });
        showMessage("You have signed out.");
      } catch (error) {
        console.error("Sign-out request failed:", error);
        showError(`Signed out on this device, but the server could not revoke the session: ${error.message}`);
      }
    } else {
      showMessage("You have signed out.");
    }
  });
})();
