// // transaction.model.js
// const mongoose = require('mongoose');

// const txSchema = new mongoose.Schema({
//   userId: { type: mongoose.Types.ObjectId, required: true, index: true },
//   type: { type: String, enum: ['deposit','withdraw','bet','win'], required: true },
//   amount: { type: Number, required: true },
//   status: { type: String, enum: ['pending','completed','failed'], default: 'pending' },
//   checkoutRequestId: String,
//   meta: { type: Object },
//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = { Transaction: mongoose.model('Transaction', txSchema) };




// was
// import mongoose from 'mongoose';

// const transactionSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: false, // null for house / treasury
//   },

//   account: {
//     type: String,
//     enum: ['PLAYER', 'HOUSE', 'TREASURY'],
//     required: true,
//   },

//   type: {
//     type: String,
//     enum: ['DEBIT', 'CREDIT'],
//     required: true,
//   },

//   amount: {
//     type: Number,
//     required: true,
//   },

//   reason: {
//     type: String,
//     enum: ['BET', 'WIN', 'DEPOSIT', 'WITHDRAW'],
//     required: true,
//   },

//   roundId: {
//     type: String,
//   },

//   balanceAfter: {
//     type: Number,
//     required: true,
//   },
// }, { timestamps: true });

// export default mongoose.model('Transaction', transactionSchema);





import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['deposit', 'withdrawal'],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      required: true,
    },

    checkoutRequestId: {
      type: String, // Mpesa STK push reference
      required: false,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed, // optional metadata (phone, Mpesa callback, etc.)
      default: {},
    },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
