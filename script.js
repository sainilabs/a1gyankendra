// ===== CONFIGURATION =====
var API_URL = "https://api.sheetbest.com/sheets/6f63bdd3-23ba-40b1-943b-ef9917edd82b";
var PAYMENTS_URL = API_URL + "/tabs/Payments";
var RESET_PASSWORD = "dd@123";

// ===== STATE =====
var seatData = {};
var currentSeat = null;
var paymentsCache = [];

// ===== DOM REFERENCES =====
var seatGrid = document.getElementById('seatGrid');
var modalOverlay = document.getElementById('modalOverlay');
var modalTitle = document.getElementById('modalTitle');
var modalClose = document.getElementById('modalClose');
var studentNameInput = document.getElementById('studentName');
var phoneNumberInput = document.getElementById('phoneNumber');
var feesAmountInput = document.getElementById('feesAmount');
var startDateInput = document.getElementById('startDate');
var lastPaidInput = document.getElementById('lastPaid');
var durationInput = document.getElementById('duration');
var feesStatusSelect = document.getElementById('feesStatus');
var remarksInput = document.getElementById('remarks');
var anyOtherInput = document.getElementById('anyOther');
var dueDateDisplay = document.getElementById('dueDateDisplay');
var feeWarning = document.getElementById('feeWarning');
var paymentHistoryDiv = document.getElementById('paymentHistory');
var btnSave = document.getElementById('btnSave');
var btnRemove = document.getElementById('btnRemove');
var btnWhatsapp = document.getElementById('btnWhatsapp');
var modalMessage = document.getElementById('modalMessage');
var searchInput = document.getElementById('searchInput');
var totalSeatsEl = document.getElementById('totalSeats');
var occupiedCountEl = document.getElementById('occupiedCount');
var pendingCountEl = document.getElementById('pendingCount');
var emptyCountEl = document.getElementById('emptyCount');
var revenueThisMonthEl = document.getElementById('revenueThisMonth');
var totalPendingFeesEl = document.getElementById('totalPendingFees');
var expiringSoonCountEl = document.getElementById('expiringSoonCount');

// ===== HELPERS =====
function todayDate() {
  return new Date(new Date().toDateString());
}

function calcDueDate(lastPaid, duration) {
  if (!lastPaid || !duration) return null;
  var d = new Date(lastPaid);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + parseInt(duration));
  return d;
}

function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function toISODate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
}

function getMonthLabel(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return m[d.getMonth()] + '-' + d.getFullYear();
}

function getCurrentMonthLabel() {
  var d = new Date();
  var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return m[d.getMonth()] + '-' + d.getFullYear();
}

// ===== INITIALIZE =====
function init() {
  console.log('=== A1Gyankendra: Initializing ===');
  collectAllSeats();
  attachEventListeners();
  fetchSheetData();
}

function collectAllSeats() {
  document.querySelectorAll('.seat').forEach(function(el) {
    var id = el.getAttribute('data-seat');
    seatData[id] = { student:'', phone:'', feesAmount:'', startDate:'', lastPaidDate:'', durationDays:'30', feesStatus:'', remarks:'', anyOther:'' };
  });
  console.log('Seats found:', Object.keys(seatData).length);
}

// ===== FETCH DATA =====
function fetchSheetData() {
  console.log('Fetching data from:', API_URL);

  Promise.all([
    fetch(API_URL).then(function(r) {
      console.log('Seats API status:', r.status);
      return r.json();
    }),
    fetch(PAYMENTS_URL).then(function(r) {
      console.log('Payments API status:', r.status);
      return r.json();
    }).catch(function(err) {
      console.warn('Payments fetch failed (tab may not exist):', err);
      return [];
    })
  ]).then(function(results) {
    var seatsRows = results[0];
    var paymentsRows = results[1];

    console.log('Seats rows received:', seatsRows.length);
    console.log('Sample row:', seatsRows[0]);

    paymentsCache = Array.isArray(paymentsRows) ? paymentsRows : [];

    seatsRows.forEach(function(row) {
      var id = String(row['Seat'] || '');
      if (!id || !seatData.hasOwnProperty(id)) return;
      seatData[id] = {
        student: row['Student Name'] || '',
        phone: row['Phone Number'] || '',
        feesAmount: row['Fees Amount'] || '',
        startDate: row['Start Date'] || '',
        lastPaidDate: row['Last Paid'] || '',
        durationDays: row['Duration (Days)'] || '30',
        feesStatus: row['Fees Status'] || '',
        remarks: row['Remarks'] || '',
        anyOther: row['Any Other'] || ''
      };
    });

    autoDetectPending();
    updateAllSeats();
    updateStats();
    console.log('=== Data loaded successfully ===');
  }).catch(function(err) {
    console.error('FETCH FAILED:', err);
    updateAllSeats();
    updateStats();
  });
}

