/*
脚本头部require引用的第三方包，请自行去npm或官网下载，我会给每个包做简单注释
*/
const { stark, Provider: StarkProvider, RpcProvider: StarkRpcProvider, ec: starkEc, Account: StarkAccount, Contract: StarkContract, hash, typedData } = require("starknet"); // https://www.starknetjs.com/docs/API/ 官方
const { json2Obj, isEmpty, fs, fetch, sleep, wait } = require('../common/utils');//自己写的工具包，目前其中只引用了request、fs三方包

let rpc;
let week_ids;

//获取账号合约数据，这里需要调用中心化服务器接口，如担心IP问题，可以在调用fetch时设置代理
async function fetchCalldata(week_id, address) {
    let result;
    try {
        await wait(async () => {
            try {
                const { error, response, body } = await fetch(`https://cloud.argent-api.com/v1/moments/${week_id}/claim?recipientAddress=${address.toLowerCase()}`,
                    {
                        "method": "POST"
                    });
                result = json2Obj(body);
                return result !== null;
            } catch (error) {
                return false;
            }
        }, 120 * 1000, 1000);
    } catch (error) {
        console.log(`address: ${address}, 获取账号合约数据超时`);
        return null;
    }
    if (result.claimParameters) {
        const { contractAddress, tokenId, momentId, maxSupply, expiry } = result.claimParameters;
        const { r, s } = result.signature;

        return {
            contractAddress,
            "calldata": [
                BigInt(address).toString().replace('n', ''),
                new String(tokenId).toString(),
                new String(momentId).toString(),
                new String(maxSupply).toString(),
                new String(expiry).toString(),
                r,
                s
            ],
            "entrypoint": "mint"
        };
    } else if (result) {
        console.log(JSON.stringify(result, null, 2));
        return null;
    }
};

//claim NFT
async function claims({ address, privateKey, weekTask = {} }) {
    const provider = isEmpty(rpc) ?
        new StarkProvider({
            sequencer: {
                baseUrl: 'https://alpha-mainnet.starknet.io',
            }
        }).provider
        : new StarkRpcProvider({
            nodeUrl: rpc,
        });

    //获取钱包账号中奥德赛NFT的数量
    const abi = [
        {
            "name": "balanceOf",
            "type": "function",
            "inputs": [
                {
                    "name": "owner",
                    "type": "felt"
                }
            ],
            "outputs": [
                {
                    "name": "balance",
                    "type": "Uint256"
                }
            ],
            "stateMutability": "view"
        },
    ];
    let nfts_balance = 0;
    try {
        await wait(async () => {
            try {
                const contract = new StarkContract(abi, '0x07606cac9053e9b8b573a4b0a0ce608880f64869e24b8a605210d7a85bb6e5f1', provider);
                const ret = await contract.call('balanceOf', [address]);
                nfts_balance = parseInt(ret.balance);
                console.log(`address: ${address}, 已mint ${nfts_balance}个NFT`);
                return true;
            } catch (error) {
                return false;
            }
        }, 60 * 1000, 1000);
    } catch (error) {
        console.log(`address: ${address}, 获取mint数量超时`);
    }

    const starkAccount = new StarkAccount(provider, address, starkEc.getKeyPair(privateKey));

    for (let i = nfts_balance, len = week_ids.length; i < len; i++) {
        const week_id = week_ids[i];
        //跳过已经领过的NFT
        if (weekTask[week_id]) {
            console.log(`address: ${address}, 第${parseInt(i) + 1}周已领取! 交易hash:`, weekTask[week_id]);
            continue;
        }

        const calldata = await fetchCalldata(week_id, address);
        if (calldata === null) {
            console.log(`address: ${address}, 第${parseInt(i) + 1}周不满足条件!`);
            continue;
        }
        let tx_result;
        try {
            tx_result = await starkAccount.execute(
                calldata
            );
        } catch (error) {
            console.log(`address: ${address}, 第${parseInt(i) + 1}周领取异常!`, error.message);
            continue;
        }
        console.log(`address: ${address}, 第${parseInt(i) + 1}周领取成功! 交易hash:`, tx_result.transaction_hash);
        weekTask[week_id] = tx_result.transaction_hash;
        if (i < len - 1) {
            //这里等待N秒，再领下一个NFT
            await sleep(20 * 1000);//等待20秒，传值是毫秒，所以乘1000
        }
    }
    return weekTask;
};

//从这里开始
(async () => {
    //这里不设置rpc时则使用官方rpc，可能会有IP记录，可自行从alchemy或infura申请rpc
    rpc = '';

    //对应每周NFT领取的标识，数组中保留哪周的就对应只领这些周的，其他注释掉即可，默认只领第一周的
    week_ids = [
        '8cbc801c-7ef7-4815-8a5e-512b22a808e7',//第一周
    ];

    //待领取NFT的钱包账号，钱包账号格式见wallets.json中示例说明
    const wallets = json2Obj(fs.readFileSync(`${__dirname}/wallets.json`).toString());

    const claim_json_path = `${__dirname}/spok.json`;
    const claimObj = fs.existsSync(claim_json_path) ? JSON.parse(fs.readFileSync(claim_json_path).toString()) : {};
    for (let address in wallets) {
        const privateKey = wallets[address];
        const result_claims = await claims({ address, privateKey, weekTask: claimObj[address] });
        claimObj[address] = result_claims;
        fs.writeFileSync(claim_json_path, JSON.stringify(claimObj, null, 2));
        //这里可以等待N秒，再操作下一个账号
        await sleep(1 * 1000);//例如等待1秒，传值是毫秒，所以乘1000
    }
})();