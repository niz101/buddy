// const express = require('express');
// const { lipaNaMpesaPush } = require('../services/mpesa.service');
// const { Transaction } = require('../models/transaction.model');
// const auth = require('../middleware/auth.middleware');
// const router = express.Router();

// // POST /api/wallet/deposit -> initiates STK push and creates pending transaction
// router.post('/deposit', auth, async (req, res, next) => {
//   try {
//     const { amount, phone } = req.body;
//     if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

//     const tx = await Transaction.create({ userId: req.user._id, type: 'deposit', amount, status: 'pending', meta: { phone } });

//     const mpesaResp = await lipaNaMpesaPush({ amount, phone, accountReference: `wallet:${req.user._id}`, transactionDesc: `Deposit ${req.user._id}` });

//     tx.checkoutRequestId = mpesaResp.CheckoutRequestID || mpesaResp.checkOutRequestID || mpesaResp.CheckoutRequestId;
//     tx.meta = { ...tx.meta, mpesaResponse: mpesaResp };
//     await tx.save();

//     res.json({ message: 'STK Push sent', checkoutRequestId: tx.checkoutRequestId, txId: tx._id });
//   } catch (err) { next(err); }
// });

// // GET balance
// router.get('/balance', auth, async (req, res, next) => {
//   try {
//     const user = req.user;
//     res.json({ balance: user.balance });
//   } catch (err) { next(err); }
// });

// module.exports = router;



// was
// // wallet.controller.js
// const express = require('express');
// const { lipaNaMpesaPush } = require('../services/mpesa.service');
// const { Transaction } = require('../models/transaction.model');
// const auth = require('../middleware/auth.middleware');

// const router = express.Router();

// // POST /api/wallet/deposit -> initiates STK push
// router.post('/deposit', auth, async (req, res, next) => {
//   try {
//     const { amount, phone } = req.body;
//     if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

//     const tx = await Transaction.create({
//       userId: req.user._id,
//       type: 'deposit',
//       amount,
//       status: 'pending',
//       meta: { phone },
//     });

//     const mpesaResp = await lipaNaMpesaPush({
//       amount,
//       phone,
//       accountReference: `wallet:${req.user._id}`,
//       transactionDesc: `Deposit KSh ${amount}`,
//     });

//     tx.checkoutRequestId = mpesaResp.CheckoutRequestID || mpesaResp.checkOutRequestID;
//     tx.meta = { ...tx.meta, mpesaResponse: mpesaResp };
//     await tx.save();

//     res.json({
//       message: 'STK Push sent',
//       checkoutRequestId: tx.checkoutRequestId,
//       txId: tx._id,
//     });
//   } catch (err) {
//     next(err);
//   }
// });

// // GET /api/wallet/balance - get current balance
// router.get('/balance', auth, async (req, res) => {
//   res.json({ balance: req.user.balance });
// });

// // GET /api/wallet/transactions - get user's transaction history
// router.get('/transactions', auth, async (req, res) => {
//   try {
//     const transactions = await Transaction.find({ userId: req.user._id })
//       .sort({ createdAt: -1 })
//       .limit(50);

//     res.json(transactions);
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch transactions' });
//   }
// });

// module.exports = router;











const express = require('express');
const { lipaNaMpesaPush } = require('../services/mpesa.service');
const { Transaction } = require('../models/transaction.model');

const router = express.Router();

// POST /api/wallet/deposit -> initiates STK push
router.post('/deposit', async (req, res, next) => {
  try {
    const { amount, phone } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    // Create transaction record
    const tx = await Transaction.create({
      type: 'deposit',
      amount,
      status: 'pending',
      meta: { phone },
    });

    // Initiate STK Push
    const mpesaResp = await lipaNaMpesaPush({
      amount,
      phone,
      accountReference: `wallet:${tx._id}`,
      transactionDesc: `Deposit KSh ${amount}`,
    });

    tx.checkoutRequestId = mpesaResp.CheckoutRequestID || mpesaResp.checkOutRequestID;
    tx.meta = { ...tx.meta, mpesaResponse: mpesaResp };
    await tx.save();

    res.json({
      message: 'STK Push sent',
      checkoutRequestId: tx.checkoutRequestId,
      txId: tx._id,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/wallet/balance - sum of all completed deposits
router.get('/balance', async (req, res) => {
  try {
    const result = await Transaction.aggregate([
      { $match: { status: 'completed', type: 'deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const balance = result.length ? result[0].total : 0;
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate balance' });
  }
});

// GET /api/wallet/transactions - last 50 transactions
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