// ===== AUTO DETECT PENDING =====
function autoDetectPending() {
  var today = todayDate();
  Object.keys(seatData).forEach(function(id) {
    var info = seatData[id];
    if (!info.student) return;
    var dueDate = calcDueDate(info.lastPaidDate, info.durationDays);
    if (dueDate && today > dueDate) {
      info.feesStatus = 'Pending';
    }
  });
}

// ===== SAVE TO SHEET =====
function saveToSheet(seatId, data) {
  var payload = {
    'Seat': String(seatId),
    'Student Name': String(data.student || ''),
    'Phone Number': String(data.phone || ''),
    'Fees Amount': String(data.feesAmount || ''),
    'Start Date': String(data.startDate || ''),
    'Last Paid': String(data.lastPaidDate || ''),
    'Duration (Days)': String(data.durationDays || '30'),
    'Fees Status': String(data.feesStatus || ''),
    'Remarks': String(data.remarks || ''),
    'Any Other': String(data.anyOther || '')
  };

  console.log('Saving payload:', JSON.stringify(payload, null, 2));

  return fetch(API_URL)
    .then(function(res) { return res.json(); })
    .then(function(rows) {
      var exists = rows.some(function(row) { return String(row.Seat) === String(seatId); });

      if (exists) {
        console.log('Seat ' + seatId + ' exists → PATCH update');
        return fetch(API_URL + '/Seat/' + seatId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        console.log('Seat ' + seatId + ' new → POST create');
        return fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    })
    .then(function(res) {
      console.log('Save response status:', res.status);
      return res.text().then(function(body) {
        console.log('Save response body:', body);
        return res;
      });
    })
    .catch(function(err) {
      console.error('Save FAILED:', err);
    });
}

// ===== SAVE PAYMENT RECORD =====
function addPaymentRecord(seatId, student, amount, paidDate) {
  var payload = {
    'Seat': String(seatId),
    'Student': student,
    'Month': getMonthLabel(paidDate),
    'Amount': amount,
    'Paid Date': paidDate
  };
  console.log('Saving payment:', payload);
  return fetch(PAYMENTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(res) {
    console.log('Payment save status:', res.status);
    paymentsCache.push(payload);
  }).catch(function(err) {
    console.warn('Payment record failed:', err);
  });
}

// ===== REMOVE DATA =====
function removeFromSheet(seatId) {
  console.log('Deleting seat:', seatId);
  return fetch(API_URL + '/Seat/' + seatId, { method: 'DELETE' })
    .then(function(res) {
      console.log('Delete status:', res.status);
    })
    .catch(function(err) {
      console.error('Delete failed:', err);
    });
}

// ===== SEAT RENDERING =====
function updateAllSeats() {
  document.querySelectorAll('.seat').forEach(function(el) {
    applySeatClass(el, seatData[el.getAttribute('data-seat')]);
  });
}

function applySeatClass(el, info) {
  el.classList.remove('empty', 'occupied', 'pending');
  if (!info || !info.student) {
    el.classList.add('empty');
  } else if (info.feesStatus === 'Pending') {
    el.classList.add('pending');
  } else {
    el.classList.add('occupied');
  }
}

function updateSingleSeat(seatId) {
  var el = document.querySelector('.seat[data-seat="' + seatId + '"]');
  if (el) applySeatClass(el, seatData[seatId]);
}

// ===== STATS =====
function updateStats() {
  var allSeats = Object.keys(seatData);
  var today = todayDate();
  var currentMonth = getCurrentMonthLabel();
  var occupied = 0, pending = 0, empty = 0, expiringSoon = 0;
  var totalPending = 0;

  allSeats.forEach(function(id) {
    var info = seatData[id];
    if (!info.student) { empty++; return; }
    occupied++;
    var amt = parseFloat(info.feesAmount) || 0;
    if (info.feesStatus === 'Pending') {
      pending++;
      totalPending += amt;
    }
    var dueDate = calcDueDate(info.lastPaidDate, info.durationDays);
    if (dueDate) {
      var daysLeft = Math.ceil((dueDate - today) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 3 && info.feesStatus !== 'Pending') {
        expiringSoon++;
      }
    }
  });

  var revenueThisMonth = 0;
  if (paymentsCache.length > 0) {
    paymentsCache.forEach(function(p) {
      if (p.Month === currentMonth) {
        revenueThisMonth += parseFloat(p.Amount) || 0;
      }
    });
  } else {
    // Fallback: calculate from seat data if Payments tab unavailable
    allSeats.forEach(function(id) {
      var info = seatData[id];
      if (!info.student || info.feesStatus !== 'Paid') return;
      if (info.lastPaidDate && getMonthLabel(info.lastPaidDate) === currentMonth) {
        revenueThisMonth += parseFloat(info.feesAmount) || 0;
      }
    });
  }

  totalSeatsEl.textContent = allSeats.length;
  occupiedCountEl.textContent = occupied;
  pendingCountEl.textContent = pending;
  emptyCountEl.textContent = empty;
  revenueThisMonthEl.textContent = '\u20B9' + revenueThisMonth;
  totalPendingFeesEl.textContent = '\u20B9' + totalPending;
  expiringSoonCountEl.textContent = expiringSoon;
}

// ===== SEARCH =====
function handleSearch() {
  var query = searchInput.value.toLowerCase().trim();
  var resultsDiv = document.getElementById('searchResults');

  // Highlight seats
  document.querySelectorAll('.seat').forEach(function(el) {
    el.classList.remove('highlight');
    if (!query) return;
    var info = seatData[el.getAttribute('data-seat')];
    if (info.student && info.student.toLowerCase().indexOf(query) !== -1) {
      el.classList.add('highlight');
    }
  });

  // Show search results dropdown
  if (!query) {
    resultsDiv.innerHTML = '';
    resultsDiv.classList.remove('active');
    return;
  }

  var matches = [];
  Object.keys(seatData).forEach(function(id) {
    var info = seatData[id];
    if (info.student && info.student.toLowerCase().indexOf(query) !== -1) {
      matches.push({ seat: id, info: info });
    }
  });

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<div class="search-no-result">No student found</div>';
    resultsDiv.classList.add('active');
    return;
  }

  var html = '';
  matches.forEach(function(m) {
    var statusClass = (m.info.feesStatus === 'Pending') ? 'pending' : 'paid';
    var dueDate = calcDueDate(m.info.lastPaidDate, m.info.durationDays);
    var dueDateStr = dueDate ? formatDate(dueDate) : '-';
    html += '<div class="search-result-card" data-seat="' + m.seat + '">'
      + '<div class="sr-name">Seat ' + m.seat + ' — ' + m.info.student + '</div>'
      + '<div class="sr-details">'
      + '<span>\u260E ' + (m.info.phone || '-') + '</span>'
      + '<span>\u20B9' + (m.info.feesAmount || '0') + '</span>'
      + '<span class="sr-status ' + statusClass + '">' + (m.info.feesStatus || '-') + '</span>'
      + '</div>'
      + '<div class="sr-details">'
      + '<span>Due: ' + dueDateStr + '</span>'
      + '<span>Remarks: ' + (m.info.remarks || '-') + '</span>'
      + '</div>'
      + '</div>';
  });
  resultsDiv.innerHTML = html;
  resultsDiv.classList.add('active');

  // Click on result to open modal
  resultsDiv.querySelectorAll('.search-result-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var seatId = card.getAttribute('data-seat');
      resultsDiv.classList.remove('active');
      searchInput.value = '';
      document.querySelectorAll('.seat').forEach(function(el) { el.classList.remove('highlight'); });
      openModal(seatId);
    });
  });
}

