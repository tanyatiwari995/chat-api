// Load environment variables
import dotenv from "dotenv";
dotenv.config();

// Core dependencies
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import connectMongoDBSession from "connect-mongodb-session";
import passport from "passport";

// Apollo GraphQL
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { buildContext } from "graphql-passport";

// Real-time Socket.IO
import { Server } from "socket.io";

// Database
import connectToMongoDB from "./db/mongo.db.js";

// Auth & middleware
import { configurePassport } from "./passport/passport.config.js";
import authMiddleware from "./middleware/auth.js";

// REST API routes
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import messageRoutes from "./routes/message.js";
import typingRoutes from "./routes/typing.js";
import groupRoutes from "./routes/group.js";
import transactionRoutes from "./routes/transaction.routes.js";
import { notificationRoutes } from "./routes/notification.js";

// Socket handler
import socketHandler from "./socket/socket.js";

// GraphQL typeDefs & resolvers
import mergedTypeDefs from "./typeDefs/index.js";
import mergedResolvers from "./resolvers/index.js";

// Main async start function
async function startServer() {
  const PORT = process.env.PORT || 3010;
  const MONGO_URI = "mongodb+srv://getrjtanyatiwari:tanyatiwari04042004@cluster0.k7pjt.mongodb.net/chat-api?retryWrites=true&w=majority";
  const SESSION_SECRET = "mySuperSecretSessionKey123";

  // Connect to MongoDB
  const connectionState = await connectToMongoDB(MONGO_URI);

  if (connectionState !== 1) process.exit(1);

  const app = express();
  const httpServer = http.createServer(app);

  // Session store setup
  const MongoDBStore = connectMongoDBSession(session);
  const store = new MongoDBStore({ uri: MONGO_URI, collection: "sessions" });
  store.on("error", console.error);

  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : "*",
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : "*",
      credentials: true,
    },
  });
  socketHandler(io);

  // 1. Base/Home Route (यह नया रूट आपकी एरर को ठीक करेगा)
  app.get("/", (req, res) => {
    res.json({ 
      success: true, 
      message: "Welcome to Chat API! The server is running perfectly." 
    });
  });

  // Secure test route
  app.get("/secure", authMiddleware, (req, res) => {
    res.json({ message: "You are authenticated!", user: req.user });
  });

  // REST API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/typing", typingRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/transactions", transactionRoutes);

  // GraphQL setup
  const apolloServer = new ApolloServer({
    typeDefs: mergedTypeDefs,
    resolvers: mergedResolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  });
  await apolloServer.start();

  app.use(
    "/graphql",
    expressMiddleware(apolloServer, {
      context: async ({ req, res }) => buildContext({ req, res }),
    })
  );

  // Error handler
  app.use((err, req, res, next) => {
    console.error("Internal server error:", err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  });

  // 404 handler
  app.use((req, res) => {
    console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res
      .status(404)
      .json({ message: `Cannot ${req.method} ${req.originalUrl}` });
  });

  // Start server
  httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    httpServer.close(() => console.log("Server shut down gracefully"));
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
