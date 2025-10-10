// ============================================================
// GENIUS TALK - SERVEUR EXPRESS + WEBSOCKET + FCM
// ============================================================

import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import admin from "firebase-admin";
import fs from "fs";

// --- Initialisation Firebase ---
const serviceAccount = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// --- Initialisation serveur Express ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Liste des clients connectés ---
const clients = {}; // { phone: { ws, fcmToken } }

// --- Connexion WebSocket ---
wss.on("connection", (ws) => {
  console.log("🟢 Nouvelle connexion WebSocket");
  let currentPhone = null;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      console.log("📩 Reçu :", data);

      // --- Enregistrement utilisateur ---
      if (data.type === "register") {
        if (!data.phone) {
          ws.send(JSON.stringify({ type: "error", text: "Numéro requis" }));
          return;
        }

        currentPhone = data.phone;
        clients[currentPhone] = { ws, fcmToken: null };
        ws.phone = currentPhone;

        console.log(`✅ Utilisateur enregistré : ${currentPhone}`);
        ws.send(JSON.stringify({ type: "info", text: `Inscription réussie pour ${currentPhone}` }));
        return;
      }

      // --- Enregistrement du token FCM ---
      if (data.type === "fcm_register") {
        const { phone, token } = data;
        if (!phone || !token) {
          ws.send(JSON.stringify({ type: "error", text: "FCM token manquant" }));
          return;
        }

        if (!clients[phone]) clients[phone] = { ws, fcmToken: token };
        else clients[phone].fcmToken = token;

        console.log(`🔐 Token FCM enregistré pour ${phone}`);
        ws.send(JSON.stringify({ type: "info", text: "Token FCM enregistré avec succès" }));
        return;
      }

      // --- Envoi de message à un utilisateur ---
      if (data.type === "message") {
        const { from, to, text } = data;
        if (!from || !to || !text) {
          ws.send(JSON.stringify({ type: "error", text: "Champs manquants" }));
          return;
        }

        const recipient = clients[to]?.ws;

        if (recipient && recipient.readyState === ws.OPEN) {
          recipient.send(JSON.stringify({ type: "message", from, text }));
          ws.send(JSON.stringify({ type: "reply", text: `Message envoyé à ${to}` }));
        } else {
          // 🔔 Envoyer via FCM si déconnecté
          const fcmToken = clients[to]?.fcmToken;
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
              console.error("❌ Erreur envoi FCM :", err);
              ws.send(JSON.stringify({ type: "error", text: "Échec envoi FCM" }));
            }
          } else {
            ws.send(JSON.stringify({
              type: "error",
              text: `Destinataire ${to} non en ligne et sans token FCM.`,
            }));
          }
        }
        return;
      }

      // --- Si le type n’est pas reconnu ---
      ws.send(JSON.stringify({ type: "error", text: "Type de message inconnu." }));
    } catch (err) {
      console.error("⚠️ Erreur de traitement :", err);
      ws.send(JSON.stringify({ type: "error", text: "Format JSON invalide." }));
    }
  });

  // --- Déconnexion ---
  ws.on("close", () => {
    if (currentPhone && clients[currentPhone]) {
      delete clients[currentPhone];
      console.log(`🔴 Déconnexion : ${currentPhone}`);
    } else {
      console.log("🔴 Connexion WebSocket fermée (non enregistrée)");
    }
  });
});

// --- Route test ---
app.get("/", (req, res) => res.send("🌐 Serveur Genius Talk actif et en ligne !"));

// --- Lancement serveur ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🌐 Serveur Genius Talk en écoute sur le port ${PORT}`));
