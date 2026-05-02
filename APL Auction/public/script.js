const DEMO_MODE = false;
// ============================================================
// APL — Asian Premier League | Main Application Script
// ============================================================

// ============================================================
// APP STATE
// ============================================================
const APP = {
  players: [],
  teams: [],
  currentFilter: 'all',
  currentSort: 'name',
  currentUser: null,
  isAdmin: false,
  myTeam: null,
  auction: {
    active: false,
    currentPlayerIndex: 0,
    currentPlayer: null,
    currentBid: 0,
    currentBidTeam: null,
    timer: 30,
    timerInterval: null,
    bidLog: [],
    playerQueue: [],
    paused: false,
    rtmPlayer: null
  },
  uploadedImageUrl: null,
  currentSellPlayerId: null,
  initialized: false
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Show loader
  setTimeout(() => {
    document.getElementById('pageLoader').style.opacity = '0';
    document.getElementById('pageLoader').style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      document.getElementById('pageLoader').style.display = 'none';
      APP.initialized = true;
    }, 500);
  }, 2000);

 // Setup drag & drop upload
setupDragDrop();

// Safe check for DEMO_MODE (prevents crash if undefined)
if (typeof DEMO_MODE !== "undefined" && DEMO_MODE) {
  APP.players = DEMO_PLAYERS.map(p => ({ ...p }));
  APP.teams = DEMO_TEAMS.map(t => ({ ...t }));
  renderAll();
  notify('info', 'Demo Mode', 'Using demo data. Configure Firebase to go live!');
  return;
}

  // Firebase: Auth state listener
  auth.onAuthStateChanged(async (user) => {
    APP.currentUser = user;
    if (user) {
      APP.isAdmin = ADMIN_EMAILS.includes(user.email);
      APP.myTeam = APP.teams.find(t => t.ownerEmail && t.ownerEmail.toLowerCase() === user.email.toLowerCase()) || null;
      updateNavForAuth(user);
    } else {
      APP.isAdmin = false;
      APP.myTeam = null;
      updateNavForAuth(null);
    }
    renderAll();
  });

  // Firebase: Real-time data listeners
  setupFirestoreListeners();
});

function setupFirestoreListeners() {
  // Players listener
  playersRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    APP.players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAll();
  }, (err) => {
    console.error('Players listener error:', err);
    notify('error', 'Connection Error', 'Could not load player data.');
  });

  // Teams listener
  teamsRef.onSnapshot((snapshot) => {
    APP.teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAll();
  });

  // Auction listener
  auctionRef.doc('state').onSnapshot((doc) => {
    if (doc.exists) {
      const state = doc.data();
      syncAuctionState(state);
    }
  });
}

