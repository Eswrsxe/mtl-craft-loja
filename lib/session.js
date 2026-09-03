// Sessão HttpOnly assinada com JWT (biblioteca "jose"). Usada pelos dois
// caminhos de login (Discord OAuth2 e Passkey/WebAuthn) para que, depois de
// autenticado, o resto do site funcione do mesmo jeito não importa por onde
// o usuário entrou.
const { SignJWT, jwtVerify } = require("jose");

const COOKIE_NAME = "mtl_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET ausente ou fraco — defina uma string longa e aleatória no .env");
  }
  return new TextEncoder().encode(secret);
}

async function createSessionToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch (_) {
    return null;
  }
}

function serializeCookie(token) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie() {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "Max-Age=0", "SameSite=Lax"];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf("=");
        return [decodeURIComponent(p.slice(0, idx)), decodeURIComponent(p.slice(idx + 1))];
      })
  );
}

async function getSessionFromReq(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

async function setSessionCookie(res, userPayload) {
  const token = await createSessionToken(userPayload);
  res.setHeader("Set-Cookie", serializeCookie(token));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", clearCookie());
}

module.exports = {
  COOKIE_NAME,
  getSessionFromReq,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
};
