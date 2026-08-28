/* ===================== STORAGE HELPERS ===================== */
async function sGet(key, shared){ try{ const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; }catch(e){ return null; } }
async function sSet(key, value, shared){ try{ return await window.storage.set(key, JSON.stringify(value), shared); }catch(e){ console.error(e); return null; } }
async function sList(prefix, shared){ try{ const r = await window.storage.list(prefix, shared); return r && r.keys ? r.keys.map(k=> typeof k==='string' ? k : k.key) : []; }catch(e){ return []; } }

let state = { products: [], session: null, account: null, masters: [], bookings: [], contentState: {} };

function escapeHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function collectContentDefaults(){
  const map = {};
  document.querySelectorAll('[data-cid]').forEach(el=>{ map[el.getAttribute('data-cid')] = el.textContent; });
  return map;
}
function applyContent(){
  document.querySelectorAll('[data-cid]').forEach(el=>{
    const cid = el.getAttribute('data-cid');
    if(state.contentState[cid] !== undefined) el.textContent = state.contentState[cid];
  });
}
function formatDate(d){
  if(!d) return '';
  const dt = new Date(d+'T00:00:00');
  return dt.toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
}
function statusColor(s){
  return s==='Подтверждено' ? '#3d7a4f' : s==='Отменено' ? '#8a3b2c' : s==='Выполнено' ? '#6b6357' : '#a6875f';
}
/* ----- unique loyalty card numbers ----- */
async function nextCardNumber(){
  let counter = await sGet('cardCounter', true);
  if(typeof counter !== 'number' || isNaN(counter)) counter = 1000;
  counter += 1;
  await sSet('cardCounter', counter, true);
  return '7724' + String(counter).padStart(8,'0'); // 12-digit unique card number
}
function formatCardNumber(num){
  const clean = String(num||'').replace(/\D/g,'');
  if(!clean) return '•••• •••• •••';
  return clean.match(/.{1,4}/g).join(' ');
}
async function ensureAccountDefaults(acc){
  let changed = false;
  if(!acc.cardNumber){ acc.cardNumber = await nextCardNumber(); changed = true; }
  if(!acc.role){ acc.role = acc.isAdmin ? 'admin' : 'user'; changed = true; }
  acc.isAdmin = acc.role === 'admin';
  if(changed) await sSet('account:'+acc.username, acc, true);
  return acc;
}

/* ----- roles & access levels -----
   user    — обычный клиент: только личный кабинет и запись на услуги
   manager — доступ к каталогу, мастерам и модерации записей
   admin   — полный доступ, включая базу клиентов и настройку прав доступа */
const ROLE_PERMS = {
  user:    [],
  manager: ['catalog','masters','bookings'],
  admin:   ['catalog','masters','bookings','customers','content']
};
function hasPerm(perm){
  if(!state.account) return false;
  const role = state.account.role || (state.account.isAdmin ? 'admin' : 'user');
  return (ROLE_PERMS[role] || []).includes(perm);
}
function roleLabel(role){
  return role==='admin' ? 'Администратор' : role==='manager' ? 'Менеджер' : 'Клиент';
}

const DEFAULT_PRODUCTS = [
  {id:'p1', name:'Классический маникюр', price:1500, category:'Маникюр', description:'Обрезной маникюр с укреплением кутикулы и покрытием базой. Long-lasting результат до 2 недель.', image:'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=80'},
  {id:'p2', name:'Маникюр с гель-лаком', price:2200, category:'Маникюр', description:'Аппаратный маникюр + стойкое покрытие гель-лаком в один тон. Держится до 3 недель.', image:'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=800&q=80'},
  {id:'p3', name:'Педикюр классический', price:2500, category:'Педикюр', description:'Аппаратная обработка стоп, удаление огрубевшей кожи, покрытие базой на выбор.', image:'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=800&q=80'},
  {id:'p4', name:'Наращивание гелем', price:3200, category:'Наращивание', description:'Моделирование формы и длины гелем, выравнивание пластины, покрытие цветом.', image:'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?auto=format&fit=crop&w=800&q=80'},
  {id:'p5', name:'Уход SPA для рук', price:1800, category:'Уход', description:'Пилинг, парафинотерапия, массаж рук и увлажняющая маска. Расслабляющий ритуал.', image:'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80'},
  {id:'p6', name:'Дизайн ногтей', price:600, category:'Дизайн', description:'Художественная роспись, втирка, стразы или френч — на выбор, за один ноготь.', image:'https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&w=800&q=80'}
];

