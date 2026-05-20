// // transaction.service.js
// // small helper for transaction creation (can be expanded)
// const { Transaction } = require('../models/transaction.model');

// async function createTransaction({ userId, type, amount, meta }) {
//   return Transaction.create({ userId, type, amount, status: 'pending', meta });
// }

// module.exports = { createTransaction };




// // was working 
// const mongoose = require('mongoose');
// const { Transaction } = require('../models/transaction.model');
// const { User } = require('../models/user.model');

// async function creditUser(userId, amount, type, meta = {}) {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const user = await User.findById(userId).session(session);
//     if (!user) throw new Error('User not found');

//     user.balance += amount;
//     await user.save({ session });

//     const tx = await Transaction.create(
//       [{
//         userId,
//         type,
//         amount,
//         status: 'completed',
//         meta,
//       }],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();

//     return tx[0];
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     throw err;
//   }
// }

// async function debitUser(userId, amount, type, meta = {}) {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const user = await User.findById(userId).session(session);
//     if (!user) throw new Error('User not found');
//     if (user.balance < amount) throw new Error('Insufficient balance');

//     user.balance -= amount;
//     await user.save({ session });

//     const tx = await Transaction.create(
//       [{
//         userId,
//         type,
//         amount,
//         status: 'completed',
//         meta,
//       }],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();

//     return tx[0];
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     throw err;
//   }
// }

// module.exports = {
//   creditUser,
//   debitUser,
// };



// // was working 
// // src/services/transaction.service.js
// const mongoose = require('mongoose');
// const { User } = require('../models/user.model');
// const { Transaction } = require('../models/transaction.model');

// async function debit(userId, amount, type, ref) {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const user = await User.findOneAndUpdate(
//       { _id: userId, balance: { $gte: amount } },
//       { $inc: { balance: -amount } },
//       { new: true, session }
//     );

//     if (!user) throw new Error('INSUFFICIENT_FUNDS');

//     await Transaction.create(
//       [{
//         userId,
//         type,
//         amount: -amount,
//         status: 'completed',
//         meta: { ref },
//       }],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();
//     return user.balance;
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     throw err;
//   }
// }

// async function credit(userId, amount, type, ref) {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const user = await User.findByIdAndUpdate(
//       userId,
//       { $inc: { balance: amount } },
//       { new: true, session }
//     );

//     await Transaction.create(
//       [{
//         userId,
//         type,
//         amount,
//         status: 'completed',
//         meta: { ref },
//       }],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();
//     return user.balance;
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     throw err;
//   }
// }

// module.exports = { debit, credit };






// was
// import User from '../models/user.model.js';
// import Transaction from '../models/transaction.model.js';
// import System from '../models/system.model.js';

// async function getSystem() {
//   let system = await System.findOne();
//   if (!system) system = await System.create({});
//   return system;
// }

// export async function placeBet(userId, amount, roundId) {
//   const user = await User.findById(userId);
//   if (user.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

//   const system = await getSystem();

//   // Player loses money
//   user.balance -= amount;
//   await user.save();

//   // House gains money
//   system.houseBalance += amount;
//   await system.save();

//   await Transaction.create({
//     userId,
//     account: 'PLAYER',
//     type: 'DEBIT',
//     amount,
//     reason: 'BET',
//     roundId,
//     balanceAfter: user.balance,
//   });

//   await Transaction.create({
//     account: 'HOUSE',
//     type: 'CREDIT',
//     amount,
//     reason: 'BET',
//     roundId,
//     balanceAfter: system.houseBalance,
//   });

//   return user.balance;
// }

// export async function cashout(userId, payout, roundId) {
//   const user = await User.findById(userId);
//   const system = await getSystem();

//   if (system.houseBalance < payout)
//     throw new Error('HOUSE_INSUFFICIENT');

//   // House pays
//   system.houseBalance -= payout;
//   await system.save();

//   // Player wins
//   user.balance += payout;
//   await user.save();

//   await Transaction.create({
//     userId,
//     account: 'PLAYER',
//     type: 'CREDIT',
//     amount: payout,
//     reason: 'WIN',
//     roundId,
//     balanceAfter: user.balance,
//   });

//   await Transaction.create({
//     account: 'HOUSE',
//     type: 'DEBIT',
//     amount: payout,
//     reason: 'WIN',
//     roundId,
//     balanceAfter: system.houseBalance,
//   });

//   return user.balance;
// }












import Transaction from '../models/transaction.model.js';

/**
 * Create a new transaction
 * @param {Object} params
 * @param {string} params.type - 'deposit', 'withdrawal', etc.
 * @param {number} params.amount
 * @param {string} params.status - 'pending', 'completed', 'failed'
 * @param {Object} params.meta - optional metadata
 * @returns {Transaction}
 */
export async function createTransaction({ type, amount, status = 'pending', meta = {} }) {
  const tx = await Transaction.create({
    type,
    amount,
    status,
    meta,
  });
  return tx;
}

/**
 * Fetch recent transactions
 * @param {number} limit - number of transactions to fetch
 * @returns {Transaction[]}
 */
export async function getTransactions(limit = 50) {
  return Transaction.find()
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Update transaction status and metadata
 * @param {string} txId
 * @param {string} status - 'completed' | 'failed'
 * @param {Object} meta - additional metadata to merge
 * @returns {Transaction}
 */
export async function updateTransaction(txId, status, meta = {}) {
  const tx = await Transaction.findById(txId);
  if (!tx) throw new Error('Transaction not found');

  tx.status = status;
  tx.meta = { ...tx.meta, ...meta };
  await tx.save();
  return tx;
}

/**
 * Get sum of completed deposits
 * @returns {number}
 */
export async function getBalance() {
  const result = await Transaction.aggregate([
    { $match: { status: 'completed', type: 'deposit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result.length ? result[0].total : 0;
}
