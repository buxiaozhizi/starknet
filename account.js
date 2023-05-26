/*
脚本头部require引用的第三方包，请自行去npm或官网下载，我会给每个包做简单注释
*/
const { ethers, BigNumber, utils } = require("ethers"); //https://docs.ethers.org/v5/ 官方
const { constants, ec, stark, hash, number, getChecksumAddress } = require("starknet"); // https://www.starknetjs.com/docs/API/ 官方

function hashKeyWithIndex(key, index) {
    const payload = utils.concat([utils.arrayify(key), utils.arrayify(index)])
    const hash = utils.sha256(payload)
    return number.toBN(hash)
}

function grindKey(keySeed) {
    const keyValueLimit = ec.ec.n
    if (!keyValueLimit) {
        return keySeed
    }
    const sha256EcMaxDigest = number.toBN(
        "1 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000",
        16,
    )
    const maxAllowedVal = sha256EcMaxDigest.sub(
        sha256EcMaxDigest.mod(keyValueLimit),
    )

    // Make sure the produced key is devided by the Stark EC order,
    // and falls within the range [0, maxAllowedVal).
    let i = 0
    let key
    do {
        key = hashKeyWithIndex(keySeed, i)
        i++
    } while (!key.lt(maxAllowedVal))

    return "0x" + key.umod(keyValueLimit).toString("hex")
}

function getPathForIndex(
    index,
    baseDerivationPath,
) {
    return `${baseDerivationPath}/${index}`
}

function getIndexForPath(path, baseDerivationPath) {
    if (!path.startsWith(baseDerivationPath)) {
        throw "path should begin with baseDerivationPath"
    }
    const index = path.substring(path.lastIndexOf("/") + 1)
    return parseInt(index)
}

function getStarkPair(mnemonic, accountIndex) {
    const baseDerivationPath = "m/44'/9004'/0'/0";
    const secret = ethers.Wallet.fromMnemonic(mnemonic).privateKey;
    const masterNode = utils.HDNode.fromSeed(BigNumber.from(secret).toHexString());
    const path = getPathForIndex(accountIndex, baseDerivationPath ?? "");
    const childNode = masterNode.derivePath(path);
    const groundKey = grindKey(childNode.privateKey);
    const starkPair = ec.getKeyPair(groundKey);
    return { starkPair, groundKey };
};

function getArgentX(mnemonic, accountIndex) {
    //new Argent X account v0.2.3 :
    const argentXproxyClassHash = "0x25ec026985a3bf9d0cc1fe17326b245dfdc3ff89b8fde106542a3ea56c5a918";
    const argentXaccountClassHash = "0x033434ad846cdd5f23eb73ff09fe6fddd568284a0fb7d1be20ee482f044dabe2";

    const { starkPair, groundKey } = getStarkPair(mnemonic, accountIndex);
    const starkKeyPubAX = ec.getStarkKey(starkPair);
    const AXproxyConstructorCallData = stark.compileCalldata({
        implementation: argentXaccountClassHash,
        selector: hash.getSelectorFromName("initialize"),
        calldata: stark.compileCalldata({ signer: starkKeyPubAX, guardian: "0" }),
    });
    const AXcontractAddress = hash.calculateContractAddressFromHash(
        starkKeyPubAX,
        argentXproxyClassHash,
        AXproxyConstructorCallData,
        0
    );
    return { address: getChecksumAddress(AXcontractAddress), privateKey: groundKey };
};

function doEIP2645Hashing(key0) {
    for (var N = BigInt(2) ** BigInt(256), starkCurveOrder = BigInt(`0x${constants.EC_ORDER}`), N_minus_n = N - N % starkCurveOrder, i = 0; ; i++) {
        var x = utils.concat([key0, utils.arrayify(i)])
            , key = BigInt(utils.hexlify((0,
                utils.sha256)(x)));
        if (key < N_minus_n)
            return `0x${(key % starkCurveOrder).toString(16)}`
    }
}

function getBraavosGroundKey(mnemonic, accountIndex) {
    const coin_id = "9004";
    const seed = utils.mnemonicToSeed(mnemonic);
    let hdnode = utils.HDNode.fromSeed(seed)
    hdnode = hdnode.derivePath(`m/44'/${coin_id}'/0'/0/${accountIndex}`)
    const groundKey = doEIP2645Hashing(hdnode.privateKey);
    const starkPair = ec.getKeyPair(groundKey);
    return { starkPair, groundKey };
};

function getBraavos(mnemonic, accountIndex) {
    const { starkPair, groundKey } = getBraavosGroundKey(mnemonic, accountIndex);
    const starkKeyPub = ec.getStarkKey(starkPair);
    const accountClassHash = "1390726910323976264396851446996494490757233897803493337751952271375342730526";
    const INITIALIZER_SELECTOR = "0x2dd76e7ad84dbed81c314ffe5e7a7cacfb8f4836f01af4e913f275f89a3de1a"
    const accountConstructorCallData = stark.compileCalldata(
        {
            implementation_address: "0x5aa23d5bb71ddaa783da7ea79d405315bafa7cf0387a74f4593578c3e9e6570",
            initializer_selector: INITIALIZER_SELECTOR,
            calldata: [starkKeyPub]
        }
    );
    const contractAddress = hash.calculateContractAddressFromHash(
        starkKeyPub,
        accountClassHash,
        accountConstructorCallData,
        0
    );
    return { address: getChecksumAddress(contractAddress), privateKey: groundKey };
};

(async () => {
    //这里是调用示例
    //实际使用前请在钱包插件中多验证几个生成的钱包，没问题后再批量使用，尽量做小额交互，避免意外出现的损失

    //生成12个助记词
    const mnemonic = utils.entropyToMnemonic(utils.randomBytes(16));
    //打印助记词到控制台
    console.log(mnemonic);

    //注意：argentx和braavos的钱包不能使用同样的助记词开户，否则在钱包中导入助记词时，会出现无法使用的提示，我这里只做演示，所以两个钱包就同时用一个助记词了

    //生成argentx钱包的第一个钱包地址，0代表第一个，1代表第二个，依此类推
    console.log(getArgentX(mnemonic, 0));

    //生成braavos钱包的第一个钱包地址，0代表第一个，1代表第二个，依此类推
    console.log(getBraavos(mnemonic, 0));

})();

module.exports = { getArgentX, getBraavos };