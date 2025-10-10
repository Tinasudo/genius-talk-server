// ============================================================
// GENIUS TALK - SERVEUR EXPRESS + WEBSOCKET (Render Ready)
// ============================================================

import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

// --- Initialisation du serveur Express ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Liste des clients connectés (clé = numéro de téléphone) ---
const clients = {};

// --- Connexion WebSocket ---
wss.on("connection", (ws) => {
  console.log("🟢 Nouvelle connexion WebSocket");

  let currentPhone = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("📩 Reçu :", data);

      // Enregistrement utilisateur
      if (data.type === "register") {
        if (!data.phone) {
          ws.send(
            JSON.stringify({
              type: "error",
              text: "Le numéro de téléphone est requis pour l'inscription.",
            })
          );
          return;
        }

        currentPhone = data.phone;
        clients[currentPhone] = ws;
        ws.phone = currentPhone;

        console.log(`✅ Utilisateur enregistré : ${currentPhone}`);
        ws.send(
          JSON.stringify({
            type: "info",
            text: `Inscription réussie pour ${currentPhone}`,
          })
        );
        return;
      }

// Envoi de message à un destinataire spécifique
if (data.type === "message") {
  const { from, to, text } = data;

  if (!from || !to || !text) {
    ws.send(JSON.stringify({
      type: "error",
      text: "Champs manquants (from, to, text)",
    }));
    return;
  }

  const recipient = clients[to];

  if (recipient && recipient.readyState === ws.OPEN) {
    recipient.send(JSON.stringify({
      type: "message",
      from,
      text,
    }));
    ws.send(JSON.stringify({
      type: "reply",
      text: `✅ Message envoyé à ${to}`,
    }));
  } else {
    ws.send(JSON.stringify({
      type: "error",
      text: `⚠️ Destinataire ${to} non en ligne`,
    }));
  }
  return;
}


      // Message inconnu
      ws.send(
        JSON.stringify({
          type: "error",
          text: "Type de message inconnu.",
        })
      );
    } catch (err) {
      console.error("⚠️ Erreur de traitement :", err);
      ws.send(
        JSON.stringify({
          type: "error",
          text: "Format JSON invalide.",
        })
      );
    }
  });

  // Déconnexion
  ws.on("close", () => {
    if (currentPhone && clients[currentPhone]) {
      delete clients[currentPhone];
      console.log(`🔴 Déconnexion : ${currentPhone}`);
    } else {
      console.log("🔴 Connexion WebSocket fermée (non enregistrée)");
    }
  });
});

// --- Route simple pour test HTTP ---
app.get("/", (req, res) => {
  res.send("🌐 Serveur Genius Talk WebSocket actif et en ligne !");
});

// --- Lancement du serveur ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🌐 Serveur Genius Talk en écoute sur le port ${PORT}`);
});