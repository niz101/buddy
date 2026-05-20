// const express = require('express');
// const { Transaction } = require('../models/transaction.model');
// const { User } = require('../models/user.model');
// const mongoose = require('mongoose');

// const router = express.Router();

// // Daraja callback endpoint
// router.post('/callback', express.json({type: '*/*'}), async (req, res) => {
//   // Acknowledge quickly
//   res.status(200).json({ result: 'success' });

//   try {
//     const body = req.body;
//     const callback = body.Body && body.Body.stkCallback ? body.Body.stkCallback : body;
//     const checkoutId = callback.CheckoutRequestID || (callback && callback.Body && callback.Body.stkCallback && callback.Body.stkCallback.CheckoutRequestID);
//     const resultCode = callback.ResultCode !== undefined ? callback.ResultCode : (callback.ResultCode || (callback.Result && callback.Result.ResultCode));

//     if (!checkoutId) {
//       console.warn('No CheckoutRequestID in callback', JSON.stringify(callback).slice(0,200));
//       return;
//     }

//     const tx = await Transaction.findOne({ checkoutRequestId: checkoutId });
//     if (!tx) return console.warn('Tx not found for', checkoutId);

//     if (resultCode === 0) {
//       // success - parse amount
//       const mpesaMeta = (callback.CallbackMetadata && callback.CallbackMetadata.Item) || callback.CallbackMetadata || [];
//       const amountItem = Array.isArray(mpesaMeta) ? mpesaMeta.find(i => i.Name === 'Amount') : null;
//       const amount = amountItem ? amountItem.Value : tx.amount;

//       if (process.env.DB === 'mongo') {
//         const session = await mongoose.startSession();
//         session.startTransaction();
//         try {
//           await Transaction.updateOne({ _id: tx._id }, { $set: { status: 'completed', meta: { ...tx.meta, mpesa: callback } } }, { session });
//           await User.updateOne({ _id: tx.userId }, { $inc: { balance: amount } }, { session });
//           await session.commitTransaction();
//           session.endSession();
//         } catch (err) {
//           await session.abortTransaction();
//           session.endSession();
//           console.error('Transaction failed', err);
//         }
//       } else {
//         // Postgres flow would be used here if selected
//         tx.status = 'completed';
//         tx.meta = { ...tx.meta, mpesa: callback };
//         await tx.save();
//         const user = await User.findById(tx.userId);
//         user.balance = (user.balance || 0) + amount;
//         await user.save();
//       }
//     } else {
//       tx.status = 'failed';
//       tx.meta = { ...tx.meta, mpesa: callback };
//       await tx.save();
//     }
//   } catch (err) {
//     console.error('Error handling mpesa callback', err);
//   }
// });

// module.exports = router;




// ////
// const express = require('express');
// const { Transaction } = require('../models/transaction.model');
// const { User } = require('../models/user.model');
// const mongoose = require('mongoose');

// const router = express.Router();

// // Daraja callback endpoint
// router.post('/callback', express.json({type: '*/*'}), async (req, res) => {
//   // Acknowledge quickly to Daraja
//   res.status(200).json({ result: 'success' });

//   try {
//     const body = req.body;
//     const callback = body.Body && body.Body.stkCallback ? body.Body.stkCallback : body;

//     const checkoutId = callback.CheckoutRequestID || 
//       (callback && callback.Body && callback.Body.stkCallback && callback.Body.stkCallback.CheckoutRequestID);

//     let resultCode = callback.ResultCode !== undefined 
//       ? callback.ResultCode 
//       : (callback.ResultCode || (callback.Result && callback.Result.ResultCode));

//     if (!checkoutId) {
//       console.warn('No CheckoutRequestID in callback', JSON.stringify(callback).slice(0, 200));
//       return;
//     }

//     const tx = await Transaction.findOne({ checkoutRequestId: checkoutId });
//     if (!tx) {
//       console.warn('Tx not found for', checkoutId);
//       return;
//     }

//     // === TEMPORARY FOR SANDBOX TESTING ONLY ===
//     // Force success in non-production to test balance update (sandbox often returns 1032)
//     if (process.env.NODE_ENV !== 'production') {
//       console.log('SANDBOX MODE: Forcing ResultCode = 0 for testing');
//       resultCode = 0;
//     }
//     // ===========================================

//     if (resultCode === 0) {
//       // SUCCESS - parse amount
//       const mpesaMeta = (callback.CallbackMetadata && callback.CallbackMetadata.Item) || 
//                         callback.CallbackMetadata || [];
//       const amountItem = Array.isArray(mpesaMeta) ? mpesaMeta.find(i => i.Name === 'Amount') : null;
//       const amount = amountItem ? amountItem.Value : tx.amount;

//       // Always use MongoDB path (you are using Mongo)
//       const session = await mongoose.startSession();
//       session.startTransaction();
//       try {
//         await Transaction.updateOne(
//           { _id: tx._id },
//           { $set: { status: 'completed', meta: { ...tx.meta, mpesa: callback } } },
//           { session }
//         );

//         await User.updateOne(
//           { _id: tx.userId },
//           { $inc: { balance: amount } },
//           { session }
//         );

//         await session.commitTransaction();
//         console.log(`Deposit successful: +${amount} to user ${tx.userId}`);
//       } catch (err) {
//         await session.abortTransaction();
//         console.error('Failed to update balance/transaction', err);
//       } finally {
//         session.endSession();
//       }
//     } else {
//       // FAILED
//       tx.status = 'failed';
//       tx.meta = { ...tx.meta, mpesa: callback };
//       await tx.save();
//       console.log(`Deposit failed: ResultCode ${resultCode} for CheckoutRequestID ${checkoutId}`);
//     }
//   } catch (err) {
//     console.error('Error handling mpesa callback', err);
//   }
// });

