module.exports = {
  SESSION_ID: process.env.SESSION_ID || "",
  PREFIX: process.env.PREFIX || ".",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "947XXXXXXXX",
  // Core Identity (STRICT)
  BOT_NAME: process.env.BOT_NAME || "👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑",
  // Optional: YouTube cookie (helps avoid 410/consent/region blocks)
  // Set this in your host environment variables if needed.
  YT_COOKIE: process.env.YT_COOKIE || ""
};
