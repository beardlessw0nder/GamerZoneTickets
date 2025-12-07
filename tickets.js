// Gamerzone ticket system with localStorage persistence
(function () {
  const body = document.body;
  const ticketType = body.dataset.ticketType || "repair"; // "repair" or "buytrade"
  const ticketLabel = body.dataset.ticketLabel || "Console";

  const STORAGE_KEY = `gzTickets_${ticketType}_v1`;
  const STORAGE_LAST_KEY = `${STORAGE_KEY}_lastActive`;

  const ticketListEl = document.getElementById("ticketList");
  const newTicketBtn = document.getElementById("newTicketBtn");
  const loadTicketsBtn = document.getElementById("loadTicketsBtn");
  const fileInput = document.getElementById("fileInput");
  const saveTicketBtn = document.getElementById("saveTicketBtn");
  const ticketForm = document.getElementById("ticketForm");
  const ticketDateInput = document.getElementById("ticketDate");
  const ticketIdInput = document.getElementById("ticketId");

  let tickets = [];
  let activeTicketId = null;

  // ==== Init ====
  document.addEventListener("DOMContentLoaded", () => {
    attachEventListeners();
    loadTicketsFromStorage();
    if (!tickets.length) {
      createNewTicket(true);
    } else {
      const last = localStorage.getItem(STORAGE_LAST_KEY);
      if (last && tickets.find(t => t.id === last)) {
        selectTicket(last, false);
      } else {
        selectTicket(tickets[0].id, false);
      }
    }
  });

  function attachEventListeners() {
    if (newTicketBtn) {
      newTicketBtn.addEventListener("click", () => {
        saveActiveTicketFromForm();
        createNewTicket(true);
      });
    }

    if (loadTicketsBtn && fileInput) {
      loadTicketsBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", handleFileLoad);
    }

    if (saveTicketBtn) {
      saveTicketBtn.addEventListener("click", () => {
        const ticket = saveActiveTicketFromForm();
        if (!ticket) return;
        downloadTicketAsJson(ticket);
      });
    }

    if (ticketForm) {
      ticketForm.addEventListener("input", () => {
        // Auto-update and persist on any input change
        saveActiveTicketFromForm(false);
      });
    }
  }

  // ==== Ticket Model Helpers ====

  function createNewTicket(makeActive) {
    const now = new Date();
    const id = generateTicketId(now);
    const dateStr = now.toISOString().slice(0, 10);

    const ticket = {
      id,
      type: ticketType,
      label: ticketLabel,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      date: dateStr,
      fields: {}
    };

    tickets.push(ticket);
    persistTicketsToStorage();
    renderTicketList();

    if (makeActive) {
      selectTicket(ticket.id, true);
    }

    return ticket;
  }

  function generateTicketId(date) {
    const prefix = ticketType === "buytrade" ? "BT" : "RP";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const short = `${y}${m}${d}`;
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `${prefix}-${short}-${rand}`;
  }

  function getActiveTicket() {
    if (!activeTicketId) return null;
    return tickets.find(t => t.id === activeTicketId) || null;
  }

  function saveActiveTicketFromForm(updateIdIfEmpty = true) {
    if (!ticketForm) return null;

    let ticket = getActiveTicket();
    if (!ticket) {
      // If somehow none exists, create one
      ticket = createNewTicket(true);
    }

    const formData = new FormData(ticketForm);
    const fields = {};
    formData.forEach((value, key) => {
      fields[key] = value;
    });

    ticket.fields = fields;
    ticket.date = ticketDateInput ? ticketDateInput.value || null : null;

    // If ticketId field is blank and we allow update, fill it with id
    if (ticketIdInput) {
      if (!ticketIdInput.value && updateIdIfEmpty) {
        ticketIdInput.value = ticket.id;
      }
      ticket.ticketId = ticketIdInput.value;
    }

    ticket.updatedAt = new Date().toISOString();
    persistTicketsToStorage();
    renderTicketList(); // update titles/metadata in sidebar

    return ticket;
  }

  function applyTicketToForm(ticket) {
    if (!ticketForm || !ticket) return;

    // Fill date + ticket ID fields
    if (ticketDateInput) {
      ticketDateInput.value = ticket.date || "";
    }
    if (ticketIdInput) {
      ticketIdInput.value = ticket.ticketId || ticket.id || "";
    }

    // Clear existing fields first
    const formElements = ticketForm.elements;
    for (let el of formElements) {
      if (!el.name) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = false;
      } else {
        el.value = "";
      }
    }

    // Apply from ticket.fields
    if (ticket.fields) {
      Object.keys(ticket.fields).forEach(name => {
        const value = ticket.fields[name];
        const el = ticketForm.elements[name];
        if (!el) return;

        if (el.length && el[0] && (el[0].type === "radio" || el[0].type === "checkbox")) {
          // Group (radio/checkbox)
          for (let i = 0; i < el.length; i++) {
            el[i].checked = Array.isArray(value)
              ? value.includes(el[i].value)
              : value === el[i].value;
          }
        } else if (el.type === "checkbox") {
          el.checked = !!value;
        } else {
          el.value = value;
        }
      });
    }
  }

  // ==== Rendering Sidebar ====
  function renderTicketList() {
    if (!ticketListEl) return;
    ticketListEl.innerHTML = "";

    tickets
      .slice()
      .sort((a, b) => {
        // Newest updated first
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      })
      .forEach(ticket => {
        const item = document.createElement("div");
        item.className = "ticket-item" + (ticket.id === activeTicketId ? " active" : "");

        const top = document.createElement("div");
        top.className = "ticket-item-top";

        const title = document.createElement("div");
        title.className = "ticket-item-title";
        const name = (ticket.fields && ticket.fields.customer_name) || "No Name";
        title.textContent = name;

        const pill = document.createElement("div");
        pill.className = "ticket-type-pill " + (ticketType === "buytrade" ? "buytrade" : "repair");
        pill.textContent = ticketLabel;

        top.appendChild(title);
        top.appendChild(pill);

        const meta = document.createElement("div");
        meta.className = "ticket-item-meta";
        const dateStr = ticket.date || (ticket.createdAt ? ticket.createdAt.slice(0, 10) : "");
        const idShort = (ticket.ticketId || ticket.id || "").slice(0, 18);
        meta.innerHTML = `
          <span>${dateStr || ""}</span>
          <span class="ticket-item-id">${idShort}</span>
        `;

        item.appendChild(top);
        item.appendChild(meta);

        item.addEventListener("click", () => {
          saveActiveTicketFromForm(false);
          selectTicket(ticket.id, true);
        });

        ticketListEl.appendChild(item);
      });
  }

  function selectTicket(id, scrollIntoView) {
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return;
    activeTicketId = id;
    localStorage.setItem(STORAGE_LAST_KEY, id);

    // Update sidebar active class
    if (ticketListEl) {
      const items = ticketListEl.querySelectorAll(".ticket-item");
      items.forEach(el => el.classList.remove("active"));
      const match = Array.from(items).find(el =>
        el.querySelector(".ticket-item-id") &&
        (el.querySelector(".ticket-item-id").textContent || "").includes(
          (ticket.ticketId || ticket.id || "").slice(0, 6)
        )
      );
      // If the above matching is too fuzzy, we just update on render
    }
    renderTicketList();
    applyTicketToForm(ticket);

    if (scrollIntoView && ticketListEl) {
      const activeEl = ticketListEl.querySelector(".ticket-item.active");
      if (activeEl && activeEl.scrollIntoView) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }

  // ==== localStorage Persistence ====
  function persistTicketsToStorage() {
    try {
      const data = JSON.stringify(tickets);
      localStorage.setItem(STORAGE_KEY, data);
    } catch (e) {
      console.error("Failed to persist tickets to localStorage", e);
    }
  }

  function loadTicketsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        tickets = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        tickets = parsed;
      } else {
        tickets = [];
      }
    } catch (e) {
      console.error("Failed to load tickets from localStorage", e);
      tickets = [];
    }
    renderTicketList();
  }

  // ==== File Load / Save (JSON) ====

  function handleFileLoad(event) {
    const files = event.target.files;
    if (!files || !files.length) return;

    const readers = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      readers.push(
        new Promise(resolve => {
          reader.onload = e => {
            try {
              const obj = JSON.parse(e.target.result);
              addOrMergeLoadedTicket(obj);
            } catch (err) {
              console.error("Invalid ticket JSON in file:", file.name, err);
            }
            resolve();
          };
          reader.readAsText(file);
        })
      );
    }

    Promise.all(readers).then(() => {
      persistTicketsToStorage();
      renderTicketList();
      if (tickets.length && !activeTicketId) {
        selectTicket(tickets[0].id, true);
      }
      // Reset file input so selecting same file again works
      event.target.value = "";
    });
  }

  function addOrMergeLoadedTicket(obj) {
    // Expect our own format; if not, wrap/normalize
    let ticket = obj;
    if (!ticket.id) {
      ticket.id = generateTicketId(new Date());
    }
    if (!ticket.type) {
      ticket.type = ticketType;
    }
    if (!ticket.label) {
      ticket.label = ticketLabel;
    }
    if (!ticket.fields && typeof ticket === "object") {
      // If user loaded an older "flat" JSON, attempt to treat as fields
      ticket = {
        id: ticket.id,
        type: ticket.type,
        label: ticket.label,
        createdAt: ticket.createdAt || new Date().toISOString(),
        updatedAt: ticket.updatedAt || new Date().toISOString(),
        date: ticket.date || null,
        fields: ticket
      };
    }

    const existingIdx = tickets.findIndex(t => t.id === ticket.id);
    if (existingIdx >= 0) {
      tickets[existingIdx] = ticket;
    } else {
      tickets.push(ticket);
    }
  }

  function downloadTicketAsJson(ticket) {
    const blob = new Blob([JSON.stringify(ticket, null, 2)], {
      type: "application/json"
    });

    const nameBase = (ticket.fields.customer_name || ticket.ticketId || ticket.id || "ticket")
      .toString()
      .replace(/[^\w\-]+/g, "_");

    const fileName = `${ticketType}-${nameBase}.json`;
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
})();
