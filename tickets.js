document.addEventListener('DOMContentLoaded', () => {
  const ticketType = document.body.dataset.ticketType || 'repair';
  const ticketLabel = document.body.dataset.ticketLabel || 'Ticket';

  let tickets = [];
  let activeTicketId = null;

  const ticketListEl = document.getElementById('ticketList');
  const newTicketBtn = document.getElementById('newTicketBtn');
  const loadTicketsBtn = document.getElementById('loadTicketsBtn');
  const fileInput = document.getElementById('fileInput');
  const saveTicketBtn = document.getElementById('saveTicketBtn');

  const ticketForm = document.getElementById('ticketForm');
  const ticketDateEl = document.getElementById('ticketDate');
  const ticketIdEl = document.getElementById('ticketId');

  function generateTicketId() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 900 + 100);
    return `GZ-${y}${m}${d}-${h}${min}${s}-${rand}`;
  }

  function getFormData() {
    const data = {};
    const formData = new FormData(ticketForm);
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    // include unchecked checkboxes as empty so load/save is predictable
    ticketForm.querySelectorAll('input[type="checkbox"]').forEach(input => {
      if (!formData.has(input.name)) {
        data[input.name] = '';
      }
    });

    data.ticketDate = ticketDateEl.value;
    data.ticketId = ticketIdEl.value || null;
    data.type = ticketType;
    return data;
  }

  function setFormData(data) {
    ticketForm.reset();
    ticketDateEl.value = data.ticketDate || '';
    ticketIdEl.value = data.ticketId || '';

    for (const [key, value] of Object.entries(data)) {
      if (key === 'ticketDate' || key === 'ticketId' || key === 'type') continue;
      const field = ticketForm.elements.namedItem(key);
      if (!field) continue;
      if (field.type === 'checkbox') {
        field.checked = !!value;
      } else {
        field.value = value;
      }
    }
  }

  function renderTicketList() {
    ticketListEl.innerHTML = '';
    if (!tickets.length) {
      const msg = document.createElement('div');
      msg.style.fontSize = '0.75rem';
      msg.style.color = 'var(--gz-muted)';
      msg.style.padding = '4px';
      msg.textContent = 'No tickets loaded. Create or load JSON tickets.';
      ticketListEl.appendChild(msg);
      return;
    }

    tickets
      .slice()
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .forEach(ticket => {
        const item = document.createElement('div');
        item.className = 'ticket-item';
        if (ticket.id === activeTicketId) {
          item.classList.add('active');
        }

        const top = document.createElement('div');
        top.className = 'ticket-item-top';

        const title = document.createElement('div');
        title.className = 'ticket-item-title';
        const name = ticket.data.customer_name || 'Unnamed Customer';
        const consoleLabel =
          ticket.data.console_type ||
          ticket.data.console_model ||
          ticketLabel;
        title.textContent = `${name} – ${consoleLabel}`;

        const pill = document.createElement('div');
        pill.className = 'ticket-type-pill ' + (ticket.data.type === 'buytrade' ? 'buytrade' : 'repair');
        pill.textContent = ticket.data.type === 'buytrade' ? 'Buy/Trade' : 'Repair';

        top.appendChild(title);
        top.appendChild(pill);

        const meta = document.createElement('div');
        meta.className = 'ticket-item-meta';
        meta.textContent = ticket.data.ticketDate || 'No date';

        const idLine = document.createElement('div');
        idLine.className = 'ticket-item-id';
        idLine.textContent = ticket.id;

        item.appendChild(top);
        item.appendChild(meta);
        item.appendChild(idLine);

        item.addEventListener('click', () => {
          activeTicketId = ticket.id;
          setFormData(ticket.data);
          renderTicketList();
        });

        ticketListEl.appendChild(item);
      });
  }

  function newTicket() {
    const today = new Date();
    ticketForm.reset();
    ticketDateEl.valueAsNumber = today.getTime() - today.getTimezoneOffset() * 60000;
    ticketIdEl.value = '';
    activeTicketId = null;
    renderTicketList();
  }

  function saveTicket() {
    const data = getFormData();
    if (!data.ticketId) {
      data.ticketId = generateTicketId();
      ticketIdEl.value = data.ticketId;
    }

    const id = data.ticketId;
    const createdTs = Date.now();

    const existingIndex = tickets.findIndex(t => t.id === id);
    if (existingIndex >= 0) {
      tickets[existingIndex] = { id, type: data.type, created: tickets[existingIndex].created, data };
    } else {
      tickets.push({ id, type: data.type, created: createdTs, data });
    }

    activeTicketId = id;
    renderTicketList();

    // Download JSON to wherever the user chooses (flash drive, etc.)
    const blob = new Blob([JSON.stringify({ id, type: data.type, created: createdTs, data }, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gz-ticket-${id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleFiles(files) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    const readers = fileArray.map(file => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = JSON.parse(reader.result);
            if (json && json.id && json.data) {
              resolve(json);
            } else {
              resolve(null);
            }
          } catch (e) {
            console.error('Error parsing ticket JSON', e);
            resolve(null);
          }
        };
        reader.readAsText(file);
      });
    });

    Promise.all(readers).then(results => {
      results.forEach(ticket => {
        if (!ticket) return;
        const existingIndex = tickets.findIndex(t => t.id === ticket.id);
        if (existingIndex >= 0) {
          tickets[existingIndex] = ticket;
        } else {
          tickets.push(ticket);
        }
      });
      if (tickets.length && !activeTicketId) {
        activeTicketId = tickets[0].id;
        setFormData(tickets[0].data);
      }
      renderTicketList();
    });
  }

  // Wire up buttons
  newTicketBtn.addEventListener('click', newTicket);
  saveTicketBtn.addEventListener('click', saveTicket);

  loadTicketsBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', e => {
    handleFiles(e.target.files);
  });

  // First load → new blank ticket
  newTicket();
});
