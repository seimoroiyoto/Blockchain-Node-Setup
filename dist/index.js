"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bot_1 = require("./bot");
const dotenv_1 = __importDefault(require("dotenv"));
const bs58_1 = __importDefault(require("bs58")); // For decoding base58
dotenv_1.default.config({
  path: ".env",
});
const defaultConfig = {
  solanaEndpoint: (0, web3_js_1.clusterApiUrl)("mainnet-beta"),
  jupiter: "https://public.jupiterapi.com",
};
async function main() {
  if (!process.env.SECRET_KEY) {
    throw new Error("SECRET_KEY environment variable not set");
  }
  // let decodedSecretKey = Uint8Array.from(JSON.parse(process.env.SECRET_KEY));
  let decodedSecretKey = bs58_1.default.decode(process.env.SECRET_KEY);
  // Convert it into a Uint8Array (if needed)
  // let secretKeyArray = new Uint8Array(decodedSecretKey);
  const bot = new bot_1.ArbBot({
    solanaEndpoint: process.env.SOLANA_ENDPOINT ?? defaultConfig.solanaEndpoint,
    metisEndpoint: process.env.METIS_ENDPOINT ?? defaultConfig.jupiter,
    secretKey: decodedSecretKey,
    firstTradePrice: 0.1 * web3_js_1.LAMPORTS_PER_SOL,
    targetGainPercentage: 0.15,
    initialInputToken: bot_1.SwapToken.USDC,
    initialInputAmount: 10000000,
  });
  await bot.init();
}
main().catch(console.error);
//# sourceMappingURL=index.js.map
