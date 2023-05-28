const request = require('request');
const fs = require('fs');

function json2Obj(json) {
    try {
        return JSON.parse(json);
    } catch (error) {
        return null;
    }
};

function isEmpty(str) {
    return str === undefined || str === null || (typeof str === 'string' && str.trim() === '');
};

function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        request(url, options, function (error, response, body) {
            resolve({ error, response, body });
        });
    });
};

function sleep(time) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, time);
    });
};

function wait(fn, timeout, interval = 500) {
    return new Promise(async (resolve, reject) => {
        const start_ts = new Date().getTime();
        (async function loop() {
            try {
                const result = await fn();
                if (result === true) {
                    resolve();
                } else {
                    if (timeout && (new Date().getTime() - start_ts) > timeout) {
                        reject({ code: 1, msg: 'timeout' });
                    } else {
                        await sleep(interval);
                        loop();
                    }
                }
            } catch (error) {
                log(`wait error`, error);
                reject({ code: -1, error });
            }
        })();
    });
};

module.exports = {
    json2Obj,
    isEmpty,
    fs,
    fetch,
    sleep,
    wait,
}