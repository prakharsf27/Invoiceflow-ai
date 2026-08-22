import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import path from "path";

import { connectDB } from "./config/db.js";
import { UserModel } from "./models/User.js";

import authRoutes from "./routes/authRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import exceptionRoutes from "./routes/exceptionRoutes.js";
import copilotRoutes from "./routes/copilotRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";

import { requireAuth } from "./middleware/auth.js";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// Public Auth & Health Routes
app.use("/api/auth", authRoutes);
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "InvoiceFlow backend is running 🚀",
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

// const autoSeed = async () => {
//   try {
//     // Seed or verify Demo User Account for testing auth without dummy business data
//     const demoUser = await UserModel.findOne({ email: 'demo@invoiceflow.ai' });
//     if (!demoUser) {
//       const passwordHash = await bcrypt.hash('password123', 10);
//       await UserModel.create({
//         id: 'usr-demo-01',
//         name: 'Prakhar',
//         email: 'demo@invoiceflow.ai',
//         passwordHash,
//         role: 'finance_admin',
//         companyId: 'company-demo-01',
//         companyName: 'Acme Enterprises',
//         isActive: true,
//       });
//       console.log('✅ Demo user account ready: demo@invoiceflow.ai / password123');
//     }
//   } catch (err) {
//     console.error('❌ Error during startup seed:', err);
//   }
// };

// Start Server after DB Connection
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`⚡ InvoiceFlow backend running on http://localhost:${PORT}`);
  });
};

startServer();