/* ===================== INIT ===================== */
async function init(){
  // capture the hardcoded page text as defaults before anything overrides it
  const contentDefaults = collectContentDefaults();

  let products = await sGet('catalog', true);
  if(!products){ products = DEFAULT_PRODUCTS; await sSet('catalog', products, true); }
  state.products = products;

  let admin = await sGet('account:admin', true);
  if(!admin){
    admin = {username:'admin', password:'admin123', fullname:'Администратор', isAdmin:true, role:'admin', balance:0, createdAt:new Date().toISOString()};
    admin.cardNumber = await nextCardNumber();
    await sSet('account:admin', admin, true);
  }

  let masters = await sGet('masters', true);
  if(!masters){ masters = ['Анна','Мария','Екатерина','Ольга']; await sSet('masters', masters, true); }
  state.masters = masters;

  let bookings = await sGet('bookings', true);
  state.bookings = bookings || [];

  const contentOverrides = await sGet('siteContent', true);
  state.contentState = {...contentDefaults, ...(contentOverrides||{})};
  applyContent();

  const session = await sGet('session', false);
  if(session){
    const acc = await sGet('account:'+session, true);
    if(acc){ state.session = session; state.account = await ensureAccountDefaults(acc); }
  }

  renderFilters();
  renderGrid('Все');
  renderAuthArea();
  renderLoyaltyCard();
}

