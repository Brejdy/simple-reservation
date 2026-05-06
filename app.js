const CONFIG = {
  password: "California2022!",
  googleClientId: "213574543519-3f050ph2jcohilvrtmc9ip814m2mumss.apps.googleusercontent.com",
  googleApiKey: "AIzaSyAdGtHSsEVEosdzClFPm50KJCsZiDyScZw",
  calendarId: "cc5bc4a1abce7d89d30e0d431af3aee718b5600a0719d295bf3ea0879937e326@group.calendar.google.com"
};

const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";
const ACCESS_KEY = "mustang_reservation_access";
const PARKING_KEY = "mustang_current_parking";
const CALENDAR_TIME_ZONE = "Europe/Prague";

let tokenClient = null;
let gapiReady = false;
let gisReady = false;
let signedIn = false;
let parkingEventId = null;
let calendarMonth = startOfMonth(new Date());

const els = {
  loginView: document.querySelector("#loginView"),
  dashboardView: document.querySelector("#dashboardView"),
  loginForm: document.querySelector("#loginForm"),
  passwordInput: document.querySelector("#passwordInput"),
  loginError: document.querySelector("#loginError"),
  lockButton: document.querySelector("#lockButton"),
  authorizeButton: document.querySelector("#authorizeButton"),
  signoutButton: document.querySelector("#signoutButton"),
  statusLine: document.querySelector("#statusLine"),
  bookingForm: document.querySelector("#bookingForm"),
  bookingError: document.querySelector("#bookingError"),
  createBookingButton: document.querySelector("#createBookingButton"),
  refreshButton: document.querySelector("#refreshButton"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarDays: document.querySelector("#calendarDays"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  calendarCount: document.querySelector("#calendarCount"),
  calendarPrevButton: document.querySelector("#calendarPrevButton"),
  calendarNextButton: document.querySelector("#calendarNextButton"),
  calendarTodayButton: document.querySelector("#calendarTodayButton"),
  eventsList: document.querySelector("#eventsList"),
  startInput: document.querySelector("#startInput"),
  endInput: document.querySelector("#endInput"),
  nameInput: document.querySelector("#nameInput"),
  purposeInput: document.querySelector("#purposeInput")
};

window.gapiLoaded = async () => {
  await gapi.load("client", initializeGapiClient);
};

window.gisLoaded = () => {
  gisReady = true;
  maybeEnableGoogle();
};

async function initializeGapiClient() {
  if (!isGoogleConfigured()) {
    updateStatus("Doplň Google Client ID, API key a Calendar ID v app.js.", false);
    return;
  }

  await gapi.client.init({
    apiKey: CONFIG.googleApiKey,
    discoveryDocs: [DISCOVERY_DOC]
  });
  gapiReady = true;
  maybeEnableGoogle();
}

function maybeEnableGoogle() {
  if (!gapiReady || !gisReady || !isGoogleConfigured()) return;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: SCOPES,
    callback: async (response) => {
      if (response.error) {
        updateStatus("Google přihlášení se nepodařilo.", false);
        return;
      }

      signedIn = true;
      els.authorizeButton.classList.add("is-hidden");
      els.signoutButton.classList.remove("is-hidden");
      updateStatus("Google Calendar je připojený.", true);
      await loadParkingFromCalendar();
      await listUpcomingEvents();
    }
  });

  updateStatus("Google Calendar je připravený k připojení.", true);
}

function isGoogleConfigured() {
  return !CONFIG.googleClientId.includes("PASTE_")
    && !CONFIG.googleApiKey.includes("PASTE_")
    && CONFIG.calendarId.trim().length > 0;
}

function showDashboard() {
  els.loginView.classList.add("is-hidden");
  els.dashboardView.classList.remove("is-hidden");
  setDefaultDateTimes();
  loadParking();
  renderEmptyCalendar("Připoj Google účet pro zobrazení rezervací.");
}

function showLogin() {
  els.dashboardView.classList.add("is-hidden");
  els.loginView.classList.remove("is-hidden");
  els.passwordInput.value = "";
  els.passwordInput.focus();
}

function setDefaultDateTimes() {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 60 - (start.getMinutes() % 30), 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  els.startInput.value = toDatetimeLocal(start);
  els.endInput.value = toDatetimeLocal(end);
}

