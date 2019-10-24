const app = angular.module('app');
const window = require('window');
const cdn = window.cdn || '';

app.factory('accountInfoDialog', ['$mdDialog', '$http', ($mdDialog, $http) => {
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
        templateUrl: `${cdn}/public/views/user/accountInfo.html`,
        escapeToClose: false,
        locals: { bind: publicInfo },
        bindToController: true,
        controller: ['$scope', '$mdDialog', 'bind', 'configManager', '$mdToast', '$http', function ($scope, $mdDialog, bind, configManager, $mdToast, $http) {
            $scope.hide = bind.hide;
            $scope.account = bind.account;
            const config = configManager.getConfig();
            $scope.config = config;
            if (config.hideFlow && accountInfo.data.flow < 100 * 1000 * 1000 * 1000) {
                $scope.account.hideFlow = true;
            }
            $scope.account.ip = config.ip;
            const getIpInfo = ip => {
                const url = `/api/user/account/ip/${ip}`;
                return $http.get(url).then(success => success.data);
            }
            if (config.ip === '127.0.0.1') {
                $scope.account.ipInfo = ['本机', '地址']
            } else {
                getIpInfo($scope.account.ip).then(success => {
                    $scope.account.ipInfo = success
                });
            }
            $http.get(`/api/user/account/${$scope.account.id}/aliveIps`).then(success => {
                console.log(success);
                $scope.aliveIps = success.data.alive_ips;
                $scope.subIps = success.data.sub_ips;
                if ($scope.aliveIps.length < 6) {
                    for (const item of $scope.aliveIps) {
                        console.log(item);
                        getIpInfo(item.ip).then(success => {
                            item.info = success;
                        });
                    }
                }
                for (const item of $scope.subIps) {
                    getIpInfo(item.ip).then(success => {
                        item.info = success;
                    });
                }
            });
        }],
        fullscreen: false,
        clickOutsideToClose: true,
    };
    const show = (account) => {
        if (isDialogShow()) {
            return dialogPromise;
        }
        publicInfo.account = account;
        dialogPromise = $mdDialog.show(dialog);
        return dialogPromise;
    };
    return {
        show,
        hide
    };
}]);
