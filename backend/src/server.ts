import "./config/env.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import exceptionRoutes from "./routes/exceptionRoutes.js";
import copilotRoutes from "./routes/copilotRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";

import { requireAuth } from "./middleware/auth.js";

const app = express();
const PORT = Number(process.env.PORT) || 5001;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// Public Auth & Health Routes
app.use("/api/auth", authRoutes);
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "InvoiceFlow backend is running 🚀",
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Protected Multi-Tenant Business Routes (Requires JWT Authentication)
app.use("/api/invoices", requireAuth, invoiceRoutes);
app.use("/api/purchase-orders", requireAuth, purchaseOrderRoutes);
app.use("/api/suppliers", requireAuth, supplierRoutes);
app.use("/api/payments", requireAuth, paymentRoutes);
app.use("/api/exceptions", requireAuth, exceptionRoutes);
app.use("/api/copilot", requireAuth, copilotRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/documents", documentRoutes);

// Start Server binding explicitly to 0.0.0.0 for Render production deployment
const startServer = async () => {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ InvoiceFlow backend running on port ${PORT} (0.0.0.0)`);
  });
};

startServer();