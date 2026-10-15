// Gera as chaves dos avisos (VAPID) para colocar nas variáveis de ambiente do Render.
// Rodar: node gerar-chaves.js
const webpush = require("web-push");
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("Copie estas duas variáveis para o Render (Environment):\n");
console.log("VAPID_PUBLIC=" + publicKey);
console.log("VAPID_PRIVATE=" + privateKey);