// ===== PAYMENT HISTORY =====
function renderPaymentHistory(seatId) {
  var records = paymentsCache.filter(function(p) { return String(p.Seat) === String(seatId); });
  if (records.length === 0) {
    paymentHistoryDiv.innerHTML = '<h4>Payment History</h4><p class="ph-empty">No payment records yet.</p>';
    return;
  }
  var html = '<h4>Payment History</h4><table><tr><th>Month</th><th>Amount</th><th>Paid Date</th></tr>';
  records.slice().reverse().forEach(function(r) {
    html += '<tr><td>' + (r.Month || '') + '</td><td>\u20B9' + (r.Amount || '0') + '</td><td>' + (r['Paid Date'] || '') + '</td></tr>';
  });
  html += '</table>';
  paymentHistoryDiv.innerHTML = html;
}

// ===== MODAL =====
function openModal(seatId) {
  currentSeat = seatId;
  var info = seatData[seatId];

  modalTitle.textContent = 'Seat ' + seatId;
  studentNameInput.value = info.student || '';
  phoneNumberInput.value = info.phone || '';
  feesAmountInput.value = info.feesAmount || '';
  startDateInput.value = toISODate(info.startDate) || new Date().toISOString().split('T')[0];
  lastPaidInput.value = toISODate(info.lastPaidDate) || new Date().toISOString().split('T')[0];
  durationInput.value = info.durationDays || '30';
  feesStatusSelect.value = info.feesStatus || 'Paid';
  remarksInput.value = info.remarks || '';
  anyOtherInput.value = info.anyOther || '';
  modalMessage.textContent = '';
  modalMessage.className = 'modal-message';

  var hasStudent = !!info.student;
  btnRemove.style.display = hasStudent ? 'block' : 'none';
  btnWhatsapp.style.display = (hasStudent && info.feesStatus === 'Pending') ? 'block' : 'none';

  updateDueDateDisplay(info);
  updateFeeWarning(info);
  renderPaymentHistory(seatId);
  modalOverlay.classList.add('active');
}

