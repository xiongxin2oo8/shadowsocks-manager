const app = angular.module('app');
const window = require('window');
const cdn = window.cdn || '';

app.factory('qrcodeDialog', ['$mdDialog', ($mdDialog) => {
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
    templateUrl: `${cdn}/public/views/user/qrcodeDialog.html`,
    escapeToClose: false,
    locals: { bind: publicInfo },
    bindToController: true,
    controller: ['$scope', '$mdDialog', '$mdMedia', 'bind', '$mdToast', function ($scope, $mdDialog, $mdMedia, bind, $mdToast) {
      $scope.publicInfo = bind;
      // $scope.setDialogWidth = () => {
      //   if($mdMedia('xs') || $mdMedia('sm')) {
      //     return {};
      //   }
      //   return { 'min-width': '400px' };
      // };
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
  const show = (serverName, ssAddress, ssrAddress) => {
    if (isDialogShow()) {
      return dialogPromise;
    }
    publicInfo.serverName = serverName;
    publicInfo.ssAddress = ssAddress;
    publicInfo.ssrAddress = ssrAddress;
    dialogPromise = $mdDialog.show(dialog);
    return dialogPromise;
  };
  return {
    show,
  };
}]);