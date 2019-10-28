const app = angular.module('app');
const window = require('window');
const cdn = window.cdn || '';

app.factory('accountServerDialog', ['$mdDialog', '$http', ($mdDialog, $http) => {
    const publicInfo = {};
    const hide = () => {
        return $mdDialog.hide()
            .then(success => {
                dialogPromise = null;
                return;
            }).catch(err => {
                dialogPromise = null;
                return;
            });
    };
    publicInfo.hide = hide;
    let dialogPromise = null;
    const isDialogShow = () => {
        if (dialogPromise && !dialogPromise.$$state.status) {
            return true;
        }
        return false;
    };

    const dialog = {
        templateUrl: `${cdn}/public/views/dialog/accountServerDetail.html`,
        escapeToClose: false,
        locals: { bind: publicInfo },
        bindToController: true,
        controller: ['$scope', '$mdMedia', '$mdDialog', 'bind', 'configManager', '$mdToast', function ($scope, $mdMedia, $mdDialog, bind, configManager, $mdToast) {
            $scope.hide = bind.hide;
            $scope.account = bind.account;
            $scope.server = bind.account.serverInfo;
            $scope.singleAccounts = bind.singleAccounts;
            //$scope.server.isWG = bind.account.serverInfo.type === 'WireGuard'
            const config = configManager.getConfig();
            $scope.config = config;


            const base64Encode = str => {
                return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
                    return String.fromCharCode('0x' + p1);
                }));
            };
            const urlsafeBase64 = str => {
                return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            };
            const account = $scope.account;
            const server = $scope.server;
            const singleAccounts = $scope.singleAccounts;            
            let sa = {};
            if (singleAccounts) {
                sa=singleAccounts[0];
            }
            $scope.sa=sa;
            const ssLink = () => {
                if (!server) { return ''; }
                if (server.type === 'WireGuard') {
                    const a = account.port % 254;
                    const b = (account.port - a) / 254;
                    return [
                        '[Interface]',
                        `Address = ${server.net.split('.')[0]}.${server.net.split('.')[1]}.${b}.${a + 1}/32`,
                        `PrivateKey = ${account.privateKey}`,
                        'DNS = 8.8.8.8',
                        '[Peer]',
                        `PublicKey = ${server.key}`,
                        `Endpoint = ${server.host}:${server.wgPort}`,
                        `AllowedIPs = 0.0.0.0/0`,
                    ].join('\n');
                } else if (account.connType == "SSR") {
                    //单端口模式
                    if ((config.singleMode == 'ssr1port' || server.singleMode == 'ssr1port') && singleAccounts) {
                        let sa = singleAccounts[0];
                        return 'ssr://' + urlsafeBase64(server.host + ':' + (sa.port) + ':' + sa.protocol + ':' + sa.method + ':' + sa.obfs + ':' + urlsafeBase64(sa.password) + '/?obfsparam=' + (sa.obfs_param ? urlsafeBase64(sa.obfs_param) : '') + '&protoparam=' + urlsafeBase64(account.id  + ':' + account.password) + '&remarks=' + urlsafeBase64((server.comment || '这里显示备注') + ' - ' + sa.port));
                    } else {
                        return 'ssr://' + urlsafeBase64(server.host + ':' + (account.port + server.shift) + ':' + account.protocol + ':' + account.method + ':' + account.obfs + ':' + urlsafeBase64(account.password) + '/?obfsparam=' + (account.obfs_param ? urlsafeBase64(account.obfs_param) : '') + '&protoparam=&remarks=' + urlsafeBase64(server.comment || '这里显示备注'));
                    }
                } else {
                    return 'ss://' + base64Encode(server.method + ':' + account.password + '@' + server.host + ':' + (account.port + server.shift)) + '#' + encodeURIComponent(server.comment);
                }
            };
            const method = ['aes-256-gcm', 'chacha20-ietf-poly1305', 'aes-128-gcm', 'aes-192-gcm', 'xchacha20-ietf-poly1305'];
            const ssrLink = () => {
                if (!server) { return ''; }
                let str = '';
                if (account.connType == "SSR") {
                    //单端口模式
                    if ((config.singleMode == 'ssr1port' || server.singleMode == 'ssr1port') && singleAccounts) {
                        return 'ssr://' + urlsafeBase64(server.host + ':' + (sa.port) + ':' + sa.protocol + ':' + sa.method + ':' + sa.obfs + ':' + urlsafeBase64(sa.password) + '/?obfsparam=' + (sa.obfs_param ? urlsafeBase64(sa.obfs_param) : '') + '&protoparam=' + urlsafeBase64(account.id + ':' + account.password) + '&remarks=' + urlsafeBase64((server.comment || '这里显示备注') + ' - ' + sa.port));
                    } else {
                        return 'ssr://' + urlsafeBase64(server.host + ':' + (account.port + server.shift) + ':' + account.protocol + ':' + account.method + ':' + account.obfs + ':' + urlsafeBase64(account.password) + '/?obfsparam=' + (account.obfs_param ? urlsafeBase64(account.obfs_param) : '') + '&protoparam=&remarks=' + urlsafeBase64(server.comment || '这里显示备注'));
                        //' + (account.protocol_param ? urlsafeBase64(account.protocol_param) : '') + '
                    }
                } else {
                    let index = method.indexOf(server.method);
                    if (index != -1) {
                        return "";
                    }
                    str = 'ssr://' + urlsafeBase64(server.host + ':' + account.port + ':origin:' + server.method + ':plain:' + urlsafeBase64(account.password) + '/?obfsparam=&remarks=' + urlsafeBase64(server.comment));
                }
                return str;
            };
            $scope.ssrLink = ssrLink();
            $scope.ssLink = ssLink();

            $scope.toast = () => {
                $mdToast.show(
                    $mdToast.simple()
                        .textContent('链接已复制到剪贴板')
                        .position('top right')
                        .hideDelay(3000)
                );
            };
        }],
        fullscreen: false,
        clickOutsideToClose: true,
    };
    const show = (account, singleAccounts) => {
        if (isDialogShow()) {
            return dialogPromise;
        }
        publicInfo.account = account;
        publicInfo.singleAccounts = singleAccounts;
        dialogPromise = $mdDialog.show(dialog);
        return dialogPromise;
    };
    return {
        show,
        hide
    };
}]);