// module.exports = router;












// was
// const express = require('express');
// const { Transaction } = require('../models/transaction.model');
// const { User } = require('../models/user.model');
// const mongoose = require('mongoose');

// const router = express.Router();

// // Daraja callback endpoint
// router.post('/callback', express.json({type: '*/*'}), async (req, res) => {
//   // Acknowledge quickly to Daraja
//   res.status(200).json({ result: 'success' });

//   try {
//     const body = req.body;
//     const callback = body.Body && body.Body.stkCallback ? body.Body.stkCallback : body;

//     const checkoutId = callback.CheckoutRequestID || 
//       (callback && callback.Body && callback.Body.stkCallback && callback.Body.stkCallback.CheckoutRequestID);

//     let resultCode = callback.ResultCode !== undefined 
//       ? callback.ResultCode 
//       : (callback.ResultCode || (callback.Result && callback.Result.ResultCode));

//     if (!checkoutId) {
//       console.warn('No CheckoutRequestID in callback', JSON.stringify(callback).slice(0, 200));
//       return;
//     }

//     const tx = await Transaction.findOne({ checkoutRequestId: checkoutId });
//     if (!tx) {
//       console.warn('Tx not found for', checkoutId);
//       return;
//     }

//     // === TEMPORARY FOR SANDBOX TESTING ONLY ===
//     // Force success in non-production to test balance update (sandbox often returns 1032)
//     if (process.env.NODE_ENV !== 'production') {
//       console.log('SANDBOX MODE: Forcing ResultCode = 0 for testing');
//       resultCode = 0;
//     }
//     // ===========================================

//     if (resultCode === 0) {
//       // SUCCESS - parse amount
//       const mpesaMeta = (callback.CallbackMetadata && callback.CallbackMetadata.Item) || 
//                         callback.CallbackMetadata || [];
//       const amountItem = Array.isArray(mpesaMeta) ? mpesaMeta.find(i => i.Name === 'Amount') : null;
//       const amount = amountItem ? amountItem.Value : tx.amount;

//       // Always use MongoDB path (you are using Mongo)
//       const session = await mongoose.startSession();
//       session.startTransaction();
//       try {
//         await Transaction.updateOne(
//           { _id: tx._id },
//           { $set: { status: 'completed', meta: { ...tx.meta, mpesa: callback } } },
//           { session }
//         );

//         await User.updateOne(
//           { _id: tx.userId },
//           { $inc: { balance: amount } },
//           { session }
//         );

//         await session.commitTransaction();
//         console.log(`Deposit successful: +${amount} to user ${tx.userId}`);
//       } catch (err) {
//         await session.abortTransaction();
//         console.error('Failed to update balance/transaction', err);
//       } finally {
//         session.endSession();
//       }
//     } else {
//       // FAILED
//       tx.status = 'failed';
//       tx.meta = { ...tx.meta, mpesa: callback };
//       await tx.save();
//       console.log(`Deposit failed: ResultCode ${resultCode} for CheckoutRequestID ${checkoutId}`);
//     }
//   } catch (err) {
//     console.error('Error handling mpesa callback', err);
//   }
// });

// module.exports = router;













const express = require('express');
const { Transaction } = require('../models/transaction.model');
const mongoose = require('mongoose');

const router = express.Router();

// Daraja callback endpoint
router.post('/callback', express.json({ type: '*/*' }), async (req, res) => {
  // Acknowledge quickly to Daraja
  res.status(200).json({ result: 'success' });

  try {
    const body = req.body;
    const callback = body.Body && body.Body.stkCallback ? body.Body.stkCallback : body;

    const checkoutId = callback.CheckoutRequestID ||
      (callback && callback.Body && callback.Body.stkCallback && callback.Body.stkCallback.CheckoutRequestID);

    let resultCode = callback.ResultCode !== undefined
      ? callback.ResultCode
      : (callback.ResultCode || (callback.Result && callback.Result.ResultCode));

    if (!checkoutId) {
      console.warn('No CheckoutRequestID in callback', JSON.stringify(callback).slice(0, 200));
      return;
    }

    const tx = await Transaction.findOne({ checkoutRequestId: checkoutId });
    if (!tx) {
      console.warn('Transaction not found for', checkoutId);
      return;
    }

    // === SANDBOX TESTING ONLY ===
    if (process.env.NODE_ENV !== 'production') {
      console.log('SANDBOX MODE: Forcing ResultCode = 0 for testing');
      resultCode = 0;
    }
    // ===========================

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      if (resultCode === 0) {
        // SUCCESS - parse amount
        const mpesaMeta = (callback.CallbackMetadata && callback.CallbackMetadata.Item) ||
          callback.CallbackMetadata || [];
        const amountItem = Array.isArray(mpesaMeta) ? mpesaMeta.find(i => i.Name === 'Amount') : null;
        const amount = amountItem ? amountItem.Value : tx.amount;

        await Transaction.updateOne(
          { _id: tx._id },
          { $set: { status: 'completed', meta: { ...tx.meta, mpesa: callback, amount } } },
          { session }
        );

        await session.commitTransaction();
        console.log(`Transaction completed: +${amount} recorded for CheckoutRequestID ${checkoutId}`);
      } else {
        // FAILED
        await Transaction.updateOne(
          { _id: tx._id },
          { $set: { status: 'failed', meta: { ...tx.meta, mpesa: callback } } },
          { session }
        );

        console.log(`Transaction failed: ResultCode ${resultCode} for CheckoutRequestID ${checkoutId}`);
        await session.commitTransaction();
      }
    } catch (err) {
      await session.abortTransaction();
      console.error('Failed to update transaction', err);
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('Error handling Mpesa callback', err);
  }
});

module.exports = router;
