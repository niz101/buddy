// require('dotenv').config();
// const mongoose = require('mongoose');
// const app = require('./app');

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

// async function start() {
//   try {
//     await mongoose.connect(MONGO, { });
//     console.log('Connected to MongoDB');
//     app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
//   } catch (err) {
//     console.error('Failed to start', err);
//     process.exit(1);
//   }
// }

// start();


// require('dotenv').config();

// const mongoose = require('mongoose');
// const cors = require('cors');           // ← Add this
// const app = require('./app');

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

// async function start() {
//   try {
//     // Enable CORS for your frontend[](http://localhost:3000)
//     app.use(
//       cors({
//         origin: 'http://localhost:3000',  // Your React frontend URL
//         credentials: true,                // Optional: allows cookies if you use them later
//       })
//     );

//     await mongoose.connect(MONGO, {});
//     console.log('Connected to MongoDB');

//     app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
//   } catch (err) {
//     console.error('Failed to start', err);
//     process.exit(1);
//   }
// }

// start();



// const express = require('express');
// const cors = require('cors');  // ← Add this line

// // ... other requires (routes, controllers, etc.)

// const app = express();

// // ← ADD THESE LINES HERE (very early, before routes)
// app.use(cors({
//   origin: 'http://localhost:3000',  // EXACT match your frontend
//   credentials: true
// }));

// app.use(express.json());
// // ... any other middlewares

// // ... your routes: app.use('/api/auth', authRouter); etc.

// module.exports = app;





// require('dotenv').config();

// const mongoose = require('mongoose');
// const cors = require('cors');                // ← Added
// const app = require('./app');

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

// async function start() {
//   try {
//     // Apply CORS to the imported app instance
//     app.use(
//       cors({
//         origin: 'http://localhost:3000',     // Your React frontend
//         credentials: true,                   // Allows cookies if needed later
//       })
//     );

//     // Optional: Log for confirmation
//     console.log('CORS enabled for http://localhost:3000');

//     await mongoose.connect(MONGO, {});
//     console.log('Connected to MongoDB');

//     app.listen(PORT, () => {
//       console.log(`Server listening on ${PORT}`);
//     });
//   } catch (err) {
//     console.error('Failed to start', err);
//     process.exit(1);
//   }
// }

// start();




// require('dotenv').config();

// const mongoose = require('mongoose');
// const cors = require('cors');
// const app = require('./app');

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

// async function start() {
//   try {
//     // CRITICAL: Apply CORS early on the imported app
//     app.use(
//       cors({
//         origin: 'http://localhost:3000',  // EXACT frontend URL - no trailing slash
//         methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//         allowedHeaders: ['Content-Type', 'Authorization'],
//         credentials: true
//       })
//     );

//     // Explicitly handle preflight OPTIONS for all routes
//     app.options('*', cors());

//     console.log('CORS fully enabled for http://localhost:3000');

//     await mongoose.connect(MONGO, {});
//     console.log('Connected to MongoDB');

//     app.listen(PORT, () => {
//       console.log(`Server listening on ${PORT}`);
//     });
//   } catch (err) {
//     console.error('Failed to start', err);
//     process.exit(1);
//   }
// }

// start();



// was
// require('dotenv').config();

// const mongoose = require('mongoose');
// const app = require('./app');

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

// async function start() {
//   try {
//     await mongoose.connect(MONGO, {});
//     console.log('Connected to MongoDB');

//     app.listen(PORT, () => {
//       console.log(`Server listening on ${PORT}`);
//       console.log(`Frontend allowed: http://localhost:3000`);
//     });
//   } catch (err) {
//     console.error('Failed to start', err);
//     process.exit(1);
//   }
// }

// start();










// wass working before an error 
// require('dotenv').config();

// const mongoose = require('mongoose');
// const app = require('./app');

// const PORT = process.env.PORT || 4000;
// const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

// async function start() {
//   try {
//     await mongoose.connect(MONGO, {});
//     console.log('Connected to MongoDB');

//     app.listen(PORT, () => {
//       console.log(`Server listening on ${PORT}`);
//       console.log(`Frontend allowed: http://localhost:8080`);
//     });
//   } catch (err) {
//     console.error('Failed to start', err);
//     process.exit(1);
//   }
// }

// start();









const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet';

async function start() {
  try {
    // Debug (remove later in production)
    console.log('ENV CHECK:');
    console.log('MPESA_KEY:', process.env.MPESA_CONSUMER_KEY ? 'LOADED' : 'MISSING');
    console.log('MPESA_SECRET:', process.env.MPESA_CONSUMER_SECRET ? 'LOADED' : 'MISSING');

    // MongoDB connection
    await mongoose.connect(MONGO);
    console.log('Connected to MongoDB');

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Frontend allowed: http://localhost:8080`);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();