function renderAll() {
  renderPlayers();
  renderTeams();
  renderHomePage();
  renderAdminDashboard();
  renderPursePanel();
  renderQueueTable();
  renderAllPlayersTable();
  renderTeamsAdminTable();
  renderApprovalsPanel();
  renderPlayerQueue();
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(pageId) {
  // Close mobile nav
  document.getElementById('navLinks').classList.remove('open');

  if (pageId === 'admin') {
    if (!APP.isAdmin && !DEMO_MODE) {
      notify('error', 'Access Denied', 'You do not have admin privileges.');
      return;
    }
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(`page-${pageId}`);
  if (target) {
    target.classList.add('active');
  }

  // Update nav active state
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.remove('active');
    if (a.dataset.page === pageId) a.classList.add('active');
  });

  // Trigger page-specific renders
  if (pageId === 'auction') renderAuctionPage();
  if (pageId === 'admin') {
    renderAdminDashboard();
    renderQueueTable();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileNav() {
  document.getElementById('navLinks').classList.toggle('open');
}

function updateNavForAuth(user) {
  const authBtn = document.getElementById('authBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const navUser = document.getElementById('navUser');
  const adminNavItem = document.getElementById('adminNavItem');

  if (user) {
    authBtn.style.display = 'none';
    logoutBtn.style.display = 'flex';
    navUser.style.display = 'flex';
    document.getElementById('navUserEmail').textContent = user.email;
    adminNavItem.style.display = APP.isAdmin ? 'list-item' : 'none';
  } else {
    authBtn.style.display = 'flex';
    logoutBtn.style.display = 'none';
    navUser.style.display = 'none';
    adminNavItem.style.display = 'none';
  }
}

// ============================================================
// AUTHENTICATION
// ============================================================
async function handleAuth(action) {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  const loginBtn = document.getElementById('loginBtn');

  errorEl.style.display = 'none';
  loginBtn.disabled = true;
  loginBtn.textContent = action === 'login' ? '⏳ Signing in...' : '⏳ Creating account...';

  if (DEMO_MODE) {
    // Demo mode: simulate login
    if (email && password) {
      APP.currentUser = { email };
      APP.isAdmin = ADMIN_EMAILS.includes(email);
      APP.myTeam = APP.teams.find(t => t.ownerEmail && t.ownerEmail.toLowerCase() === email.toLowerCase()) || null;
      updateNavForAuth({ email });
      closeModal('authModal');
      notify('success', 'Welcome!', `Signed in as ${email} (Demo Mode)`);
      if (APP.isAdmin) {
        document.getElementById('adminNavItem').style.display = 'list-item';
      }
    } else {
      errorEl.textContent = 'Please enter email and password.';
      errorEl.style.display = 'block';
    }
    loginBtn.disabled = false;
    loginBtn.textContent = '🔐 Sign In';
    return;
  }
try {
  console.log("🔥 Starting auth...", action, email);

  let userCredential;

  if (action === 'login') {
    userCredential = await auth.signInWithEmailAndPassword(email, password);
  } else {
    userCredential = await auth.createUserWithEmailAndPassword(email, password);
  }

  console.log("✅ SUCCESS:", userCredential.user);

  closeModal('authModal');
  notify('success', 'Welcome!', `Successfully signed ${action === 'login' ? 'in' : 'up'}`);

} catch (err) {
  console.error("❌ AUTH ERROR FULL:", err);

  // show BOTH code + message (important)
  errorEl.textContent = `${err.code || ''} ${err.message || ''}`;
  errorEl.style.display = 'block';
}

loginBtn.disabled = false;
loginBtn.textContent = '🔐 Sign In';
}

function getAuthError(code) {
  const msgs = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/too-many-requests': 'Too many attempts. Try again later.'
  };
  return msgs[code] || 'Authentication failed. Please try again.';
}

async function handleLogout() {
  if (DEMO_MODE) {
    APP.currentUser = null;
    APP.isAdmin = false;
    APP.myTeam = null;
    updateNavForAuth(null);
    notify('info', 'Signed Out', 'You have been signed out.');
    return;
  }
  await auth.signOut();
  notify('info', 'Signed Out', 'You have been signed out.');
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// ============================================================
// NOTIFICATIONS
// ============================================================
function notify(type, title, msg, duration = 4000) {
  const container = document.getElementById('notificationContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.innerHTML = `
    <div class="notification-icon">${icons[type] || 'ℹ️'}</div>
    <div class="notification-text">
      <div class="title">${title}</div>
      <div class="msg">${msg}</div>
    </div>
  `;

  container.appendChild(el);
  requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });

  const remove = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  };

  el.addEventListener('click', remove);
  setTimeout(remove, duration);
}

// ============================================================
// HOME PAGE
// ============================================================
function renderHomePage() {
  const players = APP.players.filter(p => p.approved);
  const sold = players.filter(p => p.status === 'sold');

  document.getElementById('statPlayers').textContent = players.length;
  document.getElementById('statTeams').textContent = APP.teams.length;
  document.getElementById('statSold').textContent = sold.length;

  // Recent sold
  const grid = document.getElementById('recentSoldGrid');
  const recentSold = sold.slice(0, 3);

  if (recentSold.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔨</div><h3>No sales yet</h3><p>Auction hasn't started</p></div>`;
    return;
  }

  grid.innerHTML = recentSold.map(p => buildPlayerCard(p)).join('');
}

// ============================================================
// PLAYERS PAGE
// ============================================================
let currentFilterValue = 'all';

function setFilter(value, btn) {
  currentFilterValue = value;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPlayers();
}

function renderPlayers() {
  const grid = document.getElementById('playerGrid');
  if (!grid) return;

  const search = (document.getElementById('playerSearch')?.value || '').toLowerCase();
  const sort = document.getElementById('sortSelect')?.value || 'name';

  let players = APP.players.filter(p => p.approved !== false);

  // Filter
  if (currentFilterValue === 'available') {
    players = players.filter(p => p.status === 'available');
  } else if (currentFilterValue === 'sold') {
    players = players.filter(p => p.status === 'sold');
  } else if (currentFilterValue !== 'all') {
    players = players.filter(p => p.role === currentFilterValue);
  }

  // Search
  if (search) {
    players = players.filter(p =>
      p.name?.toLowerCase().includes(search) ||
      p.country?.toLowerCase().includes(search) ||
      p.robloxUsername?.toLowerCase().includes(search) ||
      p.role?.toLowerCase().includes(search)
    );
  }

  // Sort
  const expOrder = { 'Beginner': 1, 'Intermediate': 2, 'Pro': 3, 'Elite': 4 };
  if (sort === 'price-high') players.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
  else if (sort === 'price-low') players.sort((a, b) => (a.basePrice || 0) - (b.basePrice || 0));
  else if (sort === 'experience') players.sort((a, b) => (expOrder[b.experience] || 0) - (expOrder[a.experience] || 0));
  else players.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (players.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><h3>No players found</h3><p>Try adjusting your search or filters</p></div>`;
    return;
  }

  grid.innerHTML = players.map(p => buildPlayerCard(p)).join('');
}

function buildPlayerCard(p) {
  const statusMap = { available: 'status-available', sold: 'status-sold', unsold: 'status-unsold' };
  const statusText = { available: 'Available', sold: 'Sold', unsold: 'Unsold' };
  const statusCls = statusMap[p.status] || 'status-available';
  const soldInfo = p.status === 'sold' ? `<div style="font-size:0.72rem;color:var(--gold);">→ ${p.soldTo || 'Unknown'}</div>` : '';

  const imgHtml = p.imageUrl
    ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy" />`
    : `<div class="player-img-placeholder"><div class="icon">👤</div><div>${p.role || 'Player'}</div></div>`;

  return `
    <div class="player-card" onclick="openPlayerModal('${p.id}')">
      <div class="player-card-img">
        ${imgHtml}
        <div class="player-status-badge ${statusCls}">${statusText[p.status] || 'Available'}</div>
      </div>
      <div class="player-card-body">
        <div class="player-card-name">${p.name || 'Unknown'}</div>
        <div class="player-card-role">${p.role || 'Player'}</div>
        <div class="player-card-info">
          <div class="info-tag">🌍 ${p.country || '—'}</div>
          <div class="info-tag">⭐ ${p.experience || '—'}</div>
          <div class="info-tag">🕐 ${p.availability || '—'}</div>
        </div>
        ${soldInfo}
        <div class="player-card-price">
          <span class="price-label">Base Price</span>
          <span class="price-value">${formatINR(p.basePrice)}</span>
        </div>
      </div>
    </div>
  `;
}

function openPlayerModal(playerId) {
  const p = APP.players.find(pl => pl.id === playerId);
  if (!p) return;

  document.getElementById('pmPlayerName').textContent = p.name || 'Unknown';
  document.getElementById('pmPlayerRole').textContent = p.role || '';
  document.getElementById('pmCountry').textContent = p.country || '—';
  document.getElementById('pmExperience').textContent = p.experience || '—';
  document.getElementById('pmAvailability').textContent = p.availability || '—';
  document.getElementById('pmBasePrice').textContent = formatINR(p.basePrice);
  document.getElementById('pmStatus').textContent = p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : '—';
  document.getElementById('pmTeam').textContent = p.soldTo || (p.status === 'sold' ? 'Unknown' : 'Available');
  document.getElementById('pmRoblox').textContent = p.robloxUsername || '—';
  document.getElementById('pmDiscord').textContent = p.discordUsername || '—';
  document.getElementById('pmNotes').textContent = p.notes || 'No notes';

  const img = document.getElementById('pmPlayerImg');
  if (p.imageUrl) {
    img.src = p.imageUrl;
    img.style.display = 'block';
    img.onerror = () => {
      img.style.display = 'none';
    };
  } else {
    img.style.display = 'none';
  }

  openModal('playerModal');
}

// ============================================================
// TEAMS PAGE
// ============================================================
function renderTeams() {
  const grid = document.getElementById('teamsGrid');
  if (!grid) return;

  if (APP.teams.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏏</div><h3>No teams yet</h3><p>Teams will be added by the admin</p></div>`;
    return;
  }

  grid.innerHTML = APP.teams.map(t => buildTeamCard(t)).join('');
}

function buildTeamCard(t) {
  const remaining = (t.purse || 0) - (t.spent || 0);
  const filledSlots = (t.players || []).length;
  const maxSlots = t.maxSlots || 11;

  const slotsHtml = Array.from({ length: maxSlots }, (_, i) =>
    `<div class="slot ${i < filledSlots ? 'filled' : ''}"></div>`
  ).join('');

  const logoHtml = t.logoUrl
    ? `<img src="${t.logoUrl}" alt="${t.name}" />`
    : `<div class="logo-placeholder">${t.shortName || '??'}</div>`;

  const playersHtml = (t.players || []).slice(0, 5).map(pl =>
    `<div class="squad-player-tag">${pl}</div>`
  ).join('') + ((t.players || []).length > 5 ? `<div class="squad-player-tag">+${(t.players || []).length - 5} more</div>` : '');

  return `
    <div class="team-card">
      <div class="team-card-header">
        <div class="team-logo">${logoHtml}</div>
        <div class="team-card-info">
          <div class="team-card-name">${t.name || 'Unknown Team'}</div>
          <div class="team-card-owner">Owner: ${t.owner || 'TBA'}</div>
        </div>
      </div>
      <div class="team-card-body">
        <div class="team-purse-display">
          <div class="purse-remaining">${formatINR(remaining)}</div>
          <div class="purse-total">Remaining Purse · Total: ${formatINR(t.purse)}</div>
        </div>
        <div style="font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Squad (${filledSlots}/${maxSlots})</div>
        <div class="slot-indicator">${slotsHtml}</div>
        ${filledSlots > 0 ? `<div class="team-squad-preview" style="margin-top:0.75rem;">${playersHtml}</div>` : '<div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.5rem;">No players yet</div>'}
      </div>
    </div>
  `;
}

// ============================================================
// REGISTRATION
// ============================================================
function setupDragDrop() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  });
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  // Preview
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('previewImg').src = e.target.result;
    document.getElementById('uploadPreview').classList.add('visible');
  };
  reader.readAsDataURL(file);

  // Store file for upload
  APP.pendingUploadFile = file;
}

async function uploadImageToStorage(file) {
  const progressBar = document.getElementById('uploadProgressBar');
  const progressWrap = document.getElementById('uploadProgress');
  progressWrap.classList.add('visible');

  if (DEMO_MODE) {
    // In demo mode: convert actual file to base64 data URL so it
    // persists in APP.players and shows in the approval panel
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      // Animate progress bar while reading
      let prog = 0;
      const ticker = setInterval(() => {
        prog = Math.min(prog + 15, 90);
        progressBar.style.width = `${prog}%`;
      }, 80);

      reader.onload = (e) => {
        clearInterval(ticker);
        progressBar.style.width = '100%';
        resolve(e.target.result); // real base64 data URL
      };
      reader.onerror = () => {
        clearInterval(ticker);
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  // Live Firebase Storage upload
  const storageRef = storage.ref(`stats/${Date.now()}_${file.name}`);
  const uploadTask = storageRef.put(file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        progressBar.style.width = `${progress}%`;
      },
      (error) => reject(error),
      async () => {
        const url = await uploadTask.snapshot.ref.getDownloadURL();
        resolve(url);
      }
    );
  });
}

async function submitRegistration() {
  const name = document.getElementById('regName').value.trim();
  const role = document.getElementById('regRole').value;
  const roblox = document.getElementById('regRoblox').value.trim();
  const discord = document.getElementById('regDiscord').value.trim();
  const country = document.getElementById('regCountry').value;
  const experience = document.getElementById('regExperience').value;
  const availability = document.getElementById('regAvailability').value;
  const notes = document.getElementById('regNotes').value.trim();

  const errEl = document.getElementById('regError');
  const successEl = document.getElementById('regSuccess');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  // Validation
  if (!name || !role || !roblox || !discord || !country || !experience || !availability) {
    errEl.textContent = '❌ Please fill in all required fields.';
    errEl.style.display = 'block';
    return;
  }

  if (!APP.pendingUploadFile) {
    errEl.textContent = '❌ Please upload your stats screenshot.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('regSubmitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Uploading...';

  try {
    // Upload image
    const imageUrl = await uploadImageToStorage(APP.pendingUploadFile);

    const playerData = {
      name, role, robloxUsername: roblox, discordUsername: discord,
      country, experience, availability, notes, imageUrl,
      basePrice: 100, status: 'available', approved: false,
      createdAt: DEMO_MODE ? new Date() : firebase.firestore.FieldValue.serverTimestamp()
    };

    if (DEMO_MODE) {
      // Add to local demo data
      const newPlayer = { ...playerData, id: `demo_${Date.now()}` };
      APP.players.push(newPlayer);
      renderAll();
    } else {
      await playersRef.add(playerData);
    }

    btn.textContent = '✅ Submitted!';
    successEl.textContent = '🎉 Registration submitted! Our team will review and approve your profile within 24 hours.';
    successEl.style.display = 'block';

    // Reset form
    setTimeout(() => {
      document.getElementById('regName').value = '';
      document.getElementById('regRoblox').value = '';
      document.getElementById('regDiscord').value = '';
      document.getElementById('regNotes').value = '';
      document.getElementById('regRole').value = '';
      document.getElementById('regCountry').value = '';
      document.getElementById('regExperience').value = '';
      document.getElementById('regAvailability').value = '';
      document.getElementById('uploadPreview').classList.remove('visible');
      document.getElementById('uploadProgress').classList.remove('visible');
      document.getElementById('uploadProgressBar').style.width = '0';
      APP.pendingUploadFile = null;
      btn.textContent = '🚀 Submit Registration';
      btn.disabled = false;
    }, 3000);

    notify('success', 'Registration Submitted!', 'Your profile will be reviewed shortly.');
  } catch (err) {
    console.error(err);
    errEl.textContent = '❌ Failed to submit. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '🚀 Submit Registration';
  }
}

// ============================================================
// AUCTION SYSTEM
// ============================================================
function renderAuctionPage() {
  renderPursePanel();

  if (APP.auction.active && APP.auction.currentPlayer) {
    showAuctionActive();
    updateAuctionDisplay();
  } else {
    showAuctionIdle();
  }

  // Show admin controls if admin
  if (APP.isAdmin || DEMO_MODE) {
    document.getElementById('adminBidControls').style.display = 'flex';
    document.getElementById('adminStartBtn').style.display = 'block';
    document.getElementById('nextPlayerPanel').style.display = 'block';
    renderPlayerQueue();
    populateBidTeamSelect();
  }

  // Show team-owner bid button if logged in as a team owner (and not admin)
  const ownerBidBtn = document.getElementById('ownerBidBtn');
  if (ownerBidBtn) {
    if (APP.myTeam && !APP.isAdmin && !DEMO_MODE) {
      ownerBidBtn.style.display = 'block';
      ownerBidBtn.textContent = `📣 Bid for ${APP.myTeam.shortName} (+25L)`;
    } else {
      ownerBidBtn.style.display = 'none';
    }
  }
}

function showAuctionActive() {
  document.getElementById('noAuctionState').style.display = 'none';
  document.getElementById('auctionMain').style.display = 'grid';
  document.getElementById('liveBadge').style.display = 'flex';
}

function showAuctionIdle() {
  document.getElementById('noAuctionState').style.display = 'block';
  document.getElementById('auctionMain').style.display = 'none';
  document.getElementById('liveBadge').style.display = 'none';
}

function updateAuctionDisplay() {
  const p = APP.auction.currentPlayer;
  if (!p) return;

  document.getElementById('auctionPlayerName').textContent = p.name || 'Unknown';
  document.getElementById('auctionPlayerRole').textContent = p.role || '';
  document.getElementById('apCountry2').textContent = p.country || '—';
  document.getElementById('apExperience').textContent = p.experience || '—';
  document.getElementById('apAvail2').textContent = p.availability || '—';
  document.getElementById('apBasePrice').textContent = formatINR(p.basePrice);
  document.getElementById('apRoblox2').textContent = p.robloxUsername || '—';
  document.getElementById('apDiscord2').textContent = p.discordUsername || '—';

  if (p.imageUrl) {
    document.getElementById('auctionPlayerImg').src = p.imageUrl;
  }

  // Current bid
  const bid = APP.auction.currentBid;
  document.getElementById('currentBidAmount').textContent = formatINR(bid);
  document.getElementById('currentBidTeam').textContent = APP.auction.currentBidTeam || 'No bids yet';

  // RTM
  const rtm = APP.teams.find(t => t.retained && t.retained.includes(p.name));
  if (rtm) {
    document.getElementById('rtmBadge').style.display = 'inline-flex';
    document.getElementById('rtmBadge').textContent = `RTM: ${rtm.name}`;
  } else {
    document.getElementById('rtmBadge').style.display = 'none';
  }

  // Animate bid
  document.getElementById('currentBidAmount').style.animation = 'none';
  requestAnimationFrame(() => {
    document.getElementById('currentBidAmount').style.animation = 'bid-pulse 0.3s ease';
  });
}

function startAuction() {
  const availablePlayers = APP.players.filter(p => p.approved && p.status === 'available');

  if (availablePlayers.length === 0) {
    notify('warning', 'No Players', 'No approved available players to auction.');
    return;
  }

  // Sort queue based on settings
  const order = document.getElementById('auctionOrder')?.value || 'random';
  let queue = [...availablePlayers];

  if (order === 'random') {
    queue = queue.sort(() => Math.random() - 0.5);
  } else if (order === 'base-high') {
    queue = queue.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
  } else if (order === 'base-low') {
    queue = queue.sort((a, b) => (a.basePrice || 0) - (b.basePrice || 0));
  }

  APP.auction.playerQueue = queue;
  APP.auction.currentPlayerIndex = 0;
  APP.auction.active = true;
  APP.auction.bidLog = [];

  if (DEMO_MODE) {
    loadNextPlayer();
    showAuctionActive();
    showPage('auction');
    notify('success', 'Auction Started!', `${queue.length} players in queue`);
    return;
  }

  // Firebase: Update auction state
  const timerDuration = parseInt(document.getElementById('auctionTimer')?.value || 30);
  auctionRef.doc('state').set({
    active: true,
    currentPlayerIndex: 0,
    currentPlayerId: queue[0].id,
    currentBid: queue[0].basePrice || 100,
    currentBidTeam: null,
    timer: timerDuration,
    round: 1,
    playerQueue: queue.map(p => p.id)
  });

  notify('success', 'Auction Started!', `${queue.length} players in queue`);
}

function loadNextPlayer() {
  clearInterval(APP.auction.timerInterval);
  document.getElementById('soldOverlay').classList.remove('visible');

  const queue = APP.auction.playerQueue;
  if (APP.auction.currentPlayerIndex >= queue.length) {
    endAuction();
    return;
  }

  const player = queue[APP.auction.currentPlayerIndex];
  APP.auction.currentPlayer = player;
  APP.auction.currentBid = player.basePrice || 100;
  APP.auction.currentBidTeam = null;

  updateAuctionDisplay();
  updateBidLog();

  const timerDuration = parseInt(document.getElementById('auctionTimer')?.value || 30);
  startTimer(timerDuration);

  document.getElementById('auctionRoundLabel').textContent =
    `Player ${APP.auction.currentPlayerIndex + 1} of ${queue.length}`;
}

function nextPlayer() {
  APP.auction.currentPlayerIndex++;
  loadNextPlayer();
}

function startTimer(seconds) {
  APP.auction.timer = seconds;
  clearInterval(APP.auction.timerInterval);

  const timerCount = document.getElementById('timerCount');
  const timerBar = document.getElementById('timerBar');
  const maxTime = seconds;

  APP.auction.timerInterval = setInterval(() => {
    if (APP.auction.paused) return;

    APP.auction.timer--;

    if (timerCount) timerCount.textContent = APP.auction.timer;
    if (timerBar) {
      const pct = (APP.auction.timer / maxTime) * 100;
      timerBar.style.width = `${pct}%`;

      timerBar.className = 'timer-bar';
      if (APP.auction.timer <= 5) timerBar.classList.add('danger');
      else if (APP.auction.timer <= 10) timerBar.classList.add('warning');
      else timerBar.classList.add('safe');
    }

    if (APP.auction.timer <= 0) {
      clearInterval(APP.auction.timerInterval);
      handleTimerEnd();
    }
  }, 1000);
}

function handleTimerEnd() {
  if (APP.auction.currentBidTeam && APP.auction.currentBid > 0) {
    // Auto-sell if admin mode
    if (APP.isAdmin || DEMO_MODE) {
      showSoldAnimation();
    }
  } else {
    if (APP.isAdmin || DEMO_MODE) {
      notify('info', 'No Bids', `${APP.auction.currentPlayer?.name} went unsold.`);
      markUnsold();
    }
  }
}

function showSoldAnimation() {
  const team = APP.auction.currentBidTeam;
  const price = APP.auction.currentBid;
  const player = APP.auction.currentPlayer;

  document.getElementById('soldOverlay').classList.add('visible');
  document.getElementById('soldTeamName').textContent = team || 'Unknown Team';
  document.getElementById('soldPriceDisplay').textContent = `⚡ ${formatINR(price)}`;

  triggerConfetti();

  // Update player in local state
  if (player) {
    const idx = APP.players.findIndex(p => p.id === player.id);
    if (idx !== -1) {
      APP.players[idx].status = 'sold';
      APP.players[idx].soldTo = team;
      APP.players[idx].soldPrice = price;
    }

    // Update team
    const teamIdx = APP.teams.findIndex(t => t.name === team);
    if (teamIdx !== -1) {
      if (!APP.teams[teamIdx].players) APP.teams[teamIdx].players = [];
      APP.teams[teamIdx].players.push(player.name);
      APP.teams[teamIdx].spent = (APP.teams[teamIdx].spent || 0) + price;
    }

    if (!DEMO_MODE) {
      // Firebase update
      playersRef.doc(player.id).update({
        status: 'sold', soldTo: team, soldPrice: price
      });
      const teamDoc = APP.teams[APP.teams.findIndex(t => t.name === team)];
      if (teamDoc) {
        teamsRef.doc(teamDoc.id).update({
          players: firebase.firestore.FieldValue.arrayUnion(player.name),
          spent: firebase.firestore.FieldValue.increment(price)
        });
      }
    }
  }

  renderPursePanel();
  notify('success', '🔨 SOLD!', `${player?.name} sold to ${team} for ${formatINR(price)}`);

  // Move to next after 3 seconds
  setTimeout(() => {
    document.getElementById('soldOverlay').classList.remove('visible');
    nextPlayer();
  }, 3000);
}

function adminBid(increment) {
  const teamSelect = document.getElementById('bidTeamSelect');
  const team = teamSelect?.value;
  if (!team) { notify('warning', 'Select Team', 'Please select a team to bid for.'); return; }

  APP.auction.currentBid = (APP.auction.currentBid || 0) + increment;
  APP.auction.currentBidTeam = team;

  // Reset timer
  const timerDuration = parseInt(document.getElementById('auctionTimer')?.value || 30);
  startTimer(timerDuration);

  updateAuctionDisplay();
  addBidLog(team, APP.auction.currentBid);
  updateBidLog();

  notify('info', 'Bid Placed', `${team} → ${formatINR(APP.auction.currentBid)}`);
}

function placeBidForTeam() {
  adminBid(25); // Default increment
}

// Called when a team owner clicks their personal bid button
function ownerPlaceBid() {
  if (!APP.myTeam) { notify('warning', 'Not Authorized', 'You are not a registered team owner.'); return; }
  if (!APP.auction.active || !APP.auction.currentPlayer) { notify('warning', 'No Auction', 'No auction is currently active.'); return; }

  const team = APP.myTeam.name;
  const increment = 25;
  APP.auction.currentBid = (APP.auction.currentBid || 0) + increment;
  APP.auction.currentBidTeam = team;

  // Reset timer
  const timerDuration = parseInt(document.getElementById('auctionTimer')?.value || 30);
  startTimer(timerDuration);

  updateAuctionDisplay();
  addBidLog(team, APP.auction.currentBid);
  updateBidLog();

  notify('info', '📣 Bid Placed!', `${team} → ${formatINR(APP.auction.currentBid)}`);
}

function openSellModal() {
  const player = APP.auction.currentPlayer;
  if (!player) return;

  APP.currentSellPlayerId = player.id;
  document.getElementById('sellModalPlayerName').textContent = player.name;
  document.getElementById('sellPrice').value = APP.auction.currentBid;

  // Populate team select
  const teamSel = document.getElementById('sellTeamSelect');
  teamSel.innerHTML = APP.teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
  if (APP.auction.currentBidTeam) teamSel.value = APP.auction.currentBidTeam;

  openModal('sellModal');
}

function confirmSellPlayer() {
  const team = document.getElementById('sellTeamSelect').value;
  const price = parseInt(document.getElementById('sellPrice').value);

  if (!team || isNaN(price) || price < 0) {
    notify('error', 'Invalid Data', 'Please select a team and enter a valid price.');
    return;
  }

  APP.auction.currentBidTeam = team;
  APP.auction.currentBid = price;

  closeModal('sellModal');
  clearInterval(APP.auction.timerInterval);
  showSoldAnimation();
}

function markUnsold() {
  const player = APP.auction.currentPlayer;
  if (!player) return;

  const idx = APP.players.findIndex(p => p.id === player.id);
  if (idx !== -1) APP.players[idx].status = 'unsold';

  if (!DEMO_MODE) {
    playersRef.doc(player.id).update({ status: 'unsold' });
  }

  closeModal('sellModal');
  clearInterval(APP.auction.timerInterval);
  notify('info', 'Player Unsold', `${player.name} marked as unsold.`);
  nextPlayer();
}

function pauseAuction() {
  APP.auction.paused = !APP.auction.paused;
  const btn = document.getElementById('pauseAuctionBtn');
  if (btn) btn.textContent = APP.auction.paused ? '▶️ Resume Auction' : '⏸ Pause Auction';
  notify('info', APP.auction.paused ? 'Paused' : 'Resumed', 'Auction ' + (APP.auction.paused ? 'paused' : 'resumed'));
}

function resetAuction() {
  if (!confirm('⚠️ Reset all auction data? This will mark all players as available again. This cannot be undone.')) return;

  clearInterval(APP.auction.timerInterval);
  APP.auction = {
    active: false, currentPlayerIndex: 0, currentPlayer: null,
    currentBid: 0, currentBidTeam: null, timer: 30,
    timerInterval: null, bidLog: [], playerQueue: [], paused: false
  };

  // Reset player statuses
  APP.players = APP.players.map(p => ({ ...p, status: 'available', soldTo: null, soldPrice: null }));

  if (!DEMO_MODE) {
    // Reset in Firebase
    auctionRef.doc('state').set({ active: false });
    APP.players.forEach(p => playersRef.doc(p.id).update({ status: 'available', soldTo: null, soldPrice: null }));
  }

  showAuctionIdle();
  renderAll();
  notify('success', 'Reset Complete', 'Auction data has been reset.');
}

function endAuction() {
  clearInterval(APP.auction.timerInterval);
  APP.auction.active = false;
  showAuctionIdle();
  notify('success', '🏆 Auction Complete!', 'All players have been auctioned.');

  if (!DEMO_MODE) {
    auctionRef.doc('state').update({ active: false });
  }
}

function addBidLog(team, amount) {
  APP.auction.bidLog.unshift({
    team, amount, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  if (APP.auction.bidLog.length > 20) APP.auction.bidLog.pop();
}

function updateBidLog() {
  const logList = document.getElementById('bidLogList');
  if (!logList) return;

  if (APP.auction.bidLog.length === 0) {
    logList.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.82rem;">No bids yet</div>`;
    return;
  }

  logList.innerHTML = APP.auction.bidLog.map((b, i) => `
    <div class="bid-log-item">
      <div class="log-team">${i === 0 ? '👑 ' : ''}${b.team}</div>
      <div class="log-price">${formatINR(b.amount)}</div>
      <div class="log-time">${b.time}</div>
    </div>
  `).join('');
}

function renderPursePanel() {
  const list = document.getElementById('pursePanelList');
  if (!list) return;

  if (APP.teams.length === 0) {
    list.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.82rem;text-align:center;">No teams</div>`;
    return;
  }

  list.innerHTML = APP.teams.map(t => {
    const remaining = (t.purse || 0) - (t.spent || 0);
    const logoHtml = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name}" />`
      : `<div class="logo-placeholder">${t.shortName || '??'}</div>`;

    return `
      <div class="purse-item">
        <div class="purse-team-logo">${logoHtml}</div>
        <div class="purse-team-info">
          <div class="purse-team-name">${t.name}</div>
          <div class="purse-team-players">${(t.players || []).length} players</div>
        </div>
        <div class="purse-amount" style="color:${remaining < 500000 ? 'var(--red)' : 'var(--gold)'};">${formatINR(remaining)}</div>
      </div>
    `;
  }).join('');
}

function populateBidTeamSelect() {
  const sel = document.getElementById('bidTeamSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Team --</option>` + APP.teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
}

function renderPlayerQueue() {
  const list = document.getElementById('playerQueueList');
  if (!list) return;

  const queue = APP.auction.playerQueue;
  if (queue.length === 0) {
    list.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.82rem;text-align:center;">Queue empty</div>`;
    return;
  }

  list.innerHTML = queue.slice(APP.auction.currentPlayerIndex, APP.auction.currentPlayerIndex + 5).map((p, i) => `
    <div class="purse-item ${i === 0 ? '' : ''}" style="${i === 0 ? 'background:rgba(212,175,55,0.06);border:1px solid var(--border-gold);border-radius:8px;' : ''}">
      <div style="width:30px;height:30px;border-radius:6px;background:rgba(212,175,55,0.1);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-family:'Cinzel',serif;color:var(--gold);">${APP.auction.currentPlayerIndex + i + 1}</div>
      <div class="purse-team-info">
        <div class="purse-team-name" style="font-size:0.82rem;">${p.name}</div>
        <div class="purse-team-players">${p.role} · ${formatINR(p.basePrice)}</div>
      </div>
    </div>
  `).join('');
}

function syncAuctionState(state) {
  // Called when Firestore auction state changes
  if (state.active && !APP.auction.active) {
    APP.auction.active = true;
    const player = APP.players.find(p => p.id === state.currentPlayerId);
    APP.auction.currentPlayer = player || null;
    APP.auction.currentBid = state.currentBid || 0;
    APP.auction.currentBidTeam = state.currentBidTeam || null;
    showAuctionActive();
    updateAuctionDisplay();
  } else if (!state.active) {
    APP.auction.active = false;
    showAuctionIdle();
  }
}

// ============================================================
// ADMIN PANEL
// ============================================================
function showAdminSection(section, el) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`admin-${section}`);
  if (target) target.classList.add('active');
  if (el) el.classList.add('active');

  // Trigger renders
  if (section === 'dashboard') renderAdminDashboard();
  if (section === 'auctionControl') renderQueueTable();
  if (section === 'playerApprovals') renderApprovalsPanel();
  if (section === 'manageTeams') renderTeamsAdminTable();
  if (section === 'allPlayers') renderAllPlayersTable();
}

function renderAdminDashboard() {
  const total = APP.players.length;
  const approved = APP.players.filter(p => p.approved).length;
  const sold = APP.players.filter(p => p.status === 'sold').length;
  const unsold = APP.players.filter(p => p.status === 'unsold').length;
  const pending = APP.players.filter(p => !p.approved).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dTotal', total);
  set('dApproved', approved);
  set('dSold', sold);
  set('dUnsold', unsold);
  set('dPending', pending);
  set('dTeams', APP.teams.length);

  // Pending badge
  const badge = document.getElementById('pendingBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'inline-block' : 'none';
  }

  // Recent registrations
  const tbody = document.getElementById('recentRegBody');
  if (!tbody) return;

  const recent = [...APP.players].sort((a, b) => {
    const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt instanceof Date ? a.createdAt : new Date(0));
    const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt instanceof Date ? b.createdAt : new Date(0));
    return bTime - aTime;
  }).slice(0, 10);

  tbody.innerHTML = recent.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.role || '—'}</td>
      <td>${p.country || '—'}</td>
      <td>${p.experience || '—'}</td>
      <td><span class="player-status-badge ${p.approved ? 'status-available' : 'status-pending'}">${p.approved ? 'Approved' : 'Pending'}</span></td>
      <td>${formatDate(p.createdAt)}</td>
    </tr>
  `).join('');
}

function renderQueueTable() {
  const tbody = document.getElementById('queueTableBody');
  if (!tbody) return;

  const players = APP.players.filter(p => p.approved);

  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">No approved players</td></tr>`;
    return;
  }

  tbody.innerHTML = players.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.role || '—'}</td>
      <td class="text-gold">${p.basePrice || 0} APL</td>
      <td><span class="player-status-badge ${getStatusClass(p.status)}">${p.status || 'available'}</span></td>
      <td>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-outline btn-sm" onclick="setPlayerForAuction('${p.id}')">🔨 Auction</button>
          <button class="btn btn-danger btn-sm" onclick="adminDeletePlayer('${p.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function setPlayerForAuction(playerId) {
  const player = APP.players.find(p => p.id === playerId);
  if (!player) return;

  APP.auction.currentPlayer = player;
  APP.auction.currentBid = player.basePrice || 100;
  APP.auction.currentBidTeam = null;
  APP.auction.active = true;
  APP.auction.bidLog = [];
  APP.auction.playerQueue = [player];
  APP.auction.currentPlayerIndex = 0;

  showPage('auction');
  showAuctionActive();
  updateAuctionDisplay();
  const timerDuration = parseInt(document.getElementById('auctionTimer')?.value || 30);
  startTimer(timerDuration);
  renderPursePanel();
  populateBidTeamSelect();

  notify('info', 'Auction Started', `Now auctioning: ${player.name}`);
}

