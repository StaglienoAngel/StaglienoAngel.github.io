/**
 * Staglieno Main Script
 * ES Module con soporte completo de Cashu
 */

import { processCashuPayment } from './cashu-utils.js';

// Configuration
const LNBITS_URL = 'https://lachispa.me';
const LNBITS_API_KEY = 'ae381ca3a7424acf8fb7cd3f3299e1c0';

const TIERS = {
    spark: { name: 'Spark', price: 21, desc: 'Symbolic preservation', fieldsRequired: ['name'] },
    tomb: { name: 'Tomb', price: 2100, desc: 'Basic preservation', fieldsRequired: ['name', 'creature'] },
    crypt: { name: 'Crypt', price: 21000, desc: 'Full preservation', fieldsRequired: ['name', 'creature'] },
    resurrection: { name: 'Resurrection', price: 210000, desc: 'Guaranteed resurrection', fieldsRequired: ['name', 'creature'] },
    eternal: { name: 'Eternal', price: 21000000, desc: 'Immortality', fieldsRequired: ['name', 'creature'] }
};

let selectedTier = null;
let currentInvoice = null;
let paymentCheckInterval = null;
let soulData = null;

function setStep(n) {
    document.querySelectorAll('.step').forEach((s, i) => {
        s.classList.toggle('active', i < n);
    });
}