function toDatetimeLocal(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function updateStatus(message, ready) {
  els.statusLine.textContent = message;
  els.statusLine.classList.toggle("is-ready", Boolean(ready));
}

function loadParking() {
  const currentParking = localStorage.getItem(PARKING_KEY) || "Choceradská";
  setParkingChoice(currentParking);
}

async function listUpcomingEvents() {
  if (!signedIn) {
    els.eventsList.innerHTML = '<p class="muted">Připoj Google účet pro načtení rezervací.</p>';
    renderEmptyCalendar("Připoj Google účet pro zobrazení rezervací.");
    return;
  }

  els.eventsList.innerHTML = '<p class="muted">Načítám rezervace...</p>';
  renderEmptyCalendar("Načítám rezervace...");

  try {
    const range = getCalendarRange(calendarMonth);
    const response = await gapi.client.calendar.events.list({
      calendarId: CONFIG.calendarId,
      timeMin: range.start.toISOString(),
      timeMax: range.end.toISOString(),
      showDeleted: false,
      singleEvents: true,
      maxResults: 100,
      orderBy: "startTime"
    });

    const events = (response.result.items || [])
      .filter((event) => event.extendedProperties?.shared?.mustangParking !== "true");
    renderReservationCalendar(events, range);

    const now = new Date();
    const upcomingEvents = events
      .filter((event) => getEventDates(event).end > now)
      .slice(0, 8);

    if (!upcomingEvents.length) {
      els.eventsList.innerHTML = '<p class="muted">Žádné nadcházející rezervace.</p>';
      return;
    }

    els.eventsList.innerHTML = upcomingEvents.map((event) => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end.dateTime || event.end.date;
      const note = getReservationNote(event);
      return `
        <article class="event-item">
          <div class="event-item-main">
            <strong>${escapeHtml(event.summary || "Rezervace Mustangu")}</strong>
            <span>${formatDateRange(start, end)}</span>
            ${event.location ? `<span>${escapeHtml(event.location)}</span>` : ""}
            ${note ? `<p class="event-note">${escapeHtml(note)}</p>` : ""}
          </div>
          <button type="button" class="delete-event-button" data-event-id="${escapeHtml(event.id)}" aria-label="Smazat rezervaci">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v5"></path>
              <path d="M14 11v5"></path>
            </svg>
          </button>
        </article>
      `;
    }).join("");
  } catch (error) {
    els.eventsList.innerHTML = '<p class="muted">Rezervace se nepodařilo načíst.</p>';
    console.error(error);
  }
}

function getCalendarRange(month) {
  const start = startOfMonth(month);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function renderEmptyCalendar(message) {
  updateCalendarHeading(0);
  if (!els.calendarDays) return;
  els.calendarDays.innerHTML = `<p class="calendar-message">${escapeHtml(message)}</p>`;
}

function renderReservationCalendar(events, range) {
  if (!els.calendarDays) return;

  const monthStart = new Date(range.start);
  const calendarStart = new Date(monthStart);
  const mondayOffset = (calendarStart.getDay() + 6) % 7;
  calendarStart.setDate(calendarStart.getDate() - mondayOffset);

  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });

  updateCalendarHeading(events.length);
  els.calendarDays.innerHTML = [
    ...days.map((day, index) => renderCalendarDay(day, index, monthStart)),
    ...renderCalendarEventSegments(events, calendarStart)
  ].join("");
}

function renderCalendarDay(day, index, monthStart) {
  const isCurrentMonth = day.getMonth() === monthStart.getMonth();
  const isToday = isSameDate(day, new Date());
  const dateValue = toDateOnly(day);
  const row = Math.floor(index / 7) + 1;
  const column = (index % 7) + 1;

  return `
    <button type="button" class="calendar-day ${isCurrentMonth ? "" : "is-muted"} ${isToday ? "is-today" : ""}" data-calendar-day="${dateValue}" style="grid-row: ${row}; grid-column: ${column};">
      <span class="calendar-day-number">${day.getDate()}</span>
    </button>
  `;
}