function updateDueDateDisplay(info) {
  if (info.student && info.lastPaidDate && info.durationDays) {
    var due = calcDueDate(info.lastPaidDate, info.durationDays);
    dueDateDisplay.innerHTML = 'Due Date: <strong>' + formatDate(due) + '</strong>';
  } else {
    dueDateDisplay.innerHTML = '';
  }
}

function updateFeeWarning(info) {
  if (!info.student) { feeWarning.textContent = ''; return; }
  var dueDate = calcDueDate(info.lastPaidDate, info.durationDays);
  if (!dueDate) { feeWarning.textContent = ''; return; }
  var today = todayDate();
  if (today > dueDate) {
    feeWarning.textContent = '\u26A0 Fee expired on: ' + formatDate(dueDate);
  } else {
    var daysLeft = Math.ceil((dueDate - today) / 86400000);
    if (daysLeft <= 3) {
      feeWarning.textContent = '\u26A0 Fee expiring in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + '!';
    } else {
      feeWarning.textContent = '';
    }
  }
}

function closeModal() {
  currentSeat = null;
  modalOverlay.classList.remove('active');
  dueDateDisplay.innerHTML = '';
  feeWarning.textContent = '';
  paymentHistoryDiv.innerHTML = '';
  modalMessage.textContent = '';
}

