// ============================================================
// GENIUS TALK - SERVEUR EXPRESS + WEBSOCKET + FCM
// ============================================================

import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import admin from "firebase-admin";
import fs from "fs";


// --- Initialisation Firebase via variable Render ---
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

if (serviceAccount.private_key.includes('\\n')) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// --- Initialisation du serveur Express ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Listes en mémoire ---
const clients = {}; // { phone: ws }
const tokens = {};  // { phone: fcmToken }

// --- Connexion WebSocket ---
wss.on("connection", (ws) => {
  console.log("🟢 Nouvelle connexion WebSocket");
  let currentPhone = null;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      console.log("📩 Reçu :", data);

      // 🔹 Enregistrement utilisateur
      if (data.type === "register") {
        if (!data.phone) {
          ws.send(JSON.stringify({ type: "error", text: "Le numéro de téléphone est requis." }));
          return;
        }

        currentPhone = data.phone;
        clients[currentPhone] = ws;
        ws.phone = currentPhone;

        console.log(`✅ Utilisateur enregistré : ${currentPhone}`);
        ws.send(JSON.stringify({ type: "info", text: `Inscription réussie pour ${currentPhone}` }));
        return;
      }

      // 🔹 Enregistrement du token FCM
      if (data.type === "fcm_register") {
        const { phone, token } = data;
        if (phone && token) {
          tokens[phone] = token;
          console.log(` Token FCM enregistré pour ${phone}`);
          ws.send(JSON.stringify({ type: "info", text: "Token FCM enregistré avec succès" }));
        } else {
          ws.send(JSON.stringify({ type: "error", text: "Champs manquants (phone, token)" }));
        }
        return;
      }

      // 🔹 Envoi de message à un destinataire spécifique
      if (data.type === "message") {
        const { from, to, text } = data;

        if (!from || !to || !text) {
          ws.send(JSON.stringify({ type: "error", text: "Champs manquants (from, to, text)" }));
          return;
        }

        const recipient = clients[to];

        if (recipient && recipient.readyState === ws.OPEN) {
          // Utilisateur connecté → envoi direct WebSocket
          recipient.send(JSON.stringify({ type: "message", from, text }));
          ws.send(JSON.stringify({ type: "reply", text: `Message envoyé à ${to}` }));
        } else {
          // Utilisateur déconnecté → envoi notification FCM
          const fcmToken = tokens[to];
          if (fcmToken) {
            const payload = {
              notification: {
                title: `Message de ${from}`,
                body: text,
              },
            };

            try {
              await admin.messaging().sendToDevice(fcmToken, payload);
              console.log(`✅ Notification FCM envoyée à ${to}`);
              ws.send(JSON.stringify({ type: "reply", text: `Notification envoyée à ${to}` }));
            } catch (err) {
              console.error("❌ Erreur lors de l’envoi FCM :", err);
              ws.send(JSON.stringify({ type: "error", text: "Échec d’envoi FCM" }));
            }
          } else {
            ws.send(JSON.stringify({
              type: "error",
              text: `⚠️ ${to} est hors ligne et sans token FCM.`,
            }));
          }
        }
        return;
      }

      // 🔹 Type de message inconnu
      ws.send(JSON.stringify({ type: "error", text: "Type de message inconnu." }));

    } catch (err) {
      console.error("⚠️ Erreur de traitement :", err);
      ws.send(JSON.stringify({ type: "error", text: "Format JSON invalide." }));
    }
  });

  // 🔹 Déconnexion
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
