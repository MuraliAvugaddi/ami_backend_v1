// ============================================================
// BREVO SMS — used for SOS so staff get it even if the app is closed.
// Needs BREVO_API_KEY in .env (same key used for the OTP emails).
// For Indian numbers Brevo needs a DLT-approved sender (ask Brevo support).
// ============================================================

const toIndianNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return '';
};

const sendBrevoSms = async (phones, text) => {
    if (!process.env.BREVO_API_KEY) return;

    const numbers = [...new Set(phones.map(toIndianNumber).filter(Boolean))];
    const sender = (process.env.BREVO_SMS_SENDER || 'AMIHST').slice(0, 11);

    for (const recipient of numbers) {
        try {
            const response = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender,
                    recipient,
                    content: String(text).slice(0, 320),
                    type: 'transactional'
                })
            });
            if (!response.ok) {
                console.error(`❌ Brevo SMS to ${recipient} failed:`, (await response.text()).slice(0, 200));
            }
        } catch (error) {
            console.error('❌ Brevo SMS error:', error.message);
        }
    }
};

const sendBrevoMail = async (people, subject, text) => {
    if (!process.env.BREVO_API_KEY) return;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'venkatavugaddi@gmail.com';
    const list = people.filter((p) => p && /\S+@\S+\.\S+/.test(p.email || ''));

    for (const person of list) {
        try {
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'Ami Hostlers Jaipur', email: senderEmail },
                    to: [{ email: person.email, name: person.name || '' }],
                    subject,
                    htmlContent: `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto;">
                        <h2 style="color: #D5A514;">Ami Hostlers Jaipur</h2>
                        <h3>${subject}</h3>
                        <p style="font-size: 15px; line-height: 1.5;">${String(text).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
                        <p style="color: #777; font-size: 12px;">Open the Ami app for details.</p>
                    </div>`
                })
            });
        } catch (error) {
            console.error('❌ Brevo mail error:', error.message);
        }
    }
};

module.exports = { sendBrevoSms, sendBrevoMail };
