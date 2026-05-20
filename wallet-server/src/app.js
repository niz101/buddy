// const express = require('express');
// const helmet = require('helmet');
// const cors = require('cors');
// const morgan = require('morgan');
// const rateLimit = require('./middleware/rateLimiter');
// const cookieParser = require('cookie-parser');
// const authRoutes = require('./controllers/auth.controller');
// const walletRoutes = require('./controllers/wallet.controller');
// const mpesaRoutes = require('./controllers/mpesa.controller');
// const { errorHandler } = require('./middleware/errorHandler');

// const app = express();

// app.use(helmet());
// app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
// app.use(express.json());
// app.use(cookieParser());
// app.use(morgan('tiny'));
// app.use(rateLimit);

// app.use('/api/auth', authRoutes);
// app.use('/api/wallet', walletRoutes);
// app.use('/api/mpesa', mpesaRoutes);

// app.use(errorHandler);

// module.exports = app;




// // was working 
// const express = require('express');
// const helmet = require('helmet');
// const cors = require('cors');
// const morgan = require('morgan');
// const rateLimit = require('./middleware/rateLimiter');
// const cookieParser = require('cookie-parser');

// const authRoutes = require('./controllers/auth.controller');
// const walletRoutes = require('./controllers/wallet.controller');
// const mpesaRoutes = require('./controllers/mpesa.controller');
// const { errorHandler } = require('./middleware/errorHandler');

// const app = express();

// // === CORS FIX: Exact origin + preflight handling ===
// app.use(
//   cors({
//     origin: 'http://localhost:3000',  // EXACT frontend URL - no env var, no wildcard
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//     credentials: true,
//   })
// );

// // Explicitly handle preflight OPTIONS requests for all routes
// app.options('*', cors());

// // === Other middlewares ===
// app.use(helmet());
// app.use(express.json());
// app.use(cookieParser());
// app.use(morgan('tiny'));
// app.use(rateLimit);

// // === Routes ===
// app.use('/api/auth', authRoutes);
// app.use('/api/wallet', walletRoutes);
// app.use('/api/mpesa', mpesaRoutes);

// // === Error handler ===
// app.use(errorHandler);

// module.exports = app;






// was
// const gameRoutes = require('./game/game.routes');
// const express = require('express');
// const helmet = require('helmet');
// const cors = require('cors');
// const morgan = require('morgan');
// const rateLimit = require('./middleware/rateLimiter');
// const cookieParser = require('cookie-parser');

// const authRoutes = require('./controllers/auth.controller');
// const walletRoutes = require('./controllers/wallet.controller');
// const mpesaRoutes = require('./controllers/mpesa.controller');
// // const gameRoutes = require('./game/game.routes'); // ✅ ADDED
// const { errorHandler } = require('./middleware/errorHandler');

// const app = express();

// // === CORS FIX: Exact origin + preflight handling ===
// app.use(
//   cors({
//     origin: 'http://localhost:3000', // EXACT frontend URL
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//     credentials: true,
//   })
// );

// // Explicitly handle preflight OPTIONS requests for all routes
// app.options('*', cors());

// // === Other middlewares ===
// app.use(helmet());
// app.use(express.json());
// app.use(cookieParser());
// app.use(morgan('tiny'));
// app.use(rateLimit);

// // === Routes ===
// app.use('/api/auth', authRoutes);
// app.use('/api/wallet', walletRoutes);
// app.use('/api/mpesa', mpesaRoutes);
// app.use('/api/game', gameRoutes); // ✅ ADDED

// // === Error handler ===
// app.use(errorHandler);

// module.exports = app;











// const express = require('express');
// const helmet = require('helmet');
// const cors = require('cors');
// const morgan = require('morgan');

// const walletRoutes = require('./controllers/wallet.controller');
// const mpesaRoutes = require('./controllers/mpesa.controller');
// const { errorHandler } = require('./middleware/errorHandler');

// const app = express();

// // === CORS FIX: Exact origin + preflight handling ===
// app.use(
//   cors({
//     origin: 'http://localhost:3000', // EXACT frontend URL
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//     credentials: true,
//   })
// );

// // Explicitly handle preflight OPTIONS requests for all routes
// app.options('*', cors());

// // === Other middlewares ===
// app.use(helmet());
// app.use(express.json());
// app.use(cookieParser());
// app.use(morgan('tiny'));
// app.use(rateLimit);

// // === Routes ===
// // Only wallet + M-Pesa routes for standalone service
// app.use('/api/wallet', walletRoutes);
// app.use('/api/mpesa', mpesaRoutes);

// // === Error handler ===
// app.use(errorHandler);

// module.exports = app;











const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const walletRoutes = require('./controllers/wallet.controller');
const mpesaRoutes = require('./controllers/mpesa.controller');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// === CORS FIX: Exact origin + preflight handling ===
app.use(
  cors({
    origin: 'http://localhost:8080', // EXACT frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Explicitly handle preflight OPTIONS requests for all routes
app.options('*', cors());

// === Other middlewares ===
app.use(helmet());
app.use(express.json());
app.use(morgan('tiny')); // logging

// === Routes ===
// Only wallet + M-Pesa routes for standalone service
app.use('/api/wallet', walletRoutes);
app.use('/api/mpesa', mpesaRoutes);

// === Error handler ===
app.use(errorHandler);

module.exports = app;
