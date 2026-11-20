import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const signingKey = process.env.OEM_RELEASE_SIGNING_KEY;
if (!signingKey) throw new Error("Configure the OEM_RELEASE_SIGNING_KEY repository secret.");
const key = createPrivateKey(signingKey);
if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 3072) {
  throw new Error("Use an RSA signing key with at least 3072 bits.");
}

const version = readFileSync("VERSION", "utf8").trim();
const sha256 = createHash("sha256").update(readFileSync("panel-oem.zip")).digest("hex");
const manifest = Buffer.from(JSON.stringify({ version, sha256 }));
const signature = sign("sha256", manifest, key);
writeFileSync("oem-release.json", JSON.stringify({
  manifest: manifest.toString("base64"),
  signature: signature.toString("base64"),
}));

const publicKey = createPublicKey(key).export({ type: "spki", format: "pem" }).trim();
const source = readFileSync("installer/setup.php", "utf8");
writeFileSync("setup.php", source.replace("__PANEL_RELEASE_PUBLIC_KEY__", publicKey).replace("__PANEL_MINIMUM_RELEASE__", version));
