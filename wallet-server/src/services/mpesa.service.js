
// was
// const axios = require('axios');

// const base = process.env.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

// let cachedToken = null;
// let tokenExpiry = 0;

// async function getAccessToken() {
//   const now = Date.now();
//   if (cachedToken && now < tokenExpiry - 10000) return cachedToken;

//   const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
//   const { data } = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
//     headers: { Authorization: `Basic ${auth}` }
//   });
//   cachedToken = data.access_token;
//   tokenExpiry = now + (data.expires_in * 1000);
//   return cachedToken;
// }

// async function lipaNaMpesaPush({ amount, phone, accountReference, transactionDesc }) {
//   const token = await getAccessToken();
//   const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0,14); // YYYYMMDDHHMMSS
//   const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

//   const body = {
//     BusinessShortCode: process.env.MPESA_SHORTCODE,
//     Password: password,
//     Timestamp: timestamp,
//     TransactionType: 'CustomerPayBillOnline',
//     Amount: amount,
//     PartyA: phone,
//     PartyB: process.env.MPESA_SHORTCODE,
//     PhoneNumber: phone,
//     CallBackURL: process.env.MPESA_CALLBACK_URL,
//     AccountReference: accountReference || 'WalletDeposit',
//     TransactionDesc: transactionDesc || 'Deposit to wallet'
//   };

//   const { data } = await axios.post(`${base}/mpesa/stkpush/v1/processrequest`, body, {
//     headers: { Authorization: `Bearer ${token}` }
//   });

//   return data;
// }

// module.exports = { getAccessToken, lipaNaMpesaPush };













const axios = require('axios');

const base = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let cachedToken = null;
let tokenExpiry = 0;

// === Get OAuth access token ===
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 10000) return cachedToken;

  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const { data } = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in * 1000);
  return cachedToken;
}

// === Initiate STK Push ===
async function lipaNaMpesaPush({ amount, phone, accountReference, transactionDesc }) {
  if (!amount || amount <= 0) throw new Error('Invalid amount');
  if (!phone) throw new Error('Phone number required');

  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const body = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountReference || 'WalletDeposit',
    TransactionDesc: transactionDesc || 'Deposit to wallet',
  };

  try {
    const { data } = await axios.post(`${base}/mpesa/stkpush/v1/processrequest`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch (err) {
    console.error('Mpesa STK Push failed', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { getAccessToken, lipaNaMpesaPush };