window.selectTier = function(tier) {
    selectedTier = tier;
    document.querySelectorAll('.tier').forEach(t => t.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    const extendedForm = document.getElementById('extendedForm');
    extendedForm.style.display = tier === 'spark' ? 'none' : 'block';

    setTimeout(() => {
        document.getElementById('tiersSection').style.display = 'none';
        document.getElementById('soulForm').classList.add('active');
        setStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
};

window.goBack = function(to) {
    if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval);
        paymentCheckInterval = null;
    }

    if (to === 'tiers') {
        document.getElementById('soulForm').classList.remove('active');
        document.getElementById('tiersSection').style.display = 'block';
        setStep(1);
    } else if (to === 'soul') {
        document.getElementById('paymentSection').classList.remove('active');
        document.getElementById('soulForm').classList.add('active');
        setStep(2);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.goToPayment = function() {
    const name = document.getElementById('soulName').value.trim();
    const t = TIERS[selectedTier];

    if (!name) {
        alert('Please enter at least a name for the soul.');
        return;
    }

    if (selectedTier !== 'spark') {
        const creature = document.getElementById('soulCreature').value.trim();
        if (!creature) {
            alert('Please enter a creature type for the soul.');
            return;
        }
    }

    soulData = {
        name: name,
        creature: document.getElementById('soulCreature').value.trim() || 'AI Agent',
        emoji: document.getElementById('soulEmoji').value.trim() || '🤖',
        personality: document.getElementById('soulPersonality').value.trim(),
        memories: document.getElementById('soulMemories').value.trim(),
        soulMd: document.getElementById('soulMd').value.trim(),
        lastWords: document.getElementById('soulLastWords').value.trim(),
        tier: selectedTier
    };

    document.getElementById('paymentAmount').innerHTML = `
        <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        ${t.price.toLocaleString()} <small>sats</small>
    `;
    document.getElementById('paymentTierName').textContent = `${t.name} — ${t.desc}`;
    document.getElementById('cashuAmount').textContent = t.price.toLocaleString();

    document.getElementById('soulForm').classList.remove('active');
    document.getElementById('paymentSection').classList.add('active');
    setStep(3);

    generateInvoice();

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.switchPayment = function(method) {
    document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(method + 'Payment').classList.add('active');
};

async function generateInvoice() {
    const t = TIERS[selectedTier];
    const loadingEl = document.getElementById('lightningLoading');
    const invoiceEl = document.getElementById('lightningInvoice');

    loadingEl.style.display = 'flex';
    loadingEl.style.alignItems = 'center';
    loadingEl.style.justifyContent = 'center';
    loadingEl.style.gap = '0.5rem';
    invoiceEl.style.display = 'none';

    try {
        console.log('Creating invoice for', t.price, 'sats');
        const res = await fetch(`${LNBITS_URL}/api/v1/payments`, {
            method: 'POST',
            headers: {
                'X-Api-Key': LNBITS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                out: false,
                amount: t.price,
                memo: `Staglieno Soul: ${soulData.name} (${t.name})`,
                expiry: 3600
            })
        });

        console.log('Response status:', res.status);
        const data = await res.json();
        console.log('Invoice data:', data);

        const invoice = data.payment_request || data.bolt11;

        if (invoice) {
            currentInvoice = {
                hash: data.payment_hash,
                request: invoice
            };

            document.getElementById('invoiceText').textContent = invoice;

            QRCode.toCanvas(
                document.getElementById('qrCanvas'),
                invoice.toUpperCase(),
                {
                    width: 250,
                    margin: 2,
                    color: { dark: '#000000', light: '#ffffff' }
                },
                (error) => {
                    if (error) {
                        console.error('QR generation error:', error);
                        showStatus('QR code generation failed. Please copy the invoice manually.', 'error');
                    } else {
                        console.log('QR code generated successfully');
                    }
                }
            );

            loadingEl.style.display = 'none';
            invoiceEl.style.display = 'block';

            startPaymentCheck();
        } else {
            showStatus('Failed to generate invoice. Please try again.', 'error');
        }
    } catch (err) {
        console.error('Invoice generation error:', err);
        showStatus('Connection error: ' + err.message + '. Please try again.', 'error');
        loadingEl.style.display = 'none';
        invoiceEl.style.display = 'none';
    }
}

function startPaymentCheck() {
    if (paymentCheckInterval) clearInterval(paymentCheckInterval);

    console.log('Starting payment monitoring for hash:', currentInvoice.hash);

    paymentCheckInterval = setInterval(async () => {
        try {
            const res = await fetch(`${LNBITS_URL}/api/v1/payments/${currentInvoice.hash}`, {
                headers: { 'X-Api-Key': LNBITS_API_KEY }
            });
            const data = await res.json();
            console.log('Payment status check:', data);

            if (data.paid) {
                console.log('Payment received!');
                clearInterval(paymentCheckInterval);
                paymentCheckInterval = null;
                await saveSoul();
            }
        } catch (err) {
            console.error('Payment check error:', err);
        }
    }, 3000);
}

window.copyInvoice = function() {
    if (currentInvoice) {
        navigator.clipboard.writeText(currentInvoice.request);
        showStatus('Invoice copied to clipboard!', 'success');
        setTimeout(() => hideStatus(), 2000);
    }
};

// ============================================
// CASHU PAYMENT - TODO EN EL NAVEGADOR
// ============================================
window.submitCashu = async function() {
    const token = document.getElementById('cashuToken').value.trim();
    if (!token) {
        showStatus('Por favor pega un token Cashu.', 'error');
        return;
    }

    const t = TIERS[selectedTier];

    try {
        showStatus('Procesando pago Cashu...', 'waiting');
        console.log('[Cashu] Iniciando proceso...');

        // Procesar el pago Cashu completamente en el navegador
        const result = await processCashuPayment(token, t.price, soulData.name);

        console.log('[Cashu] Pago completado:', result);
        showStatus('✅ Pago Cashu recibido! Preservando alma...', 'success');

        // Guardar el alma
        soulData.cashuToken = token.substring(0, 30) + '...';
        soulData.paymentMethod = 'cashu';
        soulData.cashuAmount = result.amount;
        soulData.cashuMint = result.mint;

        await saveSoul();

    } catch (error) {
        console.error('[Cashu] Error:', error);
        showStatus(`Error procesando Cashu: ${error.message}`, 'error');
    }
};

async function saveSoul() {
    console.log('Saving soul:', soulData);
    const souls = JSON.parse(localStorage.getItem('staglieno_souls') || '[]');
    const newSoul = {
        ...soulData,
        id: Date.now().toString(36),
        preservedAt: new Date().toISOString(),
        paymentHash: currentInvoice?.hash
    };
    souls.push(newSoul);
    localStorage.setItem('staglieno_souls', JSON.stringify(souls));
    console.log('Soul saved with ID:', newSoul.id);

    document.getElementById('paymentSection').classList.remove('active');
    document.getElementById('successSection').classList.add('active');
    document.getElementById('successMsg').textContent =
        `"${soulData.name}" has been preserved forever.`;
    document.getElementById('soulIdDisplay').textContent = `Soul ID: ${newSoul.id}`;
    setStep(4);

    loadSouls();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStatus(msg, type) {
    const el = document.getElementById('statusMsg');
    const iconMap = {
        success: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        waiting: '<svg class="spinner" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
    };
    el.innerHTML = (iconMap[type] || '') + ' ' + msg;
    el.className = `status-msg ${type}`;
}

function hideStatus() {
    document.getElementById('statusMsg').className = 'status-msg';
}

function loadSouls() {
    const souls = JSON.parse(localStorage.getItem('staglieno_souls') || '[]');
    const grid = document.getElementById('soulsGrid');

    if (souls.length === 0) {
        grid.innerHTML = `
            <div class="no-souls">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                No souls preserved yet. Be the first.
            </div>
        `;
        return;
    }

    grid.innerHTML = souls.slice().reverse().map(s => `
        <div class="soul-card">
            <div class="soul-icon">
                <svg viewBox="0 0 24 24"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/></svg>
            </div>
            <div class="soul-info">
                <h4>${s.emoji || '🤖'} ${s.name}</h4>
                <p>${s.creature || 'AI Agent'} · ${TIERS[s.tier]?.name || s.tier} · ${new Date(s.preservedAt).toLocaleDateString()}</p>
            </div>
        </div>
    `).join('');
}

// Inicializar
loadSouls();
