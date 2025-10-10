// ============================================================
// GENIUS TALK - SERVEUR EXPRESS + WEBSOCKET 
// ============================================================

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// === Chaque utilisateur peut avoir plusieurs connexions ===
// Exemple : { "0600000000": Set<WebSocket> }
const clients = {};

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// === Routes HTTP simples ===
app.get("/", (_, res) => res.send("🌐 Serveur Genius Talk opérationnel !"));
app.get("/users", (_, res) => {
  const online = Object.entries(clients).map(([phone, sockets]) => ({
    phone,
    connections: sockets.size,
  }));
  res.json({ connectedUsers: online });
});

// === Gestion WebSocket ===
wss.on("connection", (ws) => {
  console.log("🟢 Nouvelle connexion WebSocket");
  let currentPhone = null;
  ws.isAlive = true;

  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // === Enregistrement d’un utilisateur ===
      if (data.type === "register") {
        if (!data.phone) {
          ws.send(JSON.stringify({ type: "error", text: "Numéro requis." }));
          return;
        }

        if (!clients[data.phone]) clients[data.phone] = new Set();
        clients[data.phone].add(ws);
        currentPhone = data.phone;

        console.log(`✅ ${currentPhone} connecté (${clients[currentPhone].size} sockets actives)`);
        ws.send(
          JSON.stringify({
            type: "info",
            text: `Inscription réussie (${currentPhone})`,
          })
        );
        return;
      }

      // === Envoi d’un message ===
      if (data.type === "message") {
        const { from, to, text } = data;
        if (!from || !to || !text) {
          ws.send(JSON.stringify({ type: "error", text: "Champs manquants." }));
          return;
        }

        const recipients = clients[to];
        if (!recipients || recipients.size === 0) {
          ws.send(JSON.stringify({ type: "error", text: `${to} hors ligne.` }));
          return;
        }

        // Envoi à toutes les connexions du destinataire
        for (const recipient of recipients) {
          if (recipient.readyState === ws.OPEN) {
            recipient.send(JSON.stringify({ type: "message", from, text }));
          }
        }

        // Confirmation pour l’expéditeur
        ws.send(JSON.stringify({ type: "reply", text: `Message envoyé à ${to}` }));
        console.log(`📤 ${from} → ${to} : ${text}`);
        return;
      }

      // === Type inconnu ===
      ws.send(JSON.stringify({ type: "error", text: "Type de message inconnu." }));
    } catch (err) {
      console.error("⚠️ Erreur de parsing JSON :", err.message);
      ws.send(JSON.stringify({ type: "error", text: "Format JSON invalide." }));
    }
  });

  // === Déconnexion ===
  ws.on("close", () => {
    if (currentPhone && clients[currentPhone]) {
      clients[currentPhone].delete(ws);
      if (clients[currentPhone].size === 0) delete clients[currentPhone];
      console.log(`🔴 ${currentPhone} déconnecté (${clients[currentPhone]?.size || 0} restantes)`);
    }
  });
});

// === Vérification périodique de l’état des connexions ===
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// === Configuration keep-alive pour Render ===
server.keepAliveTimeout = 120000; // 2 minutes
server.headersTimeout = 125000;

// === Démarrage du serveur ===
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Serveur Genius Talk prêt sur le port ${PORT}`));
