//检查动态ip使用
const cron = appRequire('init/cron');
const http = require('http');
var ip = '';
const httpRequest = (method, data, url) => {
    return new Promise((resolve, reject) => {
        var options = {
            method: method,
            host: 'httpbin.org', //域名
            path: '/ip', //资源地址
            form: data,
            headers: {
                "content-type": "application/json"
            }
        };
        var req = http.request(options, (res) => {
            res.setEncoding('utf8');
            res.on('data', (data) => {
                return resolve(data);
            });
        })
        req.on('error', function (err) {
            //失败后调用
            return reject(err);
        });
        req.end();
    });
}
const get = (url, data) => {
    return httpRequest('GET', data, url);
}
const post = (url, data) => {
    return httpRequest('POST', data, url);
}
const getIp = () => {
    let data = get('http://httpbin.org/ip', {}).then(data => JSON.parse(data));
    console.log(`ip:${ip} , newip:${data.origin}`);
    if (!ip) {
        ip = data.origin;
    } else if (ip != data.origin) {
        console.log('ip发生变化');
    }
}

cron.minute(() => {
    console.log('每分钟执行一次');
    getIp()
}, 1);