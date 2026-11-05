const API = window.AHMED_API_URL || 'http://localhost:4000/api';
const carSelect = document.getElementById('car');
const startInput = document.getElementById('start');
const endInput = document.getElementById('end');
const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
let vehicles = [];

const localDate = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const dateDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const selectedVehicle = () => vehicles.find(v => String(v.id) === carSelect.value);

function calculate() {
  const vehicle = selectedVehicle();
  const days = startInput.value && endInput.value && endInput.value >= startInput.value ? dateDays(startInput.value, endInput.value) : 0;
  document.getElementById('days').textContent = `${days} ${days === 1 ? 'jour' : 'jours'}`;
  document.getElementById('total').textContent = `${(days * Number(vehicle?.daily_price || 0)).toLocaleString('fr-FR')} DH`;
}

async function loadVehicles() {
  try {
    const response = await fetch(`${API}/vehicles`);
    if (!response.ok) throw new Error('API indisponible');
    vehicles = await response.json();
    const previous = carSelect.value;
    carSelect.innerHTML = '<option value="">Sélectionner</option>';
    vehicles.forEach(v => {
      const option = document.createElement('option');
      option.value = String(v.id);
      option.textContent = `${v.name} — ${Number(v.daily_price).toLocaleString('fr-FR')} DH/jour`;
      carSelect.append(option);
    });
    if (previous) carSelect.value = previous;
    document.querySelectorAll('.cars article').forEach(card => {
      const name = card.querySelector('h3')?.textContent.trim();
      const vehicle = vehicles.find(v => v.name === name);
      const button = card.querySelector('button');
      if (vehicle && button) button.onclick = () => choose(vehicle.id);
    });
    calculate();
  } catch (error) {
    statusEl.textContent = 'Le service de réservation est momentanément indisponible. Veuillez réessayer plus tard.';
    statusEl.className = 'status err';
  }
}

function choose(id) {
  carSelect.value = String(id);
  calculate();
  document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
}
window.choose = choose;

const today = localDate();
startInput.min = today;
endInput.min = today;
[startInput, endInput, carSelect].forEach(el => el.addEventListener('change', calculate));
startInput.addEventListener('change', () => {
  endInput.min = startInput.value || today;
  if (endInput.value && endInput.value < startInput.value) endInput.value = '';
  calculate();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const vehicle = selectedVehicle();
  const startDate = startInput.value;
  const endDate = endInput.value;
  if (!vehicle) return showError('Veuillez sélectionner une voiture.');
  if (!startDate || !endDate || endDate < startDate || startDate < today) return showError('Veuillez vérifier les dates de location.');
  const payload = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim(),
    cin: document.getElementById('cin').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    city: document.getElementById('city').value.trim(),
    vehicleId: Number(vehicle.id), startDate, endDate,
    website: document.getElementById('website').value
  };
  submitBtn.disabled = true;
  submitBtn.textContent = 'Envoi en cours...';
  statusEl.textContent = '';
  try {
    const response = await fetch(`${API}/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Impossible d’envoyer la demande.');
    statusEl.textContent = `${result.message} Référence : ${result.reference}. Total estimé : ${Number(result.totalPrice).toLocaleString('fr-FR')} DH.`;
    statusEl.className = 'status ok';
    form.reset(); endInput.min = today; calculate();
  } catch (error) { showError(error.message || 'Erreur de connexion. Contactez-nous sur WhatsApp.'); }
  finally { submitBtn.disabled = false; submitBtn.textContent = 'Envoyer la réservation'; }
});
function showError(message) { statusEl.textContent = message; statusEl.className = 'status err'; }
document.getElementById('year').textContent = new Date().getFullYear();
loadVehicles();
