const CONFIG = {
  password: "California2022!",
  googleClientId: "213574543519-q70v7qsv9mkvnpjpds5o2e5bg7utg0e7.apps.googleusercontent.com", //"213574543519-3f050ph2jcohilvrtmc9ip814m2mumss.apps.googleusercontent.com",
  googleApiKey: "AIzaSyAdGtHSsEVEosdzClFPm50KJCsZiDyScZw",
  calendarId: "cc5bc4a1abce7d89d30e0d431af3aee718b5600a0719d295bf3ea0879937e326@group.calendar.google.com"
};

const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";
const ACCESS_KEY = "mustang_reservation_access";
const PARKING_KEY = "mustang_current_parking";

let tokenClient = null;
let gapiReady = false;
let gisReady = false;
let signedIn = false;
let parkingEventId = null;

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
  calendarFrame: document.querySelector("#calendarFrame"),
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
    return;
  }

  els.eventsList.innerHTML = '<p class="muted">Načítám rezervace...</p>';

  try {
    const response = await gapi.client.calendar.events.list({
      calendarId: CONFIG.calendarId,
      timeMin: new Date().toISOString(),
      showDeleted: false,
      singleEvents: true,
      maxResults: 8,
      orderBy: "startTime"
    });

    const events = (response.result.items || [])
      .filter((event) => event.extendedProperties?.shared?.mustangParking !== "true");

    if (!events.length) {
      els.eventsList.innerHTML = '<p class="muted">Žádné nadcházející rezervace.</p>';
      return;
    }

    els.eventsList.innerHTML = events.map((event) => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end.dateTime || event.end.date;
      return `
        <article class="event-item">
          <div class="event-item-main">
            <strong>${escapeHtml(event.summary || "Rezervace Mustangu")}</strong>
            <span>${formatDateRange(start, end)}</span>
            ${event.location ? `<span>${escapeHtml(event.location)}</span>` : ""}
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
          dateTime: start.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
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
    refreshCalendarFrame();
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
    refreshCalendarFrame();
    updateStatus("Rezervace byla smazána.", true);
  } catch (error) {
    updateStatus("Rezervaci se nepodařilo smazat.", false);
    console.error(error);
  }
}

function refreshCalendarFrame() {
  if (!els.calendarFrame) return;
  const src = els.calendarFrame.src.split("&refresh=")[0];
  els.calendarFrame.src = `${src}&refresh=${Date.now()}`;
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
});

els.bookingForm.addEventListener("submit", createBooking);
els.refreshButton.addEventListener("click", listUpcomingEvents);
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
