const app = angular.module('app');
const window = require('window');
const cdn = window.cdn || '';

app.factory('subscribeDialog', ['$mdDialog', '$http', ($mdDialog, $http) => {
  const publicInfo = { linkType: 'shadowrocket', ip: '0', flow: '1', port: '0' };
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
  const getSubscribe = () => {
    return $http.get(`/api/user/account/${publicInfo.accountId}/subscribe`);
  };
  publicInfo.getSubscribe = getSubscribe;
  const updateSubscribe = () => {
    return $http.put(`/api/user/account/${publicInfo.accountId}/subscribe`);
  };
  publicInfo.updateSubscribe = updateSubscribe;
  let dialogPromise = null;
  const isDialogShow = () => {
    if (dialogPromise && !dialogPromise.$$state.status) {
      return true;
    }
    return false;
  };
  const dialog = {
    templateUrl: `${cdn}/public/views/dialog/subscribe.html`,
    escapeToClose: false,
    locals: { bind: publicInfo },
    bindToController: true,
    controller: ['$scope', '$mdMedia', '$mdDialog', 'bind', 'configManager', '$mdToast', function ($scope, $mdMedia, $mdDialog, bind, configManager, $mdToast) {
      $scope.publicInfo = bind;
      $scope.publicInfo.types = [];
      const config = configManager.getConfig();
      const rss = config.rss || `${config.site}/api/user/account/subscribe`;
      $scope.hideFlow = config.hideFlow;
      $scope.publicInfo.flow = 1;
      $scope.connType = '';
      const changeType = (flag) => {
        if (publicInfo.linkType == 'ssr') {
          if (flag == 1) {
            $scope.publicInfo.app = 'shadowrocket';
          }
          $scope.publicInfo.apps = [
            { code: 'shadowrocket', name: 'Shadowrocket' },
            { code: 'quan', name: 'Quan' },
            { code: 'ssr', name: 'SSR' }
          ];
        }
        if (publicInfo.linkType == 'ss') {
          $scope.publicInfo.apps = [
            { code: 'shadowrocket', name: 'Shadowrocket' },
            { code: 'quan', name: 'Quan' },
            { code: 'ssd', name: 'ssd' },
            { code: 'v2rayng', name: 'V2RayN(G)' },
            { code: 'clash', name: 'Clash(X)' }
          ];
        }
        if (publicInfo.linkType == 'v2ray') {
          if (flag == 1) {
            $scope.publicInfo.app = 'shadowrocket';
          }
          $scope.publicInfo.apps = [
            { code: 'shadowrocket', name: 'Shadowrocket' },
            { code: 'quan', name: 'Quan' },
            { code: 'quanx', name: 'QuanX' },
            { code: 'clash', name: 'Clash(X)' },
            //{ code: 'v2rayng', name: 'V2RayN(G)' }
            { code: '标准链接', name: 'Kitsunebi' }
          ];
        }
      }
      $scope.publicInfo.getSubscribe().then(success => {
        $scope.connType = success.data.connType;
        publicInfo.linkType = 'v2ray';
        $scope.publicInfo.app = 'shadowrocket';
        $scope.publicInfo.types = ['v2ray'];
        // if (success.data.connType == "SSR") {
        //   publicInfo.linkType = 'ssr';
        //   $scope.publicInfo.app = 'ssr';
        //   $scope.publicInfo.types = [
        //     'ssr', 'v2ray'
        //   ];
        // } else {
        //   publicInfo.linkType = 'ss';
        //   $scope.publicInfo.app = 'shadowrocket';
        //   $scope.publicInfo.types = [
        //     'ss', 'v2ray'
        //   ];
        // }
        changeType();
        $scope.publicInfo.token = success.data.subscribe;
        $scope.publicInfo.subscribeLink = `${rss}/${$scope.publicInfo.token}?type=${$scope.publicInfo.linkType}&app=${$scope.publicInfo.app}&ip=${$scope.publicInfo.ip}&flow=${$scope.publicInfo.flow}&port=${$scope.publicInfo.port}`;
      });

      $scope.changeLinkType = (flag) => {
        changeType(flag);
        $scope.publicInfo.subscribeLink = `${rss}/${$scope.publicInfo.token}?type=${$scope.publicInfo.linkType}&app=${$scope.publicInfo.app}&ip=${$scope.publicInfo.ip}&flow=${$scope.publicInfo.flow}&port=${$scope.publicInfo.port}`;
      };
      $scope.publicInfo.updateLink = () => {
        $scope.publicInfo.updateSubscribe().then(success => {
          $scope.publicInfo.token = success.data.subscribe;
          $scope.publicInfo.subscribeLink = `${rss}/${$scope.publicInfo.token}?type=${$scope.publicInfo.linkType}&app=${$scope.publicInfo.app}&ip=${$scope.publicInfo.ip}&flow=${$scope.publicInfo.flow}&port=${$scope.publicInfo.port}`;
        });
      };
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
  const show = accountId => {
    if (isDialogShow()) {
      return dialogPromise;
    }
    publicInfo.accountId = accountId;
    dialogPromise = $mdDialog.show(dialog);
    return dialogPromise;
  };
  return {
    show,
  };
}]);