/* ===================== CATALOG RENDER ===================== */
function renderFilters(){
  const cats = ['Все', ...new Set(state.products.map(p=>p.category))];
  document.getElementById('filters').innerHTML = cats.map((c,i)=>
    `<button class="filter-pill ${i===0?'active':''}" onclick="selectFilter(this,'${c}')">${c}</button>`
  ).join('');
}
function selectFilter(btn, cat){
  document.querySelectorAll('.filter-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderGrid(cat);
}
function renderGrid(cat){
  const list = cat==='Все' ? state.products : state.products.filter(p=>p.category===cat);
  const grid = document.getElementById('grid');
  if(!list.length){ grid.innerHTML = `<div class="empty-note" style="grid-column:1/-1;">Пока нет услуг в этой категории.</div>`; return; }
  grid.innerHTML = list.map(p=>`
    <div class="card">
      <div class="img-wrap">
        <span class="cat-badge">${p.category}</span>
        ${p.image ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
        <div class="placeholder" style="${p.image?'':'display:flex;'}">💅</div>
      </div>
      <div class="body">
        <h3>${p.name}</h3>
        <p class="desc">${p.description || ''}</p>
        <div class="price-row">
          <div class="price">${p.price} ₽<span class="sub">+${Math.round(p.price*0.1)} бонусов</span></div>
        </div>
        <div class="actions">
          <button class="btn ghost small" style="flex:1" onclick="openDetail('${p.id}')">Подробнее</button>
          <button class="btn primary small" style="flex:1" onclick="startPurchase('${p.id}')">Записаться</button>
        </div>
      </div>
    </div>
  `).join('');
}

/* ===================== DETAIL MODAL ===================== */
function openDetail(id){
  const p = state.products.find(x=>x.id===id);
  if(!p) return;
  document.getElementById('detailContent').innerHTML = `
    <div class="img-preview" style="aspect-ratio:16/9;">
      ${p.image ? `<img src="${p.image}" onerror="this.parentElement.innerHTML='💅';">` : '💅'}
    </div>
    <p class="eyebrow">${p.category}</p>
    <h3>${p.name}</h3>
    <p style="color:#5b544a;line-height:1.7;font-size:14.5px;">${p.description||''}</p>
    <div class="price-row" style="margin:18px 0;">
      <div class="price">${p.price} ₽<span class="sub">+${Math.round(p.price*0.1)} бонусов на карту</span></div>
    </div>
    <button class="btn primary" style="width:100%;padding:13px;" onclick="closeModal('detailOverlay');startPurchase('${p.id}')">Записаться и оплатить</button>
  `;
  openModal('detailOverlay');
}

/* ===================== AUTH ===================== */
function renderAuthArea(){
  const el = document.getElementById('authArea');
  if(state.account){
    const canPanel = hasPerm('catalog') || hasPerm('masters') || hasPerm('customers') || hasPerm('content');
    const canBookings = hasPerm('bookings');
    el.innerHTML = `
      <div class="user-chip" onclick="openAccount()"><span class="dot"></span>${state.account.fullname||state.account.username}</div>
      ${canPanel ? `<button class="btn small beige" onclick="openAdmin()">Админ-панель</button>`:''}
      ${canBookings ? `<button class="btn small ghost" onclick="openBookingsAdmin()">Записи клиентов</button>`:''}
      <button class="btn ghost small" onclick="logout()"><span class="desktop-only">Выйти</span></button>
    `;
  } else {
    el.innerHTML = `
      <button class="btn ghost small" onclick="openAuth('login')"><span class="desktop-only">Войти</span></button>
      <button class="btn primary small" onclick="openAuth('register')">Регистрация</button>
    `;
  }
}
function openAuth(mode){
  document.getElementById('loginErr').style.display='none';
  document.getElementById('regErr').style.display='none';
  document.getElementById('authLoginForm').style.display = mode==='login' ? 'block':'none';
  document.getElementById('authRegisterForm').style.display = mode==='register' ? 'block':'none';
  openModal('authOverlay');
}
async function doLogin(){
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr');
  if(!u || !p){ err.textContent='Заполните логин и пароль.'; err.style.display='block'; return; }
  let acc = await sGet('account:'+u, true);
  if(!acc || acc.password !== p){ err.textContent='Неверный логин или пароль.'; err.style.display='block'; return; }
  acc = await ensureAccountDefaults(acc);
  state.session = u; state.account = acc;
  await sSet('session', u, false);
  renderAuthArea(); renderLoyaltyCard(); closeModal('authOverlay');
  toast(`С возвращением, ${acc.fullname||acc.username}!`);
}
async function doRegister(){
  const name = document.getElementById('regName').value.trim();
  const u = document.getElementById('regUser').value.trim();
  const p = document.getElementById('regPass').value;
  const err = document.getElementById('regErr');
  if(!name || !u || !p){ err.textContent='Заполните все поля.'; err.style.display='block'; return; }
  if(p.length<4){ err.textContent='Пароль должен быть от 4 символов.'; err.style.display='block'; return; }
  const existing = await sGet('account:'+u, true);
  if(existing){ err.textContent='Такой логин уже занят.'; err.style.display='block'; return; }
  const cardNumber = await nextCardNumber();
  const acc = {username:u, password:p, fullname:name, isAdmin:false, role:'user', balance:0, createdAt:new Date().toISOString(), cardNumber};
  await sSet('account:'+u, acc, true);
  state.session = u; state.account = acc;
  await sSet('session', u, false);
  renderAuthArea(); renderLoyaltyCard(); closeModal('authOverlay');
  toast(`Карта лояльности №${formatCardNumber(cardNumber)} создана! Добро пожаловать 🤍`);
}
async function logout(){
  state.session = null; state.account = null;
  await sSet('session', '', false);
  renderAuthArea(); renderLoyaltyCard();
  toast('Вы вышли из аккаунта.');
}

/* ===================== LOYALTY CARD (hero widget) ===================== */
function renderLoyaltyCard(){
  const nameEl = document.getElementById('lcName');
  const balEl = document.getElementById('lcBalance');
  const numEl = document.getElementById('lcNumber');
  if(state.account){
    nameEl.textContent = state.account.fullname || state.account.username;
    balEl.textContent = state.account.balance;
    numEl.textContent = formatCardNumber(state.account.cardNumber);
  } else {
    nameEl.textContent = 'Гостевая карта';
    balEl.textContent = '0';
    numEl.textContent = '•••• •••• •••• ••••';
  }
}

/* ===================== PURCHASE FLOW (date + time + master) ===================== */
const TIME_SLOTS = ['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

function startPurchase(id){
  const p = state.products.find(x=>x.id===id);
  if(!p) return;
  if(!state.account){ openAuth('register'); toast('Зарегистрируйтесь, чтобы записаться и получать бонусы.'); return; }
  if(!state.masters.length){ toast('Мастера пока не добавлены администратором.'); return; }
  const balance = state.account.balance || 0;
  const maxRedeem = Math.min(balance, Math.round(p.price*0.5));
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('detailContent').innerHTML = `
    <p class="eyebrow">Оформление записи</p>
    <h3>${p.name}</h3>
    <p style="color:#5b544a;font-size:14.5px;">Стоимость услуги: <b>${p.price} ₽</b></p>
    <div class="field-row">
      <div class="field"><label>Дата</label><input type="date" id="bkDate" min="${today}" value="${today}"></div>
      <div class="field"><label>Время</label><select id="bkTime">${TIME_SLOTS.map(t=>`<option>${t}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Мастер</label><select id="bkMaster">${state.masters.map(m=>`<option>${escapeHtml(m)}</option>`).join('')}</select></div>
    ${maxRedeem>0 ? `
      <div class="check-row">
        <input type="checkbox" id="useBonus"> <label for="useBonus">Списать бонусы (доступно до ${maxRedeem} ₽ из ${balance} ₽ на карте)</label>
      </div>
    `: `<p class="hint">На карте пока недостаточно бонусов для списания.</p>`}
    <div id="payBreakdown" style="font-size:13.5px;color:#5b544a;margin-bottom:14px;">К оплате: <b>${p.price} ₽</b> · начислится <b>${Math.round(p.price*0.1)}</b> бонусов</div>
    <div class="form-err" id="bkErr"></div>
    <button class="btn primary" style="width:100%;padding:13px;" onclick="confirmPurchase('${p.id}', ${maxRedeem})">Подтвердить и оплатить</button>
  `;
  const cb = document.getElementById('useBonus');
  if(cb){
    cb.addEventListener('change', ()=>{
      const paid = cb.checked ? p.price - maxRedeem : p.price;
      document.getElementById('payBreakdown').innerHTML = `К оплате: <b>${paid} ₽</b> ${cb.checked?`(списано ${maxRedeem} бонусов)`:''} · начислится <b>${Math.round(paid*0.1)}</b> бонусов`;
    });
  }
  openModal('detailOverlay');
}
async function confirmPurchase(id, maxRedeem){
  const p = state.products.find(x=>x.id===id);
  const err = document.getElementById('bkErr');
  const date = document.getElementById('bkDate').value;
  const time = document.getElementById('bkTime').value;
  const master = document.getElementById('bkMaster').value;
  if(!date || !time || !master){ err.textContent = 'Выберите дату, время и мастера.'; err.style.display='block'; return; }

  const busy = state.bookings.some(b => b.master===master && b.date===date && b.time===time && (b.status==='Ожидает подтверждения' || b.status==='Подтверждено'));
  if(busy){ err.textContent = `Мастер ${master} уже занят(а) ${formatDate(date)} в ${time}. Выберите другое время или мастера.`; err.style.display='block'; return; }

  const cb = document.getElementById('useBonus');
  const useBonus = cb && cb.checked;
  const paid = useBonus ? p.price - maxRedeem : p.price;
  const earned = Math.round(paid*0.1);

  state.account.balance = (state.account.balance||0) - (useBonus?maxRedeem:0) + earned;
  await sSet('account:'+state.account.username, state.account, true);

  const booking = {
    id: 'b'+Date.now(),
    username: state.account.username,
    clientName: state.account.fullname || state.account.username,
    productId: p.id,
    serviceName: p.name,
    price: p.price,
    paid, bonus: earned,
    master, date, time,
    status: 'Ожидает подтверждения',
    createdAt: new Date().toISOString()
  };
  state.bookings.push(booking);
  await sSet('bookings', state.bookings, true);

  renderLoyaltyCard();
  closeModal('detailOverlay');
  toast(`Запись на ${formatDate(date)} в ${time} оформлена! Начислено ${earned} бонусов 🤍`);
}

/* ===================== ACCOUNT MODAL ===================== */
function openAccount(){
  const a = state.account;
  const myBookings = state.bookings.filter(b=>b.username===a.username).sort((x,y)=> (y.date+y.time).localeCompare(x.date+x.time));
  const hist = myBookings.map(b=>`
    <div class="history-row">
      <div>
        <div class="h-name">${b.serviceName}</div>
        <div class="h-meta">${formatDate(b.date)} в ${b.time} · мастер ${b.master} · <b style="color:${statusColor(b.status)}">${b.status}</b></div>
      </div>
      <div style="text-align:right;"><div>${b.paid} ₽</div><div class="bonus-tag">+${b.bonus}</div></div>
    </div>
  `).join('') || `<p class="hint">Записей пока нет — самое время выбрать услугу.</p>`;

  document.getElementById('accountContent').innerHTML = `
    <p class="eyebrow">Личный кабинет</p>
    <h3>${a.fullname || a.username}</h3>
    <p class="hint" style="margin:-8px 0 4px;">Уровень доступа: <b>${roleLabel(a.role)}</b></p>
    <div class="loyalty-card" style="margin:18px 0 26px;max-width:360px;">
      <div class="top-row">
        <div><div class="lc-label">Люби Себя</div><div class="lc-name">${a.fullname||a.username}</div></div>
        <div class="drops"><span class="drop c3"></span><span class="drop c4"></span></div>
      </div>
      <div>
        <div class="lc-label">Бонусный баланс</div>
        <div class="lc-balance">${a.balance} ₽</div>
        <div class="lc-number" style="margin-top:6px;">${formatCardNumber(a.cardNumber)}</div>
      </div>
    </div>
    <h4 style="margin-bottom:6px;">История записей</h4>
    ${hist}
  `;
  openModal('accountOverlay');
}

/* ===================== ADMIN PANEL ===================== */
const TAB_PERM = {products:'catalog', masters:'masters', customers:'customers', content:'content'};
function applyAdminTabVisibility(){
  Object.keys(TAB_PERM).forEach(t=>{
    document.getElementById('adminTabBtn-'+t).style.display = hasPerm(TAB_PERM[t]) ? 'inline-flex' : 'none';
  });
}
function openAdmin(){
  const canPanel = hasPerm('catalog') || hasPerm('masters') || hasPerm('customers') || hasPerm('content');
  if(!state.account || !canPanel){ toast('Недостаточно прав доступа.'); return; }
  applyAdminTabVisibility();
  const firstTab = ['products','masters','customers','content'].find(t=>hasPerm(TAB_PERM[t]));
  switchAdminTab(firstTab);
  renderAdminList();
  openModal('adminOverlay');
}
function switchAdminTab(tab){
  if(!hasPerm(TAB_PERM[tab])) return;
  ['products','masters','customers','content'].forEach(t=>{
    document.getElementById('adminTab-'+t).style.display = t===tab ? 'block':'none';
    document.getElementById('adminTabBtn-'+t).classList.toggle('active', t===tab);
  });
  if(tab==='masters') renderMastersList();
  if(tab==='customers') renderCustomersList();
  if(tab==='content') renderContentForm();
}

/* ----- customers / user database (persists across reloads via shared storage) ----- */
let loadedCustomers = [];
async function renderCustomersList(){
  const el = document.getElementById('customersList');
  el.innerHTML = `<p class="hint">Загрузка базы клиентов…</p>`;
  const keys = await sList('account:', true);
  const accounts = [];
  for(const k of keys){
    let acc = await sGet(k, true);
    if(acc){
      acc = await ensureAccountDefaults(acc);
      accounts.push(acc);
    }
  }
  accounts.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  loadedCustomers = accounts;
  document.getElementById('customersCount').textContent = `${accounts.length} аккаунтов в базе`;
  renderCustomersFiltered();
}
function renderCustomersFiltered(){
  const raw = (document.getElementById('customerSearch')?.value || '').trim().toLowerCase();
  const q = raw.replace(/\s/g,'');
  const list = raw ? loadedCustomers.filter(a =>
    (a.fullname||'').toLowerCase().includes(raw) ||
    (a.username||'').toLowerCase().includes(raw) ||
    String(a.cardNumber||'').includes(q)
  ) : loadedCustomers;
  document.getElementById('customersList').innerHTML = list.map(a=>{
    const visits = state.bookings.filter(b=>b.username===a.username).length;
    const joined = a.createdAt ? formatDate(a.createdAt.slice(0,10)) : '—';
    const isSelf = state.account && a.username === state.account.username;
    return `
    <div class="admin-row">
      <div class="ph" style="display:flex;">${a.role==='admin' ? '🛡️' : a.role==='manager' ? '🧭' : '👤'}</div>
      <div class="info">
        <b>${escapeHtml(a.fullname||a.username)}</b>
        <span>Карта № ${formatCardNumber(a.cardNumber)} · Логин: ${escapeHtml(a.username)} · Баланс: ${a.balance||0} ₽ · Записей: ${visits} · с ${joined}</span>
      </div>
      <div class="a-actions" style="align-items:center;">
        <select class="role-select" onchange="setUserRole('${escapeHtml(a.username)}', this.value)" ${isSelf ? 'disabled title="Нельзя изменить собственный уровень доступа"' : ''}>
          <option value="user" ${a.role==='user'?'selected':''}>Клиент</option>
          <option value="manager" ${a.role==='manager'?'selected':''}>Менеджер</option>
          <option value="admin" ${a.role==='admin'?'selected':''}>Администратор</option>
        </select>
        ${(a.role!=='admin' && !isSelf) ? `<button class="btn danger small" onclick="deleteCustomer('${escapeHtml(a.username)}')">Удалить</button>` : ''}
      </div>
    </div>`;
  }).join('') || `<p class="hint">Ничего не найдено.</p>`;
}
async function setUserRole(username, newRole){
  if(!hasPerm('customers')){ toast('Недостаточно прав доступа.'); return; }
  const key = 'account:'+username;
  const acc = await sGet(key, true);
  if(!acc) return;
  acc.role = newRole;
  acc.isAdmin = newRole === 'admin';
  await sSet(key, acc, true);
  toast(`Уровень доступа для ${acc.fullname||username} изменён: ${roleLabel(newRole)}.`);
  renderCustomersList();
}
async function deleteCustomer(username){
  if(!hasPerm('customers')) return;
  if(!confirm(`Удалить аккаунт «${username}» из базы? Действие необратимо.`)) return;
  try{
    const cur = await sGet('account:'+username, true);
    if(cur){ await window.storage.delete('account:'+username, true); }
  }catch(e){ console.error(e); }
  renderCustomersList();
  toast('Аккаунт удалён из базы клиентов.');
}

/* ----- masters ----- */
function renderMastersList(){
  document.getElementById('mastersList').innerHTML = state.masters.map((m,i)=>`
    <div class="admin-row">
      <div class="ph" style="display:flex;">💇</div>
      <div class="info"><b>${escapeHtml(m)}</b></div>
      <div class="a-actions"><button class="btn danger small" onclick="removeMaster(${i})">Удалить</button></div>
    </div>
  `).join('') || `<p class="hint">Список мастеров пуст — добавьте хотя бы одного, иначе клиенты не смогут записаться.</p>`;
}
async function addMaster(){
  const input = document.getElementById('newMasterName');
  const name = input.value.trim();
  if(!name) return;
  state.masters.push(name);
  await sSet('masters', state.masters, true);
  input.value='';
  renderMastersList();
  toast('Мастер добавлен.');
}
async function removeMaster(i){
  if(!confirm('Удалить мастера из списка?')) return;
  state.masters.splice(i,1);
  await sSet('masters', state.masters, true);
  renderMastersList();
  toast('Мастер удалён.');
}

/* ----- site text editor ----- */
function renderContentForm(){
  const els = [...document.querySelectorAll('[data-cid]')];
  const groups = {};
  els.forEach(el=>{
    const g = el.getAttribute('data-group') || 'Прочее';
    (groups[g] = groups[g] || []).push(el);
  });
  let html = '';
  Object.keys(groups).forEach(g=>{
    html += `<div class="content-group-title">${escapeHtml(g)}</div>`;
    groups[g].forEach(el=>{
      const cid = el.getAttribute('data-cid');
      const label = el.getAttribute('data-label') || cid;
      const val = state.contentState[cid] !== undefined ? state.contentState[cid] : el.textContent;
      const long = val.length > 46;
      html += `<div class="field"><label>${escapeHtml(label)}</label>${
        long
          ? `<textarea data-cid-input="${cid}">${escapeHtml(val)}</textarea>`
          : `<input data-cid-input="${cid}" value="${escapeHtml(val)}">`
      }</div>`;
    });
  });
  document.getElementById('contentFormFields').innerHTML = html;
}
async function saveContentForm(){
  document.querySelectorAll('[data-cid-input]').forEach(el=>{
    state.contentState[el.getAttribute('data-cid-input')] = el.value;
  });
  await sSet('siteContent', state.contentState, true);
  applyContent();
  renderLoyaltyCard();
  toast('Тексты сайта обновлены.');
}

/* ----- bookings moderation (separate admin page) ----- */
function openBookingsAdmin(){
  if(!hasPerm('bookings')){ toast('Недостаточно прав доступа.'); return; }
  renderBookingFilters();
  renderBookingsList('Все');
  openModal('bookingsOverlay');
}
function renderBookingFilters(){
  const statuses = ['Все','Ожидает подтверждения','Подтверждено','Выполнено','Отменено'];
  document.getElementById('bookingFilters').innerHTML = statuses.map((s,i)=>
    `<button class="filter-pill ${i===0?'active':''}" onclick="selectBookingFilter(this,'${s}')">${s}</button>`
  ).join('');
}
function selectBookingFilter(btn, s){
  document.querySelectorAll('#bookingFilters .filter-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderBookingsList(s);
}
function renderBookingsList(filter){
  filter = filter || 'Все';
  let list = [...state.bookings].sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  if(filter!=='Все') list = list.filter(b=>b.status===filter);
  document.getElementById('bookingsList').innerHTML = list.map(b=>`
    <div class="admin-row booking-row">
      <div class="info" style="flex:1;min-width:200px;">
        <b>${escapeHtml(b.serviceName)} · ${b.price} ₽</b>
        <span>Клиент: ${escapeHtml(b.clientName)} (${escapeHtml(b.username)})</span>
        <span>Мастер: ${escapeHtml(b.master)} · ${formatDate(b.date)} в ${b.time}</span>
        <span>Статус: <span class="status-badge" style="color:${statusColor(b.status)}">${b.status}</span></span>
      </div>
      <div class="a-actions">${bookingActions(b)}</div>
    </div>
  `).join('') || `<p class="hint">Записей нет.</p>`;
}
function bookingActions(b){
  if(b.status==='Ожидает подтверждения'){
    return `<button class="btn primary small" onclick="setBookingStatus('${b.id}','Подтверждено')">Подтвердить</button>
            <button class="btn danger small" onclick="setBookingStatus('${b.id}','Отменено')">Отменить</button>`;
  }
  if(b.status==='Подтверждено'){
    return `<button class="btn ghost small" onclick="setBookingStatus('${b.id}','Выполнено')">Выполнено</button>
            <button class="btn danger small" onclick="setBookingStatus('${b.id}','Отменено')">Отменить</button>`;
  }
  return '';
}
async function setBookingStatus(id, status){
  const b = state.bookings.find(x=>x.id===id);
  if(!b) return;
  b.status = status;
  await sSet('bookings', state.bookings, true);
  const activePill = document.querySelector('#bookingFilters .filter-pill.active');
  renderBookingsList(activePill ? activePill.textContent : 'Все');
  toast('Статус записи обновлён.');
}

function renderAdminList(){
  document.getElementById('adminCount').textContent = `${state.products.length} услуг в каталоге`;
  document.getElementById('adminList').innerHTML = state.products.map(p=>`
    <div class="admin-row">
      ${p.image ? `<img src="${p.image}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`:''}
      <div class="ph" style="${p.image?'display:none;':'display:flex;'}">💅</div>
      <div class="info"><b>${p.name}</b><span>${p.category} · ${p.price} ₽</span></div>
      <div class="a-actions">
        <button class="btn ghost small" onclick="openProductForm('${p.id}')">Изменить</button>
        <button class="btn danger small" onclick="deleteProduct('${p.id}')">Удалить</button>
      </div>
    </div>
  `).join('') || `<p class="hint">Каталог пуст. Добавьте первую услугу.</p>`;
}
let editingId = null;
function openProductForm(id){
  editingId = id || null;
  document.getElementById('pfErr').style.display='none';
  document.getElementById('pfFile').value='';
  if(id){
    const p = state.products.find(x=>x.id===id);
    document.getElementById('pfTitle').textContent = 'Редактировать услугу';
    document.getElementById('pfName').value = p.name;
    document.getElementById('pfPrice').value = p.price;
    document.getElementById('pfCategory').value = p.category;
    document.getElementById('pfDesc').value = p.description||'';
    document.getElementById('pfImageUrl').value = p.image && p.image.startsWith('http') ? p.image : '';
    document.getElementById('pfPreview').innerHTML = p.image ? `<img src="${p.image}">` : 'Фото не выбрано';
    window._pfImageData = p.image || '';
  } else {
    document.getElementById('pfTitle').textContent = 'Новая услуга';
    document.getElementById('pfName').value='';
    document.getElementById('pfPrice').value='';
    document.getElementById('pfCategory').value='Маникюр';
    document.getElementById('pfDesc').value='';
    document.getElementById('pfImageUrl').value='';
    document.getElementById('pfPreview').innerHTML='Фото не выбрано';
    window._pfImageData = '';
  }
  openModal('productFormOverlay');
}
function pfPreviewUrl(){
  const url = document.getElementById('pfImageUrl').value.trim();
  if(url){ window._pfImageData = url; document.getElementById('pfPreview').innerHTML = `<img src="${url}" onerror="this.parentElement.innerHTML='Не удалось загрузить изображение по ссылке';">`; }
}
function handlePfFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      const canvas = document.createElement('canvas');
      const maxW = 800;
      const scale = Math.min(1, maxW/img.width);
      canvas.width = img.width*scale; canvas.height = img.height*scale;
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      window._pfImageData = dataUrl;
      document.getElementById('pfImageUrl').value='';
      document.getElementById('pfPreview').innerHTML = `<img src="${dataUrl}">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
async function saveProductForm(){
  const name = document.getElementById('pfName').value.trim();
  const price = parseInt(document.getElementById('pfPrice').value,10);
  const category = document.getElementById('pfCategory').value;
  const description = document.getElementById('pfDesc').value.trim();
  const err = document.getElementById('pfErr');
  if(!name || !price || price<=0){ err.textContent='Укажите название и корректную цену.'; err.style.display='block'; return; }

  const image = window._pfImageData || '';
  if(editingId){
    const idx = state.products.findIndex(p=>p.id===editingId);
    state.products[idx] = {...state.products[idx], name, price, category, description, image};
  } else {
    state.products.push({id:'p'+Date.now(), name, price, category, description, image});
  }
  await sSet('catalog', state.products, true);
  closeModal('productFormOverlay');
  renderFilters(); renderGrid('Все'); renderAdminList();
  toast('Услуга сохранена.');
}
async function deleteProduct(id){
  if(!confirm('Удалить эту услугу из каталога?')) return;
  state.products = state.products.filter(p=>p.id!==id);
  await sSet('catalog', state.products, true);
  renderFilters(); renderGrid('Все'); renderAdminList();
  toast('Услуга удалена.');
}

/* ===================== MODAL / TOAST UTIL ===================== */
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click', e=>{ if(e.target===o) o.classList.remove('show'); });
});
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 3200);
}

init();
