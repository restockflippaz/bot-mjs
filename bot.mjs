import dotenv from "dotenv";
import bs58 from "bs58";
import {
    Connection,
    Keypair,
    Transaction,
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";
import got from "got";
import {
    Wallet
} from "@project-serum/anchor";
import promiseRetry from "promise-retry";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    Token,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import chalk from 'chalk'

async function log_no_task(message, type) {
    var d = new Date(Date.now());
    var seconds = d.getSeconds();
    var minutes = d.getMinutes();
    var milliseconds = d.getMilliseconds();
    if (seconds / 10 < 1) {
        seconds = "0" + seconds;
    }
    if (minutes / 10 < 1) {
        minutes = "0" + minutes;
    }


    switch (type) {
        case "warn":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}]`) + chalk.yellowBright(` ${message}`));
            break;
        case "success":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}]`) + chalk.greenBright(` ${message}`));
            break;
        case "failure":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}]`) + chalk.redBright(` ${message}`));
            break;
        case "cyan":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}]`) + chalk.cyanBright(` ${message}`));
            break;
        case "white":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}]`) + chalk.whiteBright(` ${message}`));
            break;
    }
}

async function log(message, type, taskNumber) {
    var d = new Date(Date.now());
    var seconds = d.getSeconds();
    var minutes = d.getMinutes();
    var milliseconds = d.getMilliseconds();
    if (seconds / 10 < 1) {
        seconds = "0" + seconds;
    }
    if (minutes / 10 < 1) {
        minutes = "0" + minutes;
    }


    switch (type) {
        case "warn":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}] [Task ${taskNumber}]`) + chalk.yellowBright(` ${message}`));
            break;
        case "success":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}] [Task ${taskNumber}]`) + chalk.greenBright(` ${message}`));
            break;
        case "failure":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}] [Task ${taskNumber}]`) + chalk.redBright(` ${message}`));
            break;
        case "cyan":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}] [Task ${taskNumber}]`) + chalk.cyanBright(` ${message}`));
            break;
        case "white":
            console.log(chalk.blueBright(`[${d.getHours()}:${minutes}:${seconds}:${makeTwoDigits(milliseconds)}] [Task ${taskNumber}]`) + chalk.whiteBright(` ${message}`));
            break;
    }
}

function makeTwoDigits(number) {
    if (number.length === 1) {
        let finalString = number.toString()
        finalString = '0' + finalString;
        return parseInt(finalString)
    }
    if (number.length !== 2) {
        let finalString = number.toString()
        finalString = finalString.substring(0, 2)
        return parseInt(finalString)
    }
}
async function main(TASK_NUMBER) {
    log_no_task('Welcome User', 'cyan')
    dotenv.config();

    const connection = new Connection("http://genesysnode1.nodemonkey.io:8899/");
    const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || "")));
    let token_list = ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']

    const TOKEN = token_list[Math.floor(token_list.length * Math.random())];


    const getCoinQuote = (inputMint, outputMint, amount) => got.get(`https://quote-api.jup.ag/v1/quote?outputMint=${outputMint}&inputMint=${inputMint}&amount=${amount}&slippage=0.1`).json();
    const getTransaction = (route) => {return got.post("https://quote-api.jup.ag/v1/swap", {json: {route: route,userPublicKey: wallet.publicKey.toString(),wrapUnwrapSOL: false,},}).json();};

    const getConfirmTransaction = async (txid) => {const res = await promiseRetry(async (retry, attempt) => {let txResult = await connection.getTransaction(txid, {commitment: "confirmed",});if (!txResult) {const error = new Error("Transaction was not confirmed");error.txid = txid;retry(error);return;}return txResult;},{retries: 40,minTimeout: 500,maxTimeout: 1000,});if (res.meta.err) {throw new Error("Transaction failed");}return txid;};

    const initial = 50_000_000;
    while (true) {
        // 0.1 SOL
        log('Monitoring', 'cyan', TASK_NUMBER + '[' + TOKEN + ']')
        const usdcToSol = await getCoinQuote(TOKEN, TOKEN, initial);
        const solToUsdc = await getCoinQuote(
            TOKEN,
            TOKEN,
            usdcToSol.data[0].outAmount
        );
        // when outAmount more than initial
        if (solToUsdc.data[0].outAmountWithSlippage > initial) {
            log('Successfully found listing!', 'success', TASK_NUMBER + '[' + TOKEN + ']')
            await Promise.all(
                [usdcToSol.data[0], solToUsdc.data[0]].map(async (route) => {
                    const {
                        setupTransaction,
                        swapTransaction,
                        cleanupTransaction
                    } =
                    await getTransaction(route);

                    await Promise.all(
                        [setupTransaction, swapTransaction, cleanupTransaction]
                        .filter(Boolean)
                        .map(async (serializedTransaction) => {
                            // get transaction object from serialized transaction
                            const transaction = Transaction.from(
                                Buffer.from(serializedTransaction, "base64")
                            );
                            // perform the swap
                            // Transaction might failed or dropped
                            const txid = await connection.sendTransaction(
                                transaction,
                                [wallet.payer], {
                                    skipPreflight: true,
                                }
                            );
                            try {
                                await getConfirmTransaction(txid);
                                log(`Success: https://solscan.io/tx/${txid}`, 'success', TASK_NUMBER);
                            } catch (e) {
                                log(`Failed: https://solscan.io/tx/${txid}`, 'failure', TASK_NUMBER);
                            }
                        })
                    );
                })
            );
        }
    }
}
main(1)
main(2)
main(3)
main(4)
main(5)
main(6)
main(7)
main(8)
main(9)
main(10)
main(11)
main(12)