function renderCalendarEventSegments(events, calendarStart) {
  const calendarEnd = new Date(calendarStart);
  calendarEnd.setDate(calendarEnd.getDate() + 42);
  const lanesByRow = Array.from({ length: 6 }, () => []);

  return events
    .flatMap((event) => getCalendarEventSegments(event, calendarStart, calendarEnd))
    .sort((a, b) => a.row - b.row || a.column - b.column || b.span - a.span)
    .map((segment) => {
      const rowLanes = lanesByRow[segment.row - 1];
      let lane = rowLanes.findIndex((laneEnd) => laneEnd < segment.column);
      if (lane === -1) {
        lane = rowLanes.length;
      }
      rowLanes[lane] = segment.column + segment.span - 1;
      return renderCalendarEventSegment(segment, lane);
    });
}

function getCalendarEventSegments(event, calendarStart, calendarEnd) {
  const { start, end } = getEventDates(event);
  const eventStart = startOfDay(start);
  const eventEnd = startOfDay(new Date(end.getTime() - 1));
  const firstVisibleDay = maxDate(eventStart, calendarStart);
  const lastVisibleDay = minDate(eventEnd, new Date(calendarEnd.getTime() - 1));
  const segments = [];

  if (lastVisibleDay < calendarStart || firstVisibleDay >= calendarEnd) {
    return segments;
  }

  let segmentStart = new Date(firstVisibleDay);
  while (segmentStart <= lastVisibleDay) {
    const dayOffset = daysBetween(calendarStart, segmentStart);
    const row = Math.floor(dayOffset / 7) + 1;
    const column = (dayOffset % 7) + 1;
    const weekEnd = new Date(segmentStart);
    weekEnd.setDate(weekEnd.getDate() + (7 - column));
    const segmentEnd = minDate(weekEnd, lastVisibleDay);
    const span = daysBetween(segmentStart, segmentEnd) + 1;

    segments.push({ event, row, column, span, start, end });
    segmentStart = new Date(segmentEnd);
    segmentStart.setDate(segmentStart.getDate() + 1);
  }

  return segments;
}

function renderCalendarEventSegment(segment, lane) {
  const { event, row, column, span, start, end } = segment;
  const isMultiDay = !isSameDate(start, end);
  const eventTop = 58 + lane * 54;

  return `
    <span class="calendar-event ${isMultiDay ? "is-multi-day" : ""}" title="${escapeHtml(formatDateRange(start, end))}" style="grid-row: ${row}; grid-column: ${column} / span ${span}; --event-top: ${eventTop}px;">
      <strong>${escapeHtml(event.summary || "Rezervace Mustangu")}</strong>
      <span>${escapeHtml(isMultiDay ? formatCompactDateRange(start, end) : formatEventTime(start, end))}</span>
    </span>
  `;
}

function updateCalendarHeading(eventCount) {
  if (els.calendarMonthLabel) {
    els.calendarMonthLabel.textContent = new Intl.DateTimeFormat("cs-CZ", {
      month: "long",
      year: "numeric"
    }).format(calendarMonth);
  }

  if (els.calendarCount) {
    els.calendarCount.textContent = eventCount
      ? `${eventCount} rezervací v měsíci`
      : "Žádné rezervace v měsíci";
  }
}

function getEventDates(event) {
  return {
    start: new Date(event.start.dateTime || event.start.date),
    end: new Date(event.end.dateTime || event.end.date)
  };
}

function getReservationNote(event) {
  return String(event.description || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line
      && !line.startsWith("Vytvořeno z rezervační stránky")
      && !line.startsWith("Aktuálně zaparkováno:"))
    .join("\n");
}

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function minDate(a, b) {
  return a < b ? new Date(a) : new Date(b);
}

function maxDate(a, b) {
  return a > b ? new Date(a) : new Date(b);
}