// ===== SAVE =====
function handleSave() {
  if (!currentSeat) return;

  var student = studentNameInput.value.trim();
  var phone = phoneNumberInput.value.trim();
  var feesAmount = feesAmountInput.value.trim();
  var startDate = startDateInput.value;
  var lastPaidDate = lastPaidInput.value;
  var durationDays = durationInput.value.trim() || '30';
  var feesStatus = feesStatusSelect.value;
  var remarks = remarksInput.value.trim();
  var anyOther = anyOtherInput.value.trim();

  if (!student || phone.replace(/\D/g, '').length < 10 || !feesAmount || parseFloat(feesAmount) <= 0 || !startDate || !lastPaidDate || !durationDays || !remarks) {
    modalMessage.textContent = 'Please fill all required fields.';
    modalMessage.className = 'modal-message error';
    return;
  }

  var data = {
    student: student,
    phone: phone,
    feesAmount: feesAmount,
    startDate: startDate,
    lastPaidDate: lastPaidDate,
    durationDays: durationDays,
    feesStatus: feesStatus,
    remarks: remarks,
    anyOther: anyOther
  };

  seatData[currentSeat] = data;
  updateSingleSeat(currentSeat);
  updateStats();

  var seatId = currentSeat;

  var savePromise = saveToSheet(seatId, data);

  if (feesStatus === 'Paid') {
    savePromise = savePromise.then(function() {
      return addPaymentRecord(seatId, student, feesAmount, lastPaidDate);
    });
  }

  savePromise
    .then(function() {
      updateStats();
      closeModal();
    })
    .catch(function(err) {
      console.error('Save failed:', err);
      closeModal();
    });
}

// ===== REMOVE =====
function handleRemove() {
  if (!currentSeat) return;

  seatData[currentSeat] = { student:'', phone:'', feesAmount:'', startDate:'', lastPaidDate:'', durationDays:'30', feesStatus:'', remarks:'', anyOther:'' };
  updateSingleSeat(currentSeat);
  updateStats();

  removeFromSheet(currentSeat)
    .then(function() { closeModal(); })
    .catch(function(err) { console.error('Remove failed:', err); closeModal(); });
}

// ===== WHATSAPP REMINDER =====
function handleWhatsapp() {
  if (!currentSeat) return;
  var info = seatData[currentSeat];
  if (!info.phone) { alert('No phone number available'); return; }

  var phone = info.phone.replace(/\D/g, '');
  var dueDate = calcDueDate(info.lastPaidDate, info.durationDays);
  var dueDateStr = dueDate ? formatDate(dueDate) : 'N/A';

  var message = 'Hello ' + info.student + ', your library seat fee is pending. '
    + 'Due date was: ' + dueDateStr + '. '
    + 'Amount: \u20B9' + (info.feesAmount || '0') + '. '
    + 'Please pay at the earliest. Thank you!';

  var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}

// ===== RESET ALL =====
function handleResetAll() {
  document.getElementById('confirmOverlay').classList.add('active');
}

function confirmReset() {
  var passwordInput = document.getElementById('resetPassword');
  var errorEl = document.getElementById('resetError');

  if (passwordInput.value !== RESET_PASSWORD) {
    errorEl.textContent = 'Wrong password! Try again.';
    passwordInput.value = '';
    return;
  }

  errorEl.textContent = '';
  passwordInput.value = '';
  document.getElementById('confirmOverlay').classList.remove('active');

  // Delete all occupied seats from sheet
  var deletePromises = [];
  Object.keys(seatData).forEach(function(id) {
    if (seatData[id].student) {
      deletePromises.push(removeFromSheet(id));
    }
  });

  // Reset local state
  Object.keys(seatData).forEach(function(id) {
    seatData[id] = { student:'', phone:'', feesAmount:'', startDate:'', lastPaidDate:'', durationDays:'30', feesStatus:'', remarks:'', anyOther:'' };
  });
  paymentsCache = [];
  updateAllSeats();
  updateStats();

  Promise.all(deletePromises).then(function() {
    console.log('All data reset successfully');
  }).catch(function(err) {
    console.error('Some deletes failed:', err);
  });
}

function cancelReset() {
  document.getElementById('resetPassword').value = '';
  document.getElementById('resetError').textContent = '';
  document.getElementById('confirmOverlay').classList.remove('active');
}

// ===== STATS LIST POPUP =====
function showPendingList() {
  var today = todayDate();
  var list = [];
  Object.keys(seatData).forEach(function(id) {
    var info = seatData[id];
    if (!info.student) return;
    if (info.feesStatus === 'Pending') {
      var dueDate = calcDueDate(info.lastPaidDate, info.durationDays);
      list.push({ seat: id, info: info, dueDate: dueDate });
    }
  });
  renderStatsList('Pending Fees Students', list, 'pending');
}

