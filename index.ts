import { LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import { ArbBot, SwapToken } from './bot';
import dotenv from "dotenv";
import bs58 from 'bs58'; // For decoding base58

dotenv.config({
    path: ".env",
});

const defaultConfig = {
    solanaEndpoint: clusterApiUrl("mainnet-beta"),
    jupiter: "https://public.jupiterapi.com",
};

async function main() {
    if (!process.env.SECRET_KEY) {
        throw new Error("SECRET_KEY environment variable not set");
    }
    // let decodedSecretKey = Uint8Array.from(JSON.parse(process.env.SECRET_KEY));
    
    let decodedSecretKey = bs58.decode(process.env.SECRET_KEY);
    // Convert it into a Uint8Array (if needed)
    // let secretKeyArray = new Uint8Array(decodedSecretKey);


    const bot = new ArbBot({
        solanaEndpoint: process.env.SOLANA_ENDPOINT ?? defaultConfig.solanaEndpoint,
        metisEndpoint: process.env.METIS_ENDPOINT ?? defaultConfig.jupiter,
        secretKey: decodedSecretKey,
        firstTradePrice: 0.1 * LAMPORTS_PER_SOL,
        targetGainPercentage: 0.15,
        initialInputToken: SwapToken.USDC,
        initialInputAmount: 10_000_000,
    });

    await bot.init();

}

main().catch(console.error);