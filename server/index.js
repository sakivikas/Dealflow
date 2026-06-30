import express from "express";
import cors from "cors";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import routes from "./routes.js";
import authRoutes from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use(authRoutes);
app.use(routes);

if (process.env.NODE_ENV === "production") {
  const distPath = join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.use((req, res) => res.sendFile(join(distPath, "index.html")));
}

const HOST = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`DealFlow server running on http://${HOST}:${PORT}`);
});