function showExpiringSoonList() {
  var today = todayDate();
  var list = [];
  Object.keys(seatData).forEach(function(id) {
    var info = seatData[id];
    if (!info.student) return;
    var dueDate = calcDueDate(info.lastPaidDate, info.durationDays);
    if (dueDate) {
      var daysLeft = Math.ceil((dueDate - today) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 3 && info.feesStatus !== 'Pending') {
        list.push({ seat: id, info: info, dueDate: dueDate, daysLeft: daysLeft });
      }
    }
  });
  renderStatsList('Expiring Soon Students', list, 'expiring');
}

function renderStatsList(title, list, type) {
  var overlay = document.getElementById('statsListOverlay');
  document.getElementById('statsListTitle').textContent = title;
  var body = document.getElementById('statsListBody');

  if (list.length === 0) {
    body.innerHTML = '<div class="stats-list-empty">No students found</div>';
    overlay.classList.add('active');
    return;
  }

  var html = '';
  list.forEach(function(item) {
    var dueDateStr = item.dueDate ? formatDate(item.dueDate) : '-';
    var extraInfo = '';
    if (type === 'pending') {
      extraInfo = '<span>Due: ' + dueDateStr + '</span>';
    } else {
      extraInfo = '<span>' + item.daysLeft + ' day' + (item.daysLeft === 1 ? '' : 's') + ' left</span>';
    }
    html += '<div class="stats-list-card" data-seat="' + item.seat + '">'
      + '<div class="sl-top">'
      + '<span class="sl-name">' + item.info.student + '</span>'
      + '<span class="sl-seat">Seat ' + item.seat + '</span>'
      + '</div>'
      + '<div class="sl-info">'
      + '<span>\u20B9' + (item.info.feesAmount || '0') + '</span>'
      + '<span>\u260E ' + (item.info.phone || '-') + '</span>'
      + extraInfo
      + '</div>'
      + '</div>';
  });
  body.innerHTML = html;

  body.querySelectorAll('.stats-list-card').forEach(function(card) {
    card.addEventListener('click', function() {
      closeStatsList();
      openModal(card.getAttribute('data-seat'));
    });
  });

  overlay.classList.add('active');
}

function closeStatsList() {
  document.getElementById('statsListOverlay').classList.remove('active');
}

// ===== EVENT LISTENERS =====
function attachEventListeners() {
  seatGrid.addEventListener('click', function(e) {
    var seat = e.target.closest('.seat');
    if (seat) openModal(seat.getAttribute('data-seat'));
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function(e) { if (e.target === modalOverlay) closeModal(); });
  btnSave.addEventListener('click', handleSave);
  btnRemove.addEventListener('click', handleRemove);
  btnWhatsapp.addEventListener('click', handleWhatsapp);
  searchInput.addEventListener('input', handleSearch);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', function(e) {
    var resultsDiv = document.getElementById('searchResults');
    if (!e.target.closest('.search-bar')) {
      resultsDiv.classList.remove('active');
    }
  });

  // Reset All
  document.getElementById('btnResetAll').addEventListener('click', handleResetAll);
  document.getElementById('btnConfirmYes').addEventListener('click', confirmReset);
  document.getElementById('btnConfirmNo').addEventListener('click', cancelReset);

  // Stats List Popup
  document.getElementById('statPendingFees').addEventListener('click', showPendingList);
  document.getElementById('statExpiringSoon').addEventListener('click', showExpiringSoonList);
  document.getElementById('statsListClose').addEventListener('click', closeStatsList);
  document.getElementById('statsListOverlay').addEventListener('click', function(e) {
    if (e.target === document.getElementById('statsListOverlay')) closeStatsList();
  });

  startDateInput.addEventListener('change', function() {
    // Sync Last Paid with Start Date when adding new student
    lastPaidInput.value = startDateInput.value;
    updateLiveDueDate();
  });
  lastPaidInput.addEventListener('change', updateLiveDueDate);
  durationInput.addEventListener('input', updateLiveDueDate);
}

function updateLiveDueDate() {
  var lp = lastPaidInput.value;
  var dur = durationInput.value;
  if (lp && dur) {
    var due = calcDueDate(lp, dur);
    dueDateDisplay.innerHTML = 'Due Date: <strong>' + formatDate(due) + '</strong>';
  } else {
    dueDateDisplay.innerHTML = '';
  }
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);