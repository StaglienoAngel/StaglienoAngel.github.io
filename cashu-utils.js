/**
 * Cashu Payment Processor - Browser Only
 * Usando @cashu/cashu-ts desde esm.sh
 */

// Importar desde esm.sh (mejor compatibilidad que jsdelivr)
import { getDecodedToken, CashuMint, CashuWallet } from 'https://esm.sh/@cashu/cashu-ts@1.2.1';

const ALLOWED_MINT = 'https://mint.cubabitcoin.org';
const LNADDRESS = 'ia@lachispa.me';

/**
 * Decodifica y verifica un token Cashu
 */
export async function decodeCashuToken(tokenStr) {
    try {
        // Decodificar el token (soporta v3 y v4/CBOR)
        const token = getDecodedToken(tokenStr);

        if (!token || !token.token || token.token.length === 0) {
            throw new Error('Token inválido o vacío');
        }

        // Extraer información
        const tokenEntry = token.token[0];
        const mint = tokenEntry.mint;
        const proofs = tokenEntry.proofs || [];

        // Sumar cantidad total
        const amount = proofs.reduce((sum, p) => sum + p.amount, 0);

        return {
            mint: mint,
            proofs: proofs,
            amount: amount,
            unit: token.unit || 'sat',
            memo: token.memo || '',
            rawToken: token
        };
    } catch (error) {
        throw new Error('Error decodificando token: ' + error.message);
    }
}

/**
 * Verifica que el token sea del mint correcto
 */
export async function verifyCashuToken(tokenStr, requiredAmount) {
    const decoded = await decodeCashuToken(tokenStr);

    // Verificar mint
    if (decoded.mint !== ALLOWED_MINT) {
        throw new Error(`Solo aceptamos tokens de ${ALLOWED_MINT}. Recibido: ${decoded.mint}`);
    }

    // Verificar monto
    if (decoded.amount < requiredAmount) {
        throw new Error(`Monto insuficiente. Token tiene ${decoded.amount} sats, necesitas ${requiredAmount} sats`);
    }

    // Verificar que tenga proofs
    if (!decoded.proofs || decoded.proofs.length === 0) {
        throw new Error('Token no contiene proofs válidos');
    }

    return decoded;
}

/**
 * Obtiene un Lightning invoice desde una Lightning Address
 */
export async function getLightningInvoice(lnaddress, amountSats, memo = '') {
    const [user, domain] = lnaddress.split('@');

    if (!user || !domain) {
        throw new Error('Lightning Address inválida');
    }

    try {
        // 1. Obtener LNURL-pay endpoint
        const lnurlResponse = await fetch(
            `https://${domain}/.well-known/lnurlp/${user}`
        );

        if (!lnurlResponse.ok) {
            throw new Error('No se pudo obtener datos de Lightning Address');
        }

        const lnurlData = await lnurlResponse.json();

        if (lnurlData.status === 'ERROR') {
            throw new Error(lnurlData.reason || 'Error en LNURL');
        }

        // 2. Generar invoice
        const amountMsat = amountSats * 1000;
        const callbackUrl = new URL(lnurlData.callback);
        callbackUrl.searchParams.set('amount', amountMsat);
        if (memo) {
            callbackUrl.searchParams.set('comment', memo);
        }

        const invoiceResponse = await fetch(callbackUrl.toString());

        if (!invoiceResponse.ok) {
            throw new Error('No se pudo generar el invoice');
        }

        const invoiceData = await invoiceResponse.json();

        if (invoiceData.status === 'ERROR') {
            throw new Error(invoiceData.reason || 'Error generando invoice');
        }

        return invoiceData.pr; // BOLT11 invoice

    } catch (error) {
        throw new Error('Error con Lightning Address: ' + error.message);
    }
}

/**
 * Procesa un pago Cashu completo en el navegador
 * Flujo: Recibir token → Generar invoice → Melt (Cashu → Lightning)
 */
export async function processCashuPayment(tokenStr, amountSats, soulName = 'Anonymous') {
    try {
        console.log('[Cashu] 🥜 Iniciando proceso de pago...');

        // 1. Verificar el token
        console.log('[Cashu] 📝 Decodificando y verificando token...');
        const tokenData = await verifyCashuToken(tokenStr, amountSats);
        console.log(`[Cashu] ✅ Token válido: ${tokenData.amount} sats de ${tokenData.mint}`);

        // 2. Crear wallet y conectar al mint
        console.log('[Cashu] 🏦 Conectando al mint:', ALLOWED_MINT);
        const mint = new CashuMint(ALLOWED_MINT);
        const wallet = new CashuWallet(mint);
        console.log('[Cashu] ✅ Wallet creado');

        // 3. Generar invoice temporal para consultar fee
        console.log('[Cashu] 🔍 Consultando fee del mint...');
        const memo = `Staglieno Soul: ${soulName}`;
        const tempInvoice = await getLightningInvoice(LNADDRESS, tokenData.amount, memo);

        // 4. Crear melt quote para obtener el fee real
        console.log('[Cashu] 💱 Consultando melt quote...');
        const tempQuote = await wallet.createMeltQuote(tempInvoice);
        const feeRequired = tempQuote.fee_reserve;

        console.log('[Cashu] 📊 Fee del mint:', feeRequired, 'sats');

        // 5. Calcular monto final (token - fee)
        const finalAmount = tokenData.amount - feeRequired;

        if (finalAmount <= 0) {
            throw new Error(`Token insuficiente. Necesitas al menos ${feeRequired + 1} sats (fee: ${feeRequired} sats)`);
        }

        console.log('[Cashu] 💰 Monto final a enviar:', finalAmount, 'sats (de', tokenData.amount, 'sats - fee', feeRequired, 'sats)');

        // 6. Generar invoice final con monto exacto
        console.log('[Cashu] ⚡ Generando invoice final...');
        const finalInvoice = await getLightningInvoice(LNADDRESS, finalAmount, memo);
        console.log('[Cashu] ✅ Invoice final generado:', finalInvoice.substring(0, 30) + '...');

        // 7. Crear melt quote final
        console.log('[Cashu] 💱 Creando melt quote final...');
        const meltQuote = await wallet.createMeltQuote(finalInvoice);
        console.log('[Cashu] Quote final:', {
            invoice: finalAmount,
            fee: meltQuote.fee_reserve,
            total: finalAmount + meltQuote.fee_reserve,
            tokenAmount: tokenData.amount
        });

        // 8. Usar los proofs del token directamente
        console.log('[Cashu] 🪙 Usando proofs del token:', tokenData.proofs.length, 'proofs');
        const proofsToSend = tokenData.proofs;

        // 9. Hacer melt (convertir Cashu → Lightning)
        console.log('[Cashu] 🔥 Haciendo melt con meltTokens...');
        const meltResponse = await wallet.meltTokens(meltQuote, proofsToSend);
        console.log('[Cashu] ✅ Melt completado:', meltResponse);

        // 10. Verificar que haya sido exitoso
        if (!meltResponse || (meltResponse.isPaid === false)) {
            throw new Error('Pago no completado');
        }

        console.log('[Cashu] 🎉 ¡Pago completado exitosamente!');

        return {
            success: true,
            amount: tokenData.amount,
            amountSent: finalAmount,
            fee: feeRequired,
            mint: tokenData.mint,
            invoice: finalInvoice,
            quote: meltQuote,
            meltResponse: meltResponse,
            change: meltResponse.change || []
        };

    } catch (error) {
        console.error('[Cashu] ❌ Error:', error);
        throw error;
    }
}

// Exportar constantes
export { ALLOWED_MINT, LNADDRESS };
