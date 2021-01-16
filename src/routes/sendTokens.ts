import { WsProvider, Keyring, ApiPromise } from '@polkadot/api';
import { cryptoWaitReady, checkAddress } from '@polkadot/util-crypto';
import express, { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';
import expressip from 'express-ip'
import Storage from '../storage'

import * as plasmDefinitions from '@plasm/types/interfaces/definitions';

const types = Object.values(plasmDefinitions).reduce((res, { types }): object => ({ ...res, ...types }), {});


const router = express.Router();
router.use(expressip().getIpInfoMiddleware);
config();
const storage = new Storage();

router.get('/', async (req: any, res: Response, next: NextFunction) => {
    const { address } = req.query;
    let { chain } = req.query;
    const sender = req.ipInfo.ip;
    const URL_TEST_NET = process.env.URL_TEST_NET || 'wss://rpc.rococo.plasmnet.io';
    const tokenDecimals = Number(process.env.TOKEN_DECIMALS) || 15;
    const amount = Number(process.env.TOKENS_TO_PAY_PER_REQUEST) || 10;
    const limit = Number(process.env.REQUEST_LIMIT) || 3;
    const mnemonic = process.env.FAUCET_ACCOUNT_MNEMONIC?.toString();
    const wsProvider = new WsProvider(URL_TEST_NET);
    const keyring = new Keyring({ type: 'sr25519' });

    let networkPrefix;
    chain = chain?.toString().toLowerCase();
    switch (chain) { // Reference: https://github.com/paritytech/substrate/blob/master/primitives/core/src/crypto.rs#L432-L461
        case 'polkadot':
            networkPrefix = 0;
            break;
        case 'kusama':
            networkPrefix = 2;
            break;
        case 'plasm':
            networkPrefix = 5;
            break;
        default:
            networkPrefix = -1;
            break;
    }
    // put checks here according to IP address and address requesting
    const allowed = await storage.isValid(sender, address, chain, limit);


    let tmpTokeInDecimals: string = '0';
    for (let x = 1; x < tokenDecimals; x++) { tmpTokeInDecimals += '0' } // ADDING 0'S FOR CONVERSION

    async function run() {
        const api = await ApiPromise.create({ provider: wsProvider, types: { ...types } });
        await cryptoWaitReady();
        const transferValue = amount.toString() + tmpTokeInDecimals
        let account;
        if (mnemonic) account = keyring.addFromUri(mnemonic);

        try {
            if (address && account) {
                let bal = await api.query.system.account(account.address)
                if (Number(bal.data.free) > 0) {
                    const txHash = await api.tx.balances
                        .transfer(address.toString(), transferValue)
                        .signAndSend(account);
                    await storage.saveData(sender, address, chain);
                    let bal = await api.query.system.account(account.address)
                    console.log(`Remaining balance in Faucet ${bal.data.free.toHuman()}`);
                    return txHash
                }
                else {
                    console.log(`Remaining balance in Faucet ${bal.data.free}`);
                    return -1;
                }
            }
        } catch (error) {
            res.json({ trxHash: String(error), msg: `Something went wrong.\n Try again later` });
        }
    }
    if (!allowed) {
        res.json({ trxHash: -1, msg: 'You have reached your limit for now.\n Please try again later' });
    } else {
        if (address && checkAddress(address.toString(), networkPrefix)[0]) {
            const hash = await run();
            if (hash === -1) {
                res.json({ trxHash: hash, msg: `Sorry the faucet ran out of test Plasm` });

            } else {
                res.json({ trxHash: hash, msg: `${amount} test Plasm transferred to ${address}` });
            }
        } else {
            res.json({ trxHash: -1, msg: 'Address not valid against the chain' })
        }
    }
});

export default router;