function daysBetween(start, end) {
  const startDate = startOfDay(start);
  const endDate = startOfDay(end);
  return Math.round((endDate - startDate) / 86400000);
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function startOfMonth(date) {
  const month = new Date(date);
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  return month;
}

function selectCalendarDay(dateValue) {
  const start = new Date(`${dateValue}T09:00`);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  els.startInput.value = toDatetimeLocal(start);
  els.endInput.value = toDatetimeLocal(end);
  els.bookingForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatEventTime(start, end) {
  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${formatter.format(start)}-${formatter.format(end)}`;
}

function formatCompactDateRange(start, end) {
  const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${dateFormatter.format(start)} ${timeFormatter.format(start)} - ${dateFormatter.format(end)} ${timeFormatter.format(end)}`;
}

async function createBooking(event) {
  event.preventDefault();
  els.bookingError.textContent = "";

  if (!signedIn) {
    els.bookingError.textContent = "Nejdřív připoj Google účet.";
    return;
  }

  const start = new Date(els.startInput.value);
  const end = new Date(els.endInput.value);
  if (!els.startInput.value || !els.endInput.value || end <= start) {
    els.bookingError.textContent = "Konec rezervace musí být po začátku.";
    return;
  }

  const base = document.querySelector('input[name="base"]:checked').value;
  const note = els.purposeInput.value.trim();
  const summary = `Ford Mustang - ${els.nameInput.value.trim()}`;
  const description = [
    note,
    `Vytvořeno z rezervační stránky Ford Mustang.`,
    `Aktuálně zaparkováno: ${localStorage.getItem(PARKING_KEY) || "Choceradská"}`
  ].filter(Boolean).join("\n");

  els.createBookingButton.disabled = true;
  els.createBookingButton.textContent = "Vytvářím...";

  try {
    const overlaps = await findOverlappingReservations(start, end);
    if (overlaps.length) {
      els.bookingError.textContent = "V tomhle termínu už Mustang rezervaci má.";
      return;
    }

    await gapi.client.calendar.events.insert({
      calendarId: CONFIG.calendarId,
      resource: {
        summary,
        location: base,
        description,
        start: {
          dateTime: toCalendarDateTime(start),
          timeZone: CALENDAR_TIME_ZONE
        },
        end: {
          dateTime: toCalendarDateTime(end),
          timeZone: CALENDAR_TIME_ZONE
        },
        visibility: "public",
        transparency: "opaque",
        extendedProperties: {
          shared: {
            mustangReservation: "true"
          }
        }
      }
    });

    els.bookingForm.reset();
    setDefaultDateTimes();
    await listUpcomingEvents();
    updateStatus("Rezervace byla vytvořena v Google Calendar.", true);
  } catch (error) {
    els.bookingError.textContent = "Rezervaci se nepodařilo vytvořit.";
    console.error(error);
  } finally {
    els.createBookingButton.disabled = false;
    els.createBookingButton.textContent = "Vytvořit v Google Calendar";
  }
}

async function deleteBooking(eventId) {
  if (!signedIn) {
    updateStatus("Nejdřív připoj Google účet.", false);
    return;
  }

  const confirmed = window.confirm("Opravdu smazat tuto rezervaci?");
  if (!confirmed) return;

  try {
    await gapi.client.calendar.events.delete({
      calendarId: CONFIG.calendarId,
      eventId
    });

    await listUpcomingEvents();
    updateStatus("Rezervace byla smazána.", true);
  } catch (error) {
    updateStatus("Rezervaci se nepodařilo smazat.", false);
    console.error(error);
  }
}

async function findOverlappingReservations(start, end) {
  const response = await gapi.client.calendar.events.list({
    calendarId: CONFIG.calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    showDeleted: false,
    singleEvents: true,
    orderBy: "startTime"
  });

  return (response.result.items || []).filter((event) => {
    if (event.extendedProperties?.shared?.mustangParking === "true") return false;
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    return eventStart < end && eventEnd > start;
  });
}

async function loadParkingFromCalendar() {
  try {
    const response = await gapi.client.calendar.events.list({
      calendarId: CONFIG.calendarId,
      sharedExtendedProperty: "mustangParking=true",
      showDeleted: false,
      singleEvents: false,
      maxResults: 10
    });

    const events = response.result.items || [];
    const latest = events.sort((a, b) => new Date(b.updated) - new Date(a.updated))[0];
    if (!latest) {
      await saveParkingToCalendar(localStorage.getItem(PARKING_KEY) || "Choceradská");
      return;
    }

    parkingEventId = latest.id;
    const location = latest.extendedProperties?.shared?.parkingLocation || latest.location || "Choceradská";
    localStorage.setItem(PARKING_KEY, location);
    setParkingChoice(location);
    document.querySelector("#parkingSaved").textContent = `Sdíleně uloženo: ${location}`;
  } catch (error) {
    document.querySelector("#parkingSaved").textContent = "Polohu se nepodařilo načíst z kalendáře.";
    console.error(error);
  }
}

async function saveParkingToCalendar(location) {
  localStorage.setItem(PARKING_KEY, location);

  if (!signedIn) {
    document.querySelector("#parkingSaved").textContent = `Lokálně uloženo: ${location}`;
    return;
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const resource = {
    summary: "Ford Mustang - aktuální parkování",
    location,
    description: `Aktuální základna vozidla: ${location}`,
    start: {
      date: toDateOnly(today)
    },
    end: {
      date: toDateOnly(tomorrow)
    },
    transparency: "transparent",
    extendedProperties: {
      shared: {
        mustangParking: "true",
        parkingLocation: location
      }
    }
  };

  try {
    if (parkingEventId) {
      await gapi.client.calendar.events.patch({
        calendarId: CONFIG.calendarId,
        eventId: parkingEventId,
        resource
      });
    } else {
      const response = await gapi.client.calendar.events.insert({
        calendarId: CONFIG.calendarId,
        resource
      });
      parkingEventId = response.result.id;
    }

    document.querySelector("#parkingSaved").textContent = `Sdíleně uloženo: ${location}`;
  } catch (error) {
    document.querySelector("#parkingSaved").textContent = "Polohu se nepodařilo uložit do kalendáře.";
    console.error(error);
  }
}

function setParkingChoice(location) {
  const parkingInput = document.querySelector(`input[name="parking"][value="${location}"]`);
  if (parkingInput) parkingInput.checked = true;
}

function toDateOnly(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function toCalendarDateTime(date) {
  return `${toDatetimeLocal(date)}:00`;
}

function formatDateRange(start, end) {
  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (els.passwordInput.value === CONFIG.password) {
    sessionStorage.setItem(ACCESS_KEY, "true");
    els.loginError.textContent = "";
    showDashboard();
    return;
  }

  els.loginError.textContent = "Špatné heslo.";
});

els.lockButton.addEventListener("click", () => {
  sessionStorage.removeItem(ACCESS_KEY);
  showLogin();
});

els.authorizeButton.addEventListener("click", () => {
  if (!tokenClient) {
    updateStatus("Google konfigurace ještě není připravená.", false);
    return;
  }

  tokenClient.requestAccessToken({ prompt: "consent" });
});

els.signoutButton.addEventListener("click", () => {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken(null);
  }

  signedIn = false;
  els.signoutButton.classList.add("is-hidden");
  els.authorizeButton.classList.remove("is-hidden");
  updateStatus("Google Calendar je odpojený.", false);
  els.eventsList.innerHTML = '<p class="muted">Po připojení Google účtu se načtou nejbližší rezervace.</p>';
  renderEmptyCalendar("Po připojení Google účtu se načtou rezervace.");
});

els.bookingForm.addEventListener("submit", createBooking);
els.refreshButton.addEventListener("click", listUpcomingEvents);
els.calendarPrevButton.addEventListener("click", async () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  calendarMonth = startOfMonth(calendarMonth);
  await listUpcomingEvents();
});
els.calendarNextButton.addEventListener("click", async () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  calendarMonth = startOfMonth(calendarMonth);
  await listUpcomingEvents();
});
els.calendarTodayButton.addEventListener("click", async () => {
  calendarMonth = startOfMonth(new Date());
  await listUpcomingEvents();
});
els.calendarDays.addEventListener("click", (event) => {
  const button = event.target.closest("[data-calendar-day]");
  if (!button) return;
  selectCalendarDay(button.dataset.calendarDay);
});
els.eventsList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-event-id]");
  if (!button) return;
  await deleteBooking(button.dataset.eventId);
});

document.querySelectorAll('input[name="parking"]').forEach((input) => {
  input.addEventListener("change", async () => {
    await saveParkingToCalendar(input.value);
  });
});

if (sessionStorage.getItem(ACCESS_KEY) === "true") {
  showDashboard();
} else {
  showLogin();
}