function renderApprovalsPanel() {
  const container = document.getElementById('approvalsContainer');
  if (!container) return;

  const pending = APP.players.filter(p => !p.approved);

  if (pending.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><h3>All caught up!</h3><p>No pending submissions</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="player-grid">
      ${pending.map(p => `
        <div class="card" style="overflow:hidden;">
          ${p.imageUrl
            ? `<div style="position:relative;background:#0d0d1a;border-bottom:1px solid var(--border-gold);">
                <img
                  src="${p.imageUrl}"
                  alt="Stats screenshot for ${p.name}"
                  style="width:100%;height:200px;object-fit:contain;display:block;background:#0d0d1a;"
                  onerror="this.parentElement.innerHTML='<div style=\'height:200px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);font-size:0.8rem;\'><span style=\'font-size:2rem;\'>🖼️</span>Screenshot not available</div>'"
                />
                <a href="${p.imageUrl}" target="_blank"
                   style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:var(--gold);font-size:0.72rem;padding:4px 10px;border-radius:4px;text-decoration:none;border:1px solid var(--border-gold);">
                  🔍 View Full
                </a>
              </div>`
            : `<div style="height:120px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--text-muted);font-size:0.8rem;background:#0d0d1a;border-bottom:1px solid var(--border-gold);">
                <span style="font-size:2rem;">📷</span>No screenshot uploaded
              </div>`
          }
          <div class="card-body">
            <div style="font-family:'Cinzel',serif;font-size:1.1rem;font-weight:700;margin-bottom:4px;">${p.name}</div>
            <div style="font-size:0.75rem;color:var(--gold);letter-spacing:1px;margin-bottom:0.75rem;">${p.role || '—'}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:1rem;font-size:0.8rem;">
              <div style="color:var(--text-muted);">Country: <span style="color:var(--text-primary);">${p.country || '—'}</span></div>
              <div style="color:var(--text-muted);">Exp: <span style="color:var(--text-primary);">${p.experience || '—'}</span></div>
              <div style="color:var(--text-muted);">Roblox: <span style="color:var(--text-primary);">${p.robloxUsername || '—'}</span></div>
              <div style="color:var(--text-muted);">Discord: <span style="color:var(--text-primary);">${p.discordUsername || '—'}</span></div>
            </div>
            ${p.notes ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:1rem;padding:8px;background:var(--bg-glass);border-radius:6px;">"${p.notes}"</div>` : ''}
            <div class="form-group">
              <label class="form-label" style="font-size:0.72rem;">Set Base Price (₹ INR)</label>
              <input type="number" class="form-control" id="basePrice_${p.id}" value="${p.basePrice || 100}" min="0" style="padding:8px 12px;" />
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn btn-success" style="flex:1;padding:8px;" onclick="approvePlayer('${p.id}')">✅ Approve</button>
              <button class="btn btn-danger" style="flex:1;padding:8px;" onclick="rejectPlayer('${p.id}')">❌ Reject</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function approvePlayer(playerId) {
  const priceEl = document.getElementById(`basePrice_${playerId}`);
  const basePrice = parseInt(priceEl?.value || 100);

  if (DEMO_MODE) {
    const idx = APP.players.findIndex(p => p.id === playerId);
    if (idx !== -1) { APP.players[idx].approved = true; APP.players[idx].basePrice = basePrice; }
    renderAll();
    notify('success', 'Player Approved', 'Player has been approved!');
    return;
  }

  try {
    await playersRef.doc(playerId).update({ approved: true, basePrice });
    notify('success', 'Player Approved', 'Player has been approved and added to the pool!');
  } catch (err) {
    notify('error', 'Error', 'Failed to approve player.');
  }
}

async function rejectPlayer(playerId) {
  if (!confirm('Remove this player submission?')) return;

  if (DEMO_MODE) {
    APP.players = APP.players.filter(p => p.id !== playerId);
    renderAll();
    notify('info', 'Player Removed', 'Submission has been removed.');
    return;
  }

  try {
    await playersRef.doc(playerId).delete();
    notify('info', 'Player Removed', 'Submission has been removed.');
  } catch (err) {
    notify('error', 'Error', 'Failed to remove player.');
  }
}

function renderAllPlayersTable() {
  const tbody = document.getElementById('allPlayersBody');
  if (!tbody) return;

  if (APP.players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem;">No players</td></tr>`;
    return;
  }

  tbody.innerHTML = APP.players.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.role || '—'}</td>
      <td>${p.country || '—'}</td>
      <td>${p.experience || '—'}</td>
      <td class="text-gold">${formatINR(p.basePrice)}</td>
      <td><span class="player-status-badge ${getStatusClass(p.status)}">${p.status || 'available'}</span></td>
      <td>${p.soldTo || '—'}</td>
      <td>
        <div style="display:flex;gap:0.4rem;">
          <button class="btn btn-ghost btn-sm" onclick="openPlayerModal('${p.id}')">👁</button>
          <button class="btn btn-danger btn-sm" onclick="adminDeletePlayer('${p.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderTeamsAdminTable() {
  const tbody = document.getElementById('teamsAdminBody');
  if (!tbody) return;

  if (APP.teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No teams added</td></tr>`;
    return;
  }

  tbody.innerHTML = APP.teams.map(t => `
    <tr>
      <td><strong>${t.name}</strong> <span style="color:var(--text-muted);font-size:0.78rem;">[${t.shortName}]</span></td>
      <td>${t.owner || '—'}</td>
      <td class="text-gold">${formatINR(t.purse)}</td>
      <td>${formatINR(t.spent)}</td>
      <td>${(t.players || []).length}</td>
      <td>
        <div style="display:flex;gap:0.4rem;">
          <button class="btn btn-outline btn-sm" onclick="editTeamPurse('${t.id}')">✏️ Purse</button>
          <button class="btn btn-danger btn-sm" onclick="adminDeleteTeam('${t.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function editTeamPurse(teamId) {
  const team = APP.teams.find(t => t.id === teamId);
  if (!team) return;

  const newPurse = prompt(`Edit purse for ${team.name} (in ₹):`, team.purse || 150000000);
  if (newPurse === null) return;

  const purse = parseInt(newPurse);
  if (isNaN(purse)) { notify('error', 'Invalid', 'Please enter a valid number.'); return; }

  if (DEMO_MODE) {
    const idx = APP.teams.findIndex(t => t.id === teamId);
    if (idx !== -1) APP.teams[idx].purse = purse;
    renderAll();
    notify('success', 'Purse Updated', `${team.name} purse set to ${formatINR(purse)}`);
    return;
  }

  teamsRef.doc(teamId).update({ purse });
  notify('success', 'Purse Updated', `${team.name} purse set to ${formatINR(purse)}`);
}

async function adminDeletePlayer(playerId) {
  if (!confirm('Delete this player permanently?')) return;

  if (DEMO_MODE) {
    APP.players = APP.players.filter(p => p.id !== playerId);
    renderAll();
    notify('success', 'Deleted', 'Player removed.');
    return;
  }

  try {
    await playersRef.doc(playerId).delete();
    notify('success', 'Deleted', 'Player removed.');
  } catch (err) {
    notify('error', 'Error', 'Failed to delete player.');
  }
}

async function adminDeleteTeam(teamId) {
  if (!confirm('Delete this team?')) return;

  if (DEMO_MODE) {
    APP.teams = APP.teams.filter(t => t.id !== teamId);
    renderAll();
    notify('success', 'Deleted', 'Team removed.');
    return;
  }

  await teamsRef.doc(teamId).delete();
  notify('success', 'Deleted', 'Team removed.');
}

function showAddTeamForm() {
  const form = document.getElementById('addTeamForm');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function adminAddTeam() {
  const name = document.getElementById('newTeamName').value.trim();
  const shortName = document.getElementById('newTeamShort').value.trim().toUpperCase();
  const owner = document.getElementById('newTeamOwner').value.trim();
  const purse = parseInt(document.getElementById('newTeamPurse').value || 1000);

  if (!name || !shortName) { notify('error', 'Missing Fields', 'Team name and short name required.'); return; }

  const teamData = {
    name, shortName, owner, purse, spent: 0,
    players: [], retained: [], maxSlots: 7, logoUrl: null
  };

  if (DEMO_MODE) {
    APP.teams.push({ ...teamData, id: `team_${Date.now()}` });
    renderAll();
    document.getElementById('addTeamForm').style.display = 'none';
    notify('success', 'Team Added', `${name} has been added!`);
    return;
  }

  try {
    await teamsRef.add(teamData);
    document.getElementById('addTeamForm').style.display = 'none';
    notify('success', 'Team Added', `${name} has been added!`);
  } catch (err) {
    notify('error', 'Error', 'Failed to add team.');
  }
}

async function adminAddPlayer() {
  const name = document.getElementById('apName').value.trim();
  const role = document.getElementById('apRole').value;
  const roblox = document.getElementById('apRoblox').value.trim();
  const discord = document.getElementById('apDiscord').value.trim();
  const country = document.getElementById('apCountry').value.trim();
  const experience = document.getElementById('apExp').value;
  const availability = document.getElementById('apAvail').value;
  const basePrice = parseInt(document.getElementById('apPrice').value || 100);

  if (!name) { notify('error', 'Missing Name', 'Player name is required.'); return; }

  const playerData = {
    name, role, robloxUsername: roblox, discordUsername: discord,
    country, experience, availability, basePrice,
    status: 'available', approved: true, notes: '',
    imageUrl: null,
    createdAt: DEMO_MODE ? new Date() : firebase.firestore.FieldValue.serverTimestamp()
  };

  if (DEMO_MODE) {
    APP.players.push({ ...playerData, id: `p_${Date.now()}` });
    renderAll();
    closeModal('addPlayerModal');
    notify('success', 'Player Added', `${name} added to pool!`);
    return;
  }

  try {
    await playersRef.add(playerData);
    closeModal('addPlayerModal');
    notify('success', 'Player Added', `${name} added to pool!`);
  } catch (err) {
    notify('error', 'Error', 'Failed to add player.');
  }
}

// ============================================================
// CONFETTI
// ============================================================
function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#D4AF37', '#F5D76E', '#A0892A', '#FFD700', '#FFFFFF'];
  const pieces = [];

  for (let i = 0; i < 120; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: Math.random() * 4 + 2,
      vx: Math.random() * 4 - 2,
      rot: Math.random() * 360,
      vr: Math.random() * 5 - 2.5,
      opacity: 1
    });
  }

  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    pieces.forEach(p => {
      p.y += p.vy;
      p.x += p.vx;
      p.rot += p.vr;
      p.opacity -= 0.008;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (frame < 200) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  requestAnimationFrame(animate);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function formatINR(amount) {
  if (amount === undefined || amount === null) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function getStatusClass(status) {
  const map = { available: 'status-available', sold: 'status-sold', unsold: 'status-unsold' };
  return map[status] || 'status-available';
}

function formatDate(date) {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '1') showPage('home');
  if (e.key === '2') showPage('players');
  if (e.key === '3') showPage('auction');
  if (e.key === '4') showPage('teams');
});

// Responsive: close mobile nav on resize
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    document.getElementById('navLinks').classList.remove('open');
  }
});

console.log('🏏 APL — Asian Premier League | Auction Portal Loaded');
console.log('📋 DEMO_MODE:', (typeof DEMO_MODE !== "undefined" && DEMO_MODE)
  ? 'ON (Configure firebase.js to go live)'
  : 'OFF (Live Firebase)'
);