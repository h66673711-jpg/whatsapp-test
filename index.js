const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

// Push notification to the other chat members when a message is created.
exports.notifyOnMessage = onDocumentCreated("chats/{chatId}/messages/{msgId}", async (event) => {
  const msg = event.data && event.data.data();
  if (!msg) return;
  const db = admin.firestore();
  const chat = await db.doc(`chats/${event.params.chatId}`).get();
  const members = (chat.data() && chat.data().members) || [];
  const others = members.filter((u) => u !== msg.senderId);
  const snaps = await Promise.all(others.map((u) => db.doc(`users/${u}`).get()));
  const tokens = snaps.map((s) => s.exists && s.data().fcmToken).filter(Boolean);
  if (!tokens.length) return;
  await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: msg.senderName || "HUCX", body: String(msg.text || (msg.imageUrl ? "📷 صورة" : "")).slice(0, 100) },
    android: { priority: "high", notification: { channelId: "messages" } },
    data: { chatId: event.params.chatId },
  });
});

// Anti-abuse: suspend an account once 5 different users have reported it.
exports.autoSuspend = onDocumentCreated("reports/{id}", async (event) => {
  const r = event.data && event.data.data();
  if (!r || !r.targetUid) return;
  const db = admin.firestore();
  const q = await db.collection("reports").where("targetUid", "==", r.targetUid).get();
  const reporters = new Set(q.docs.map((d) => d.data().reporterId));
  if (reporters.size >= 5) {
    await db.doc(`users/${r.targetUid}`).update({ status: "suspended" });
  }
